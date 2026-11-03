import "types"

contract MarketplaceV2 {
    author: "TON Market"
    version: "2.0.0"
    description: "Marketplace V2 escrow-backed purchase, delivery, refund and split settlement"
    storage: MarketplaceV2Storage
    incomingMessages: MarketplaceV2AllowedMessage
}

type MarketplaceV2AllowedMessage =
    | SetMarketplaceV2Escrow
    | SetMarketplaceV2Treasury
    | PublishProductV2
    | BuyProductV2
    | DispatchPayoutV2
    | CancelProductV2
    | EscrowDepositedV2
    | EscrowReleasedV2
    | EscrowReleaseFailedV2
    | EscrowRefundedV2

fun onInternalMessage(in: InMessage) {
    var storage = lazy MarketplaceV2Storage.load();
    var listingMaps = storage.listingMaps.load();
    var orderMaps = storage.orderMaps.load();
    val msg = lazy MarketplaceV2AllowedMessage.fromSlice(in.body);

    match (msg) {
        SetMarketplaceV2Escrow => {
            assert (in.senderAddress == storage.owner) throw ErrorsV2.NotOwner;
            // Bind the V2 Escrow once. Rotating it after listings exist would strand
            // callbacks and split custody authority across two contract addresses.
            assert (!storage.escrowConfigured) throw ErrorsV2.InvalidRelease;
            storage.escrow = msg.escrow;
            storage.escrowConfigured = true;
            storage.listingMaps = listingMaps.toCell();
            storage.orderMaps = orderMaps.toCell();
            storage.save();
        }

        SetMarketplaceV2Treasury => {
            assert (in.senderAddress == storage.owner) throw ErrorsV2.NotOwner;
            var config = storage.config.load();
            assert (!config.treasuryConfigured) throw ErrorsV2.InvalidTreasury;
            assert (msg.treasury != contract.getAddress()) throw ErrorsV2.InvalidTreasury;
            config.treasury = msg.treasury;
            config.treasuryConfigured = true;
            storage.config = config.toCell();
            storage.listingMaps = listingMaps.toCell();
            storage.orderMaps = orderMaps.toCell();
            storage.save();
        }

        BuyProductV2 => {
            val config = storage.config.load();
            assert (storage.escrowConfigured && config.treasuryConfigured) throw ErrorsV2.InvalidPurchase;

            val productResult = listingMaps.products.get(msg.productId);
            assert (productResult.isFound) throw ErrorsV2.InvalidPurchase;
            var product = MarketplaceV2Product.fromCell(productResult.loadValue());
            assert (product.status == 2) throw ErrorsV2.InvalidPurchase;
            assert (in.senderAddress != product.seller) throw ErrorsV2.InvalidPurchase;

            // The buyer must attach the exact listing price plus a fixed processing
            // reserve. This prevents underfunded delivery/refund/payout actions and
            // avoids silently retaining arbitrary overpayments.
            val processingReserve = grams("0.5");
            assert (in.valueCoins == product.price + processingReserve) throw ErrorsV2.InsufficientPayment;

            val orderId = storage.nextOrderId;
            val queryBase = storage.nextQueryId;
            val operationBase = storage.nextOperationId;
            assert (orderId > 0 && queryBase > 0 && operationBase > 0) throw ErrorsV2.InvalidPurchase;

            val amounts = calculateSettlementAmounts(product.price);
            val operations = MarketplaceV2OrderOperations {
                paymentQueryId: queryBase,
                releaseQueryId: queryBase + 1,
                sellerPayoutQueryId: queryBase + 2,
                platformPayoutQueryId: queryBase + 3,
                buyerRefundQueryId: queryBase + 4,
                sellerReturnQueryId: queryBase + 5,
                sellerPayoutOperationId: operationBase,
                platformPayoutOperationId: operationBase + 1,
                buyerRefundOperationId: operationBase + 2,
            };
            val order = MarketplaceV2Order {
                id: orderId,
                productId: product.id,
                status: MarketplaceV2OrderStatus.DeliveryPending,
                deliveryStatus: MarketplaceV2DeliveryStatus.Pending,
                sellerPayoutStatus: MarketplaceV2PayoutStatus.NotCreated,
                platformPayoutStatus: MarketplaceV2PayoutStatus.NotCreated,
                refundStatus: MarketplaceV2RefundStatus.None,
                createdAt: in.createdAt,
                extra: MarketplaceV2OrderExtra {
                    parties: MarketplaceV2OrderParties {
                        buyer: in.senderAddress,
                        seller: product.seller,
                        treasury: config.treasury,
                    }.toCell(),
                    asset: MarketplaceV2OrderAsset {
                        nftItem: product.nftItem,
                        collection: product.extra.load().collection,
                        itemIndex: product.extra.load().itemIndex,
                        escrowId: product.escrowId,
                    }.toCell(),
                    settlement: MarketplaceV2OrderSettlement {
                        gross: product.price,
                        feeBps: 300,
                        feeRoundingVersion: 1,
                        platformFee: amounts.platformFee,
                        sellerProceeds: amounts.sellerAmount,
                        processingReserve,
                    }.toCell(),
                    operations: operations.toCell(),
                }.toCell(),
            };

            // Reserve the listing before requesting NFT release. A second buyer
            // can never create a competing order for this escrowed asset.
            product.status = 3;
            listingMaps.products.set(product.id, product.toCell());
            orderMaps.orders.set(orderId, order.toCell());
            orderMaps.releaseQueryToOrder.set(operations.releaseQueryId, orderId);
            storage.nextOrderId = orderId + 1;
            storage.nextQueryId = queryBase + 6;
            storage.nextOperationId = operationBase + 3;
            storage.listingMaps = listingMaps.toCell();
            storage.orderMaps = orderMaps.toCell();
            storage.save();

            val release = createMessage({
                bounce: BounceMode.RichBounce,
                value: grams("0.08"),
                dest: storage.escrow,
                body: ReleaseEscrowV2 {
                    orderId,
                    productId: product.id,
                    escrowId: product.escrowId,
                    queryId: operations.releaseQueryId,
                    buyer: in.senderAddress,
                },
            });
            release.send(SEND_MODE_PAY_FEES_SEPARATELY);
        }

        DispatchPayoutV2 => {
            val payoutResult = orderMaps.payouts.get(msg.operationId);
            assert (payoutResult.isFound) throw ErrorsV2.InvalidPayout;
            var payout = MarketplaceV2Payout.fromCell(payoutResult.loadValue());
            assert (
                payout.status == MarketplaceV2PayoutStatus.Pending ||
                payout.status == MarketplaceV2PayoutStatus.Bounced
            ) throw ErrorsV2.InvalidPayout;

            val orderResult = orderMaps.orders.get(payout.orderId);
            assert (orderResult.isFound) throw ErrorsV2.OrderNotFound;
            var order = MarketplaceV2Order.fromCell(orderResult.loadValue());
            var orderExtra = order.extra.load();
            val operations = orderExtra.operations.load();

            if (payout.kind == 1) {
                assert (payout.operationId == operations.sellerPayoutOperationId) throw ErrorsV2.InvalidPayout;
                assert (payout.queryId == operations.sellerPayoutQueryId) throw ErrorsV2.InvalidPayout;
                assert (
                    payout.status == MarketplaceV2PayoutStatus.Pending ||
                    payout.status == MarketplaceV2PayoutStatus.Bounced
                ) throw ErrorsV2.InvalidPayout;
                order.sellerPayoutStatus = MarketplaceV2PayoutStatus.Dispatched;
                val transfer = createMessage({
                    bounce: BounceMode.RichBounce,
                    value: payout.amount,
                    dest: payout.beneficiary,
                    body: SellerPayoutV2 {
                        orderId: payout.orderId,
                        operationId: payout.operationId,
                        queryId: payout.queryId,
                        beneficiary: payout.beneficiary,
                        amount: payout.amount,
                    },
                });
                payout.status = MarketplaceV2PayoutStatus.Dispatched;
                orderMaps.payouts.set(payout.operationId, payout.toCell());
                if (
                    order.sellerPayoutStatus == MarketplaceV2PayoutStatus.Dispatched &&
                    order.platformPayoutStatus == MarketplaceV2PayoutStatus.Dispatched
                ) {
                    order.status = MarketplaceV2OrderStatus.PayoutsDispatched;
                }
                orderMaps.orders.set(order.id, order.toCell());
                storage.listingMaps = listingMaps.toCell();
            storage.orderMaps = orderMaps.toCell();
            storage.save();
                transfer.send(SEND_MODE_PAY_FEES_SEPARATELY);
            } else if (payout.kind == 2) {
                assert (payout.operationId == operations.platformPayoutOperationId) throw ErrorsV2.InvalidPayout;
                assert (payout.queryId == operations.platformPayoutQueryId) throw ErrorsV2.InvalidPayout;
                order.platformPayoutStatus = MarketplaceV2PayoutStatus.Dispatched;
                val transfer = createMessage({
                    bounce: BounceMode.RichBounce,
                    value: payout.amount,
                    dest: payout.beneficiary,
                    body: PlatformPayoutV2 {
                        orderId: payout.orderId,
                        operationId: payout.operationId,
                        queryId: payout.queryId,
                        beneficiary: payout.beneficiary,
                        amount: payout.amount,
                    },
                });
                payout.status = MarketplaceV2PayoutStatus.Dispatched;
                orderMaps.payouts.set(payout.operationId, payout.toCell());
                if (
                    order.sellerPayoutStatus == MarketplaceV2PayoutStatus.Dispatched &&
                    order.platformPayoutStatus == MarketplaceV2PayoutStatus.Dispatched
                ) {
                    order.status = MarketplaceV2OrderStatus.PayoutsDispatched;
                }
                orderMaps.orders.set(order.id, order.toCell());
                storage.listingMaps = listingMaps.toCell();
            storage.orderMaps = orderMaps.toCell();
            storage.save();
                transfer.send(SEND_MODE_PAY_FEES_SEPARATELY);
            } else if (payout.kind == 3) {
                assert (payout.operationId == operations.buyerRefundOperationId) throw ErrorsV2.InvalidPayout;
                assert (payout.queryId == operations.buyerRefundQueryId) throw ErrorsV2.InvalidPayout;
                assert (
                    order.status == MarketplaceV2OrderStatus.RefundPending ||
                    order.status == MarketplaceV2OrderStatus.RefundDispatched
                ) throw ErrorsV2.InvalidPayout;
                order.refundStatus = MarketplaceV2RefundStatus.Dispatched;
                val productResult = listingMaps.products.get(order.productId);
                assert (productResult.isFound) throw ErrorsV2.InvalidPayout;
                val product = MarketplaceV2Product.fromCell(productResult.loadValue());
                if (product.status == 5) {
                    order.status = MarketplaceV2OrderStatus.RefundDispatched;
                }
                val transfer = createMessage({
                    bounce: BounceMode.RichBounce,
                    value: payout.amount,
                    dest: payout.beneficiary,
                    body: BuyerRefundV2 {
                        orderId: payout.orderId,
                        operationId: payout.operationId,
                        queryId: payout.queryId,
                        beneficiary: payout.beneficiary,
                        amount: payout.amount,
                    },
                });
                payout.status = MarketplaceV2PayoutStatus.Dispatched;
                orderMaps.payouts.set(payout.operationId, payout.toCell());
                orderMaps.orders.set(order.id, order.toCell());
                storage.listingMaps = listingMaps.toCell();
            storage.orderMaps = orderMaps.toCell();
            storage.save();
                transfer.send(SEND_MODE_PAY_FEES_SEPARATELY);
            } else {
                throw ErrorsV2.InvalidPayout;
            }
        }

        PublishProductV2 => {
            assert (storage.escrowConfigured) throw ErrorsV2.InvalidRelease;
            assert (msg.price > 0) throw ErrorsV2.InvalidRelease;
            assert (msg.kind == 3) throw ErrorsV2.InvalidRelease;

            // Reserve the NFT Item before asking Escrow to create its custody record.
            val existing = listingMaps.assetListings.get(msg.nftItem);
            assert (!existing.isFound) throw ErrorsV2.AssetAlreadyEscrowed;

            val productId = storage.nextProductId;
            val queryId = storage.nextQueryId;
            assert (productId > 0 && queryId > 0) throw ErrorsV2.InvalidRelease;

            val product = MarketplaceV2Product {
                id: productId,
                seller: in.senderAddress,
                nftItem: msg.nftItem,
                price: msg.price,
                escrowId: 0,
                queryId,
                refundQueryId: 0,
                status: 1,
                createdAt: in.createdAt,
                extra: MarketplaceV2ProductExtra {
                    collection: msg.collection,
                    itemIndex: msg.itemIndex,
                    kind: msg.kind,
                }.toCell(),
            };

            listingMaps.products.set(productId, product.toCell());
            listingMaps.assetListings.set(msg.nftItem, productId);
            listingMaps.queryToProduct.set(queryId, productId);
            storage.nextProductId = productId + 1;
            storage.nextQueryId = queryId + 1;
            storage.listingMaps = listingMaps.toCell();
            storage.orderMaps = orderMaps.toCell();
            storage.save();

            val createEscrow = createMessage({
                bounce: BounceMode.RichBounce,
                value: grams("0.05"),
                dest: storage.escrow,
                body: CreateEscrowV2 {
                    productId,
                    nftItem: msg.nftItem,
                    collection: msg.collection,
                    seller: in.senderAddress,
                    queryId,
                    extra: CreateEscrowV2Extra {
                        itemIndex: msg.itemIndex,
                        kind: msg.kind,
                    }.toCell(),
                },
            });
            createEscrow.send(SEND_MODE_REGULAR);
        }

        CancelProductV2 => {
            assert (storage.escrowConfigured) throw ErrorsV2.InvalidRefund;
            val productResult = listingMaps.products.get(msg.productId);
            assert (productResult.isFound) throw ErrorsV2.InvalidRefund;
            var product = MarketplaceV2Product.fromCell(productResult.loadValue());
            assert (
                in.senderAddress == product.seller || in.senderAddress == storage.owner
            ) throw ErrorsV2.InvalidRefund;

            var queryId: uint64 = 0;
            if (product.status == 2) {
                queryId = storage.nextQueryId;
                assert (queryId > 0) throw ErrorsV2.InvalidRefund;
                val existingQuery = listingMaps.refundQueryToProduct.get(queryId);
                assert (!existingQuery.isFound) throw ErrorsV2.InvalidRefund;

                product.status = 6;
                product.refundQueryId = queryId;
                listingMaps.products.set(msg.productId, product.toCell());
                listingMaps.refundQueryToProduct.set(queryId, msg.productId);
                storage.nextQueryId = queryId + 1;
                storage.listingMaps = listingMaps.toCell();
            storage.orderMaps = orderMaps.toCell();
            storage.save();
            } else {
                // A seller can retry the exact same refund query after Escrow
                // reports a correlated NFT transfer bounce and restores Deposited.
                assert (product.status == 6) throw ErrorsV2.InvalidRefund;
                queryId = product.refundQueryId;
                assert (queryId > 0) throw ErrorsV2.InvalidRefund;
                val queryResult = listingMaps.refundQueryToProduct.get(queryId);
                assert (
                    queryResult.isFound && queryResult.loadValue() == msg.productId
                ) throw ErrorsV2.InvalidRefund;
            }

            val refundMessage = createMessage({
                bounce: BounceMode.RichBounce,
                value: grams("0.05"),
                dest: storage.escrow,
                body: RefundEscrowV2 {
                    escrowId: product.escrowId,
                    productId: product.id,
                    queryId,
                    seller: product.seller,
                },
            });
            refundMessage.send(SEND_MODE_REGULAR);
        }

        EscrowReleasedV2 => {
            assert (storage.escrowConfigured) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (in.senderAddress == storage.escrow) throw ErrorsV2.InvalidReleaseConfirmation;

            val orderIdResult = orderMaps.releaseQueryToOrder.get(msg.queryId);
            assert (orderIdResult.isFound) throw ErrorsV2.InvalidReleaseConfirmation;
            val orderId = orderIdResult.loadValue();
            assert (orderId == msg.orderId) throw ErrorsV2.InvalidReleaseConfirmation;
            val orderResult = orderMaps.orders.get(orderId);
            assert (orderResult.isFound) throw ErrorsV2.OrderNotFound;
            var order = MarketplaceV2Order.fromCell(orderResult.loadValue());
            var orderExtra = order.extra.load();
            val parties = orderExtra.parties.load();
            val asset = orderExtra.asset.load();
            val operations = orderExtra.operations.load();
            val settlement = orderExtra.settlement.load();

            assert (order.productId == msg.productId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (operations.releaseQueryId == msg.queryId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (asset.escrowId == msg.escrowId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (asset.nftItem == msg.nftItem) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (parties.buyer == msg.buyer) throw ErrorsV2.InvalidReleaseConfirmation;

            if (order.status == MarketplaceV2OrderStatus.DeliveryPending) {
                order.deliveryStatus = MarketplaceV2DeliveryStatus.Confirmed;
                order.status = MarketplaceV2OrderStatus.SettlementPending;
                order.sellerPayoutStatus = MarketplaceV2PayoutStatus.Pending;
                order.platformPayoutStatus = MarketplaceV2PayoutStatus.Pending;
                if (settlement.platformFee == 0) {
                    order.platformPayoutStatus = MarketplaceV2PayoutStatus.Dispatched;
                }

                val sellerPayout = MarketplaceV2Payout {
                    orderId,
                    operationId: operations.sellerPayoutOperationId,
                    queryId: operations.sellerPayoutQueryId,
                    beneficiary: parties.seller,
                    amount: settlement.sellerProceeds,
                    kind: 1,
                    status: MarketplaceV2PayoutStatus.Pending,
                    createdAt: in.createdAt,
                };
                val platformPayout = MarketplaceV2Payout {
                    orderId,
                    operationId: operations.platformPayoutOperationId,
                    queryId: operations.platformPayoutQueryId,
                    beneficiary: parties.treasury,
                    amount: settlement.platformFee,
                    kind: 2,
                    status: MarketplaceV2PayoutStatus.Pending,
                    createdAt: in.createdAt,
                };
                assert (settlement.sellerProceeds > 0) throw ErrorsV2.InvalidPayout;

                orderMaps.payouts.set(sellerPayout.operationId, sellerPayout.toCell());
                if (settlement.platformFee > 0) {
                    orderMaps.payouts.set(platformPayout.operationId, platformPayout.toCell());
                }

                val productResult = listingMaps.products.get(order.productId);
                assert (productResult.isFound) throw ErrorsV2.InvalidReleaseConfirmation;
                var product = MarketplaceV2Product.fromCell(productResult.loadValue());
                assert (product.status == 3) throw ErrorsV2.InvalidReleaseConfirmation;
                assert (product.seller == parties.seller) throw ErrorsV2.InvalidReleaseConfirmation;
                assert (product.nftItem == asset.nftItem) throw ErrorsV2.InvalidReleaseConfirmation;
                product.status = 4;
                listingMaps.products.set(product.id, product.toCell());
                orderMaps.orders.set(orderId, order.toCell());
                storage.listingMaps = listingMaps.toCell();
            storage.orderMaps = orderMaps.toCell();
            storage.save();
            } else {
                // An exact duplicate success callback is re-ACKed, but it never
                // creates another payout liability or repeats the NFT transfer.
                assert (
                    order.status == MarketplaceV2OrderStatus.SettlementPending ||
                    order.status == MarketplaceV2OrderStatus.PayoutsDispatched
                ) throw ErrorsV2.InvalidReleaseConfirmation;
            }

            val ack = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: grams("0.03"),
                dest: storage.escrow,
                body: EscrowReleaseAckV2 {
                    orderId: msg.orderId,
                    productId: msg.productId,
                    escrowId: msg.escrowId,
                    queryId: msg.queryId,
                    nftItem: msg.nftItem,
                    buyer: msg.buyer,
                },
            });
            ack.send(SEND_MODE_REGULAR);
        }

        EscrowDepositedV2 => {
            assert (storage.escrowConfigured) throw ErrorsV2.InvalidRelease;
            assert (in.senderAddress == storage.escrow) throw ErrorsV2.InvalidReleaseConfirmation;

            val queryResult = listingMaps.queryToProduct.get(msg.queryId);
            assert (queryResult.isFound) throw ErrorsV2.InvalidReleaseConfirmation;
            val productId = queryResult.loadValue();
            assert (productId == msg.productId) throw ErrorsV2.InvalidReleaseConfirmation;

            val productResult = listingMaps.products.get(productId);
            assert (productResult.isFound) throw ErrorsV2.InvalidReleaseConfirmation;
            var product = MarketplaceV2Product.fromCell(productResult.loadValue());

            assert (product.id == msg.productId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (product.queryId == msg.queryId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (product.nftItem == msg.nftItem) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (product.seller == msg.seller) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (msg.escrowId > 0) throw ErrorsV2.InvalidReleaseConfirmation;

            if (product.status == 1) {
                product.escrowId = msg.escrowId;
                product.status = 2;
                listingMaps.products.set(productId, product.toCell());
                storage.listingMaps = listingMaps.toCell();
            storage.orderMaps = orderMaps.toCell();
            storage.save();
            } else {
                // Duplicate callback is idempotent, but only for the exact confirmed escrow.
                assert (product.status == 2) throw ErrorsV2.InvalidReleaseConfirmation;
                assert (product.escrowId == msg.escrowId) throw ErrorsV2.InvalidReleaseConfirmation;
            }

            val ack = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: grams("0.03"),
                dest: storage.escrow,
                body: EscrowDepositAckV2 {
                    escrowId: msg.escrowId,
                    productId: msg.productId,
                    nftItem: msg.nftItem,
                    seller: msg.seller,
                    queryId: msg.queryId,
                },
            });
            ack.send(SEND_MODE_REGULAR);
        }

        EscrowReleaseFailedV2 => {
            assert (storage.escrowConfigured) throw ErrorsV2.InvalidRefund;
            assert (in.senderAddress == storage.escrow) throw ErrorsV2.InvalidRefund;

            val orderIdResult = orderMaps.releaseQueryToOrder.get(msg.queryId);
            assert (orderIdResult.isFound) throw ErrorsV2.InvalidRefund;
            val orderId = orderIdResult.loadValue();
            assert (orderId == msg.orderId) throw ErrorsV2.InvalidRefund;
            val orderResult = orderMaps.orders.get(orderId);
            assert (orderResult.isFound) throw ErrorsV2.OrderNotFound;
            var order = MarketplaceV2Order.fromCell(orderResult.loadValue());
            var orderExtra = order.extra.load();
            val parties = orderExtra.parties.load();
            val asset = orderExtra.asset.load();
            val operations = orderExtra.operations.load();
            val settlement = orderExtra.settlement.load();

            assert (order.productId == msg.productId) throw ErrorsV2.InvalidRefund;
            assert (asset.escrowId == msg.escrowId) throw ErrorsV2.InvalidRefund;
            assert (asset.nftItem == msg.nftItem) throw ErrorsV2.InvalidRefund;
            assert (parties.buyer == msg.buyer) throw ErrorsV2.InvalidRefund;

            if (order.status == MarketplaceV2OrderStatus.DeliveryPending) {
                order.status = MarketplaceV2OrderStatus.RefundPending;
                order.deliveryStatus = MarketplaceV2DeliveryStatus.Bounced;
                order.refundStatus = MarketplaceV2RefundStatus.Pending;

                val buyerRefund = MarketplaceV2Payout {
                    orderId,
                    operationId: operations.buyerRefundOperationId,
                    queryId: operations.buyerRefundQueryId,
                    beneficiary: parties.buyer,
                    amount: settlement.gross,
                    kind: 3,
                    status: MarketplaceV2PayoutStatus.Pending,
                    createdAt: in.createdAt,
                };
                orderMaps.payouts.set(buyerRefund.operationId, buyerRefund.toCell());

                val productResult = listingMaps.products.get(order.productId);
                assert (productResult.isFound) throw ErrorsV2.InvalidRefund;
                var product = MarketplaceV2Product.fromCell(productResult.loadValue());
                assert (product.status == 3) throw ErrorsV2.InvalidRefund;
                assert (product.seller == parties.seller) throw ErrorsV2.InvalidRefund;
                product.status = 6;
                product.refundQueryId = operations.sellerReturnQueryId;
                listingMaps.products.set(product.id, product.toCell());
                listingMaps.refundQueryToProduct.set(operations.sellerReturnQueryId, product.id);
                orderMaps.refundQueryToOrder.set(operations.sellerReturnQueryId, orderId);
                orderMaps.orders.set(orderId, order.toCell());
                storage.listingMaps = listingMaps.toCell();
            storage.orderMaps = orderMaps.toCell();
            storage.save();
            } else {
                assert (
                    order.status == MarketplaceV2OrderStatus.RefundPending ||
                    order.status == MarketplaceV2OrderStatus.RefundDispatched
                ) throw ErrorsV2.InvalidRefund;
            }

            // Exact retries are safe: NFTEscrowV2 accepts the same refund query
            // idempotently while the NFT return is pending, and a returned asset
            // is not sent a second time.
            val productAfterResult = listingMaps.products.get(order.productId);
            assert (productAfterResult.isFound) throw ErrorsV2.InvalidRefund;
            val productAfter = MarketplaceV2Product.fromCell(productAfterResult.loadValue());
            if (productAfter.status == 6) {
                val returnMessage = createMessage({
                    bounce: BounceMode.RichBounce,
                    value: grams("0.05"),
                    dest: storage.escrow,
                    body: RefundEscrowV2 {
                        escrowId: asset.escrowId,
                        productId: order.productId,
                        queryId: operations.sellerReturnQueryId,
                        seller: parties.seller,
                    },
                });
                returnMessage.send(SEND_MODE_PAY_FEES_SEPARATELY);
            }

            val ack = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: grams("0.03"),
                dest: storage.escrow,
                body: EscrowReleaseFailureAckV2 {
                    orderId: msg.orderId,
                    productId: msg.productId,
                    escrowId: msg.escrowId,
                    queryId: msg.queryId,
                    nftItem: msg.nftItem,
                    buyer: msg.buyer,
                },
            });
            ack.send(SEND_MODE_REGULAR);
        }

        EscrowRefundedV2 => {
            assert (storage.escrowConfigured) throw ErrorsV2.InvalidRefund;
            assert (in.senderAddress == storage.escrow) throw ErrorsV2.InvalidRefund;

            val orderIdResult = orderMaps.refundQueryToOrder.get(msg.queryId);
            if (orderIdResult.isFound) {
                val orderId = orderIdResult.loadValue();
                val orderResult = orderMaps.orders.get(orderId);
                assert (orderResult.isFound) throw ErrorsV2.OrderNotFound;
                var order = MarketplaceV2Order.fromCell(orderResult.loadValue());
                var orderExtra = order.extra.load();
                val parties = orderExtra.parties.load();
                val asset = orderExtra.asset.load();
                val operations = orderExtra.operations.load();

                assert (order.productId == msg.productId) throw ErrorsV2.InvalidRefund;
                assert (operations.sellerReturnQueryId == msg.queryId) throw ErrorsV2.InvalidRefund;
                assert (asset.escrowId == msg.escrowId) throw ErrorsV2.InvalidRefund;
                assert (asset.nftItem == msg.nftItem) throw ErrorsV2.InvalidRefund;
                assert (parties.seller == msg.seller) throw ErrorsV2.InvalidRefund;
                assert (
                    order.status == MarketplaceV2OrderStatus.RefundPending ||
                    order.status == MarketplaceV2OrderStatus.RefundDispatched
                ) throw ErrorsV2.InvalidRefund;

                val productResult = listingMaps.products.get(order.productId);
                assert (productResult.isFound) throw ErrorsV2.InvalidRefund;
                var product = MarketplaceV2Product.fromCell(productResult.loadValue());
                assert (product.seller == parties.seller) throw ErrorsV2.InvalidRefund;
                assert (product.nftItem == asset.nftItem) throw ErrorsV2.InvalidRefund;

                if (product.status == 6) {
                    product.status = 5;
                    listingMaps.products.set(product.id, product.toCell());
                    val listingResult = listingMaps.assetListings.get(product.nftItem);
                    if (listingResult.isFound && listingResult.loadValue() == product.id) {
                        listingMaps.assetListings.delete(product.nftItem);
                    }
                    if (order.refundStatus == MarketplaceV2RefundStatus.Dispatched) {
                        order.status = MarketplaceV2OrderStatus.RefundDispatched;
                    }
                    orderMaps.orders.set(order.id, order.toCell());
                    storage.listingMaps = listingMaps.toCell();
            storage.orderMaps = orderMaps.toCell();
            storage.save();
                } else {
                    assert (product.status == 5) throw ErrorsV2.InvalidRefund;
                }

                val ack = createMessage({
                    bounce: BounceMode.Only256BitsOfBody,
                    value: grams("0.03"),
                    dest: storage.escrow,
                    body: EscrowRefundAckV2 {
                        escrowId: msg.escrowId,
                        productId: msg.productId,
                        queryId: msg.queryId,
                        nftItem: msg.nftItem,
                        seller: msg.seller,
                    },
                });
                ack.send(SEND_MODE_REGULAR);
            } else {
                // Original seller-initiated listing cancellation path.
                val queryResult = listingMaps.refundQueryToProduct.get(msg.queryId);
                assert (queryResult.isFound) throw ErrorsV2.InvalidRefund;
                val productId = queryResult.loadValue();
                assert (productId == msg.productId) throw ErrorsV2.InvalidRefund;
                val productResult = listingMaps.products.get(productId);
                assert (productResult.isFound) throw ErrorsV2.InvalidRefund;
                var product = MarketplaceV2Product.fromCell(productResult.loadValue());

                assert (product.id == msg.productId) throw ErrorsV2.InvalidRefund;
                assert (product.refundQueryId == msg.queryId) throw ErrorsV2.InvalidRefund;
                assert (product.escrowId == msg.escrowId) throw ErrorsV2.InvalidRefund;
                assert (product.nftItem == msg.nftItem) throw ErrorsV2.InvalidRefund;
                assert (product.seller == msg.seller) throw ErrorsV2.InvalidRefund;

                if (product.status == 6) {
                    product.status = 5;
                    listingMaps.products.set(productId, product.toCell());
                    val listingResult = listingMaps.assetListings.get(product.nftItem);
                    if (listingResult.isFound && listingResult.loadValue() == productId) {
                        listingMaps.assetListings.delete(product.nftItem);
                    }
                    storage.listingMaps = listingMaps.toCell();
            storage.orderMaps = orderMaps.toCell();
            storage.save();
                } else {
                    // Keep the query index so an exact duplicate callback can be re-ACKed.
                    assert (product.status == 5) throw ErrorsV2.InvalidRefund;
                }

                val ack = createMessage({
                    bounce: BounceMode.Only256BitsOfBody,
                    value: grams("0.03"),
                    dest: storage.escrow,
                    body: EscrowRefundAckV2 {
                        escrowId: msg.escrowId,
                        productId: msg.productId,
                        queryId: msg.queryId,
                        nftItem: msg.nftItem,
                        seller: msg.seller,
                    },
                });
                ack.send(SEND_MODE_REGULAR);
            }
        }

        else => {
            assert (in.body.isEmpty()) throw ErrorsV2.InvalidMessage;
        }
    }
}

fun restorePayoutAfterBounce(
    orderId: uint64,
    operationId: uint64,
    queryId: uint64,
    beneficiary: address,
    amount: coins,
    kind: uint8,
    sender: address,
) {
    var storage = lazy MarketplaceV2Storage.load();
    var listingMaps = storage.listingMaps.load();
    var orderMaps = storage.orderMaps.load();
    val payoutResult = orderMaps.payouts.get(operationId);
    if (!payoutResult.isFound) {
        return;
    }
    var payout = MarketplaceV2Payout.fromCell(payoutResult.loadValue());
    if (
        payout.status != MarketplaceV2PayoutStatus.Dispatched ||
        payout.orderId != orderId ||
        payout.operationId != operationId ||
        payout.queryId != queryId ||
        payout.beneficiary != beneficiary ||
        payout.amount != amount ||
        payout.kind != kind ||
        sender != beneficiary
    ) {
        return;
    }

    val orderResult = orderMaps.orders.get(orderId);
    if (!orderResult.isFound) {
        return;
    }
    var order = MarketplaceV2Order.fromCell(orderResult.loadValue());
    if (order.id != orderId) {
        return;
    }

    payout.status = MarketplaceV2PayoutStatus.Bounced;
    orderMaps.payouts.set(operationId, payout.toCell());
    if (kind == 1) {
        order.sellerPayoutStatus = MarketplaceV2PayoutStatus.Bounced;
        order.status = MarketplaceV2OrderStatus.SettlementPending;
    } else if (kind == 2) {
        order.platformPayoutStatus = MarketplaceV2PayoutStatus.Bounced;
        order.status = MarketplaceV2OrderStatus.SettlementPending;
    } else if (kind == 3) {
        order.refundStatus = MarketplaceV2RefundStatus.Bounced;
        order.status = MarketplaceV2OrderStatus.RefundPending;
    } else {
        return;
    }
    orderMaps.orders.set(orderId, order.toCell());
    storage.listingMaps = listingMaps.toCell();
    storage.orderMaps = orderMaps.toCell();
    storage.save();
}

fun handleReleaseRequestBounce(msg: ReleaseEscrowV2, sender: address) {
    var storage = lazy MarketplaceV2Storage.load();
    var listingMaps = storage.listingMaps.load();
    var orderMaps = storage.orderMaps.load();
    if (!storage.escrowConfigured || sender != storage.escrow) {
        return;
    }

    val orderIdResult = orderMaps.releaseQueryToOrder.get(msg.queryId);
    if (!orderIdResult.isFound || orderIdResult.loadValue() != msg.orderId) {
        return;
    }
    val orderResult = orderMaps.orders.get(msg.orderId);
    if (!orderResult.isFound) {
        return;
    }
    var order = MarketplaceV2Order.fromCell(orderResult.loadValue());
    var orderExtra = order.extra.load();
    val parties = orderExtra.parties.load();
    val asset = orderExtra.asset.load();
    val operations = orderExtra.operations.load();
    val settlement = orderExtra.settlement.load();

    if (
        order.productId != msg.productId ||
        operations.releaseQueryId != msg.queryId ||
        asset.escrowId != msg.escrowId ||
        parties.buyer != msg.buyer
    ) {
        return;
    }

    val productResult = listingMaps.products.get(order.productId);
    if (!productResult.isFound) {
        return;
    }
    var product = MarketplaceV2Product.fromCell(productResult.loadValue());
    if (
        product.seller != parties.seller ||
        product.nftItem != asset.nftItem
    ) {
        return;
    }

    if (order.status == MarketplaceV2OrderStatus.DeliveryPending) {
        order.status = MarketplaceV2OrderStatus.RefundPending;
        order.deliveryStatus = MarketplaceV2DeliveryStatus.Bounced;
        order.refundStatus = MarketplaceV2RefundStatus.Pending;

        val buyerRefund = MarketplaceV2Payout {
            orderId: msg.orderId,
            operationId: operations.buyerRefundOperationId,
            queryId: operations.buyerRefundQueryId,
            beneficiary: parties.buyer,
            amount: settlement.gross,
            kind: 3,
            status: MarketplaceV2PayoutStatus.Pending,
            createdAt: order.createdAt,
        };
        orderMaps.payouts.set(buyerRefund.operationId, buyerRefund.toCell());

        product.status = 6;
        product.refundQueryId = operations.sellerReturnQueryId;
        listingMaps.products.set(product.id, product.toCell());
        listingMaps.refundQueryToProduct.set(operations.sellerReturnQueryId, product.id);
        orderMaps.refundQueryToOrder.set(operations.sellerReturnQueryId, msg.orderId);
        orderMaps.orders.set(order.id, order.toCell());
        storage.listingMaps = listingMaps.toCell();
    storage.orderMaps = orderMaps.toCell();
    storage.save();
    } else if (
        order.status != MarketplaceV2OrderStatus.RefundPending &&
        order.status != MarketplaceV2OrderStatus.RefundDispatched
    ) {
        return;
    }

    val currentProductResult = listingMaps.products.get(order.productId);
    if (!currentProductResult.isFound) {
        return;
    }
    val currentProduct = MarketplaceV2Product.fromCell(currentProductResult.loadValue());
    if (currentProduct.status == 6) {
        val returnMessage = createMessage({
            bounce: BounceMode.RichBounce,
            value: grams("0.05"),
            dest: storage.escrow,
            body: RefundEscrowV2 {
                escrowId: asset.escrowId,
                productId: order.productId,
                queryId: operations.sellerReturnQueryId,
                seller: parties.seller,
            },
        });
        returnMessage.send(SEND_MODE_PAY_FEES_SEPARATELY);
    }
}

fun onBouncedMessage(in: InMessageBounced) {
    if (in.bouncedBody.remainingBitsCount() < 32) {
        return;
    }
    if (in.bouncedBody.preloadUint(32) != 0xfffffffe) {
        return;
    }

    try {
        val rich = lazy RichBounceBody.fromSlice(in.bouncedBody);
        val originalBody = rich.originalBody;
        var originalSlice = originalBody.beginParse();
        if (originalSlice.remainingBitsCount() < 32) {
            return;
        }
        val opcode = originalSlice.loadUint(32);

        if (opcode == 0x71b00001) {
            var storage = lazy MarketplaceV2Storage.load();
            var listingMaps = storage.listingMaps.load();
            var orderMaps = storage.orderMaps.load();
            if (!storage.escrowConfigured || in.senderAddress != storage.escrow) {
                return;
            }
            val create = lazy CreateEscrowV2.fromCell(originalBody);
            val queryResult = listingMaps.queryToProduct.get(create.queryId);
            if (!queryResult.isFound) {
                return;
            }
            val productId = queryResult.loadValue();
            val productResult = listingMaps.products.get(productId);
            if (!productResult.isFound) {
                return;
            }

            var product = MarketplaceV2Product.fromCell(productResult.loadValue());
            val productExtra = product.extra.load();
            val createExtra = create.extra.load();
            if (
                product.status == 1 && product.id == create.productId &&
                product.queryId == create.queryId &&
                product.nftItem == create.nftItem &&
                productExtra.collection == create.collection &&
                productExtra.itemIndex == createExtra.itemIndex &&
                productExtra.kind == createExtra.kind &&
                product.seller == create.seller
            ) {
                product.status = 5;
                listingMaps.products.set(productId, product.toCell());

                val listingResult = listingMaps.assetListings.get(product.nftItem);
                if (listingResult.isFound && listingResult.loadValue() == productId) {
                    listingMaps.assetListings.delete(product.nftItem);
                }
                listingMaps.queryToProduct.delete(create.queryId);
                storage.listingMaps = listingMaps.toCell();
    storage.orderMaps = orderMaps.toCell();
    storage.save();
            }
        } else if (opcode == 0x71b00002) {
            val release = lazy ReleaseEscrowV2.fromCell(originalBody);
            handleReleaseRequestBounce(release, in.senderAddress);
        } else if (opcode == 0x71b00101) {
            val payout = lazy SellerPayoutV2.fromCell(originalBody);
            restorePayoutAfterBounce(
                payout.orderId,
                payout.operationId,
                payout.queryId,
                payout.beneficiary,
                payout.amount,
                1,
                in.senderAddress,
            );
        } else if (opcode == 0x71b00102) {
            val payout = lazy PlatformPayoutV2.fromCell(originalBody);
            restorePayoutAfterBounce(
                payout.orderId,
                payout.operationId,
                payout.queryId,
                payout.beneficiary,
                payout.amount,
                2,
                in.senderAddress,
            );
        } else if (opcode == 0x71b00104) {
            val payout = lazy BuyerRefundV2.fromCell(originalBody);
            restorePayoutAfterBounce(
                payout.orderId,
                payout.operationId,
                payout.queryId,
                payout.beneficiary,
                payout.amount,
                3,
                in.senderAddress,
            );
        } else if (opcode == 0x71b0000E) {
            // A bounced seller NFT-return request is ambiguous if a callback raced.
            // Keep the order reserved for explicit operator review; never infer
            // that the NFT remained in escrow solely from the bounce.
            var storage = lazy MarketplaceV2Storage.load();
            var listingMaps = storage.listingMaps.load();
            var orderMaps = storage.orderMaps.load();
            if (!storage.escrowConfigured || in.senderAddress != storage.escrow) {
                return;
            }
            val refund = lazy RefundEscrowV2.fromCell(originalBody);
            val orderResult = orderMaps.refundQueryToOrder.get(refund.queryId);
            if (!orderResult.isFound) {
                return;
            }
            val orderId = orderResult.loadValue();
            val orderRecord = orderMaps.orders.get(orderId);
            if (!orderRecord.isFound) {
                return;
            }
            var order = MarketplaceV2Order.fromCell(orderRecord.loadValue());
            var orderExtra = order.extra.load();
            val operations = orderExtra.operations.load();
            val asset = orderExtra.asset.load();
            val parties = orderExtra.parties.load();
            if (
                order.status == MarketplaceV2OrderStatus.RefundPending &&
                refund.productId == order.productId &&
                refund.escrowId == asset.escrowId &&
                refund.queryId == operations.sellerReturnQueryId &&
                refund.seller == parties.seller
            ) {
                order.status = MarketplaceV2OrderStatus.ManualReview;
                order.refundStatus = MarketplaceV2RefundStatus.ManualReview;
                orderMaps.orders.set(orderId, order.toCell());
                storage.listingMaps = listingMaps.toCell();
    storage.orderMaps = orderMaps.toCell();
    storage.save();
            }
        }
    } catch {
        // Malformed, stale, or uncorrelated bounces must never mutate liabilities.
    }
}

get fun treasuryV2(): address {
    val config = MarketplaceV2Storage.load().config.load();
    return config.treasury;
}

get fun treasuryConfiguredV2(): bool {
    val config = MarketplaceV2Storage.load().config.load();
    return config.treasuryConfigured;
}

get fun orderV2(orderId: uint64): MarketplaceV2Order? {
    val maps = MarketplaceV2Storage.load().orderMaps.load();
    val result = maps.orders.get(orderId);
    if (!result.isFound) {
        return null;
    }
    return MarketplaceV2Order.fromCell(result.loadValue());
}

get fun payoutV2(operationId: uint64): MarketplaceV2Payout? {
    val maps = MarketplaceV2Storage.load().orderMaps.load();
    val result = maps.payouts.get(operationId);
    if (!result.isFound) {
        return null;
    }
    return MarketplaceV2Payout.fromCell(result.loadValue());
}

get fun ownerV2(): address {
    return MarketplaceV2Storage.load().owner;
}

get fun escrowV2(): address {
    return MarketplaceV2Storage.load().escrow;
}

get fun escrowConfiguredV2(): bool {
    return MarketplaceV2Storage.load().escrowConfigured;
}

get fun productV2(productId: uint64): MarketplaceV2Product? {
    val maps = MarketplaceV2Storage.load().listingMaps.load();
    val result = maps.products.get(productId);
    if (!result.isFound) {
        return null;
    }
    return MarketplaceV2Product.fromCell(result.loadValue());
}

get fun assetProductIdV2(nftItem: address): uint64? {
    val maps = MarketplaceV2Storage.load().listingMaps.load();
    val result = maps.assetListings.get(nftItem);
    if (!result.isFound) {
        return null;
    }
    return result.loadValue();
}
