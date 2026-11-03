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
    val msg = lazy MarketplaceV2AllowedMessage.fromSlice(in.body);

    match (msg) {
        SetMarketplaceV2Escrow => {
            var storage = lazy MarketplaceV2Storage.load();
            assert (in.senderAddress == storage.owner) throw ErrorsV2.NotOwner;
            // Bind the V2 Escrow once. Rotating it after listings exist would strand
            // callbacks and split custody authority across two contract addresses.
            assert (!storage.escrowConfigured) throw ErrorsV2.InvalidRelease;
            storage.escrow = msg.escrow;
            storage.escrowConfigured = true;
            storage.save();
        }

        SetMarketplaceV2Treasury => {
            var storage = lazy MarketplaceV2Storage.load();
            assert (in.senderAddress == storage.owner) throw ErrorsV2.NotOwner;
            assert (!storage.treasuryConfigured) throw ErrorsV2.InvalidTreasury;
            assert (msg.treasury != contract.getAddress()) throw ErrorsV2.InvalidTreasury;
            storage.treasury = msg.treasury;
            storage.treasuryConfigured = true;
            storage.save();
        }

        BuyProductV2 => {
            var storage = lazy MarketplaceV2Storage.load();
            assert (storage.escrowConfigured && storage.treasuryConfigured) throw ErrorsV2.InvalidPurchase;

            val productResult = storage.products.get(msg.productId);
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
                        treasury: storage.treasury,
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
            storage.products.set(product.id, product.toCell());
            storage.orders.set(orderId, order.toCell());
            storage.releaseQueryToOrder.set(operations.releaseQueryId, orderId);
            storage.nextOrderId = orderId + 1;
            storage.nextQueryId = queryBase + 6;
            storage.nextOperationId = operationBase + 3;
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
            var storage = lazy MarketplaceV2Storage.load();
            val payoutResult = storage.payouts.get(msg.operationId);
            assert (payoutResult.isFound) throw ErrorsV2.InvalidPayout;
            var payout = MarketplaceV2Payout.fromCell(payoutResult.loadValue());
            assert (
                payout.status == MarketplaceV2PayoutStatus.Pending ||
                payout.status == MarketplaceV2PayoutStatus.Bounced
            ) throw ErrorsV2.InvalidPayout;

            val orderResult = storage.orders.get(payout.orderId);
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
                storage.payouts.set(payout.operationId, payout.toCell());
                if (
                    order.sellerPayoutStatus == MarketplaceV2PayoutStatus.Dispatched &&
                    order.platformPayoutStatus == MarketplaceV2PayoutStatus.Dispatched
                ) {
                    order.status = MarketplaceV2OrderStatus.PayoutsDispatched;
                }
                storage.orders.set(order.id, order.toCell());
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
                storage.payouts.set(payout.operationId, payout.toCell());
                if (
                    order.sellerPayoutStatus == MarketplaceV2PayoutStatus.Dispatched &&
                    order.platformPayoutStatus == MarketplaceV2PayoutStatus.Dispatched
                ) {
                    order.status = MarketplaceV2OrderStatus.PayoutsDispatched;
                }
                storage.orders.set(order.id, order.toCell());
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
                val productResult = storage.products.get(order.productId);
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
                storage.payouts.set(payout.operationId, payout.toCell());
                storage.orders.set(order.id, order.toCell());
                storage.save();
                transfer.send(SEND_MODE_PAY_FEES_SEPARATELY);
            } else {
                throw ErrorsV2.InvalidPayout;
            }
        }

        PublishProductV2 => {
            var storage = lazy MarketplaceV2Storage.load();
            assert (storage.escrowConfigured) throw ErrorsV2.InvalidRelease;
            assert (msg.price > 0) throw ErrorsV2.InvalidRelease;
            assert (msg.kind == 3) throw ErrorsV2.InvalidRelease;

            // Reserve the NFT Item before asking Escrow to create its custody record.
            val existing = storage.assetListings.get(msg.nftItem);
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

            storage.products.set(productId, product.toCell());
            storage.assetListings.set(msg.nftItem, productId);
            storage.queryToProduct.set(queryId, productId);
            storage.nextProductId = productId + 1;
            storage.nextQueryId = queryId + 1;
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
            var storage = lazy MarketplaceV2Storage.load();
            assert (storage.escrowConfigured) throw ErrorsV2.InvalidRefund;
            val productResult = storage.products.get(msg.productId);
            assert (productResult.isFound) throw ErrorsV2.InvalidRefund;
            var product = MarketplaceV2Product.fromCell(productResult.loadValue());
            assert (
                in.senderAddress == product.seller || in.senderAddress == storage.owner
            ) throw ErrorsV2.InvalidRefund;

            var queryId: uint64 = 0;
            if (product.status == 2) {
                queryId = storage.nextQueryId;
                assert (queryId > 0) throw ErrorsV2.InvalidRefund;
                val existingQuery = storage.refundQueryToProduct.get(queryId);
                assert (!existingQuery.isFound) throw ErrorsV2.InvalidRefund;

                product.status = 6;
                product.refundQueryId = queryId;
                storage.products.set(msg.productId, product.toCell());
                storage.refundQueryToProduct.set(queryId, msg.productId);
                storage.nextQueryId = queryId + 1;
                storage.save();
            } else {
                // A seller can retry the exact same refund query after Escrow
                // reports a correlated NFT transfer bounce and restores Deposited.
                assert (product.status == 6) throw ErrorsV2.InvalidRefund;
                queryId = product.refundQueryId;
                assert (queryId > 0) throw ErrorsV2.InvalidRefund;
                val queryResult = storage.refundQueryToProduct.get(queryId);
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
            var storage = lazy MarketplaceV2Storage.load();
            assert (storage.escrowConfigured) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (in.senderAddress == storage.escrow) throw ErrorsV2.InvalidReleaseConfirmation;

            val orderIdResult = storage.releaseQueryToOrder.get(msg.queryId);
            assert (orderIdResult.isFound) throw ErrorsV2.InvalidReleaseConfirmation;
            val orderId = orderIdResult.loadValue();
            assert (orderId == msg.orderId) throw ErrorsV2.InvalidReleaseConfirmation;
            val orderResult = storage.orders.get(orderId);
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
                assert (settlement.platformFee > 0) throw ErrorsV2.InvalidPayout;

                storage.payouts.set(sellerPayout.operationId, sellerPayout.toCell());
                storage.payouts.set(platformPayout.operationId, platformPayout.toCell());

                val productResult = storage.products.get(order.productId);
                assert (productResult.isFound) throw ErrorsV2.InvalidReleaseConfirmation;
                var product = MarketplaceV2Product.fromCell(productResult.loadValue());
                assert (product.status == 3) throw ErrorsV2.InvalidReleaseConfirmation;
                assert (product.seller == parties.seller) throw ErrorsV2.InvalidReleaseConfirmation;
                assert (product.nftItem == asset.nftItem) throw ErrorsV2.InvalidReleaseConfirmation;
                product.status = 4;
                storage.products.set(product.id, product.toCell());
                storage.orders.set(orderId, order.toCell());
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
            var storage = lazy MarketplaceV2Storage.load();
            assert (storage.escrowConfigured) throw ErrorsV2.InvalidRelease;
            assert (in.senderAddress == storage.escrow) throw ErrorsV2.InvalidReleaseConfirmation;

            val queryResult = storage.queryToProduct.get(msg.queryId);
            assert (queryResult.isFound) throw ErrorsV2.InvalidReleaseConfirmation;
            val productId = queryResult.loadValue();
            assert (productId == msg.productId) throw ErrorsV2.InvalidReleaseConfirmation;

            val productResult = storage.products.get(productId);
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
                storage.products.set(productId, product.toCell());
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
            var storage = lazy MarketplaceV2Storage.load();
            assert (storage.escrowConfigured) throw ErrorsV2.InvalidRefund;
            assert (in.senderAddress == storage.escrow) throw ErrorsV2.InvalidRefund;

            val orderIdResult = storage.releaseQueryToOrder.get(msg.queryId);
            assert (orderIdResult.isFound) throw ErrorsV2.InvalidRefund;
            val orderId = orderIdResult.loadValue();
            assert (orderId == msg.orderId) throw ErrorsV2.InvalidRefund;
            val orderResult = storage.orders.get(orderId);
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
                storage.payouts.set(buyerRefund.operationId, buyerRefund.toCell());

                val productResult = storage.products.get(order.productId);
                assert (productResult.isFound) throw ErrorsV2.InvalidRefund;
                var product = MarketplaceV2Product.fromCell(productResult.loadValue());
                assert (product.status == 3) throw ErrorsV2.InvalidRefund;
                assert (product.seller == parties.seller) throw ErrorsV2.InvalidRefund;
                product.status = 6;
                product.refundQueryId = operations.sellerReturnQueryId;
                storage.products.set(product.id, product.toCell());
                storage.refundQueryToProduct.set(operations.sellerReturnQueryId, product.id);
                storage.refundQueryToOrder.set(operations.sellerReturnQueryId, orderId);
                storage.orders.set(orderId, order.toCell());
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
            val productAfterResult = storage.products.get(order.productId);
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
            var storage = lazy MarketplaceV2Storage.load();
            assert (storage.escrowConfigured) throw ErrorsV2.InvalidRefund;
            assert (in.senderAddress == storage.escrow) throw ErrorsV2.InvalidRefund;

            val queryResult = storage.refundQueryToProduct.get(msg.queryId);
            assert (queryResult.isFound) throw ErrorsV2.InvalidRefund;
            val productId = queryResult.loadValue();
            assert (productId == msg.productId) throw ErrorsV2.InvalidRefund;
            val productResult = storage.products.get(productId);
            assert (productResult.isFound) throw ErrorsV2.InvalidRefund;
            var product = MarketplaceV2Product.fromCell(productResult.loadValue());

            assert (product.id == msg.productId) throw ErrorsV2.InvalidRefund;
            assert (product.refundQueryId == msg.queryId) throw ErrorsV2.InvalidRefund;
            assert (product.escrowId == msg.escrowId) throw ErrorsV2.InvalidRefund;
            assert (product.nftItem == msg.nftItem) throw ErrorsV2.InvalidRefund;
            assert (product.seller == msg.seller) throw ErrorsV2.InvalidRefund;

            if (product.status == 6) {
                product.status = 5;
                storage.products.set(productId, product.toCell());
                val listingResult = storage.assetListings.get(product.nftItem);
                if (listingResult.isFound && listingResult.loadValue() == productId) {
                    storage.assetListings.delete(product.nftItem);
                }
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

        else => {
            assert (in.body.isEmpty()) throw ErrorsV2.InvalidMessage;
        }
    }
}

fun onBouncedMessage(in: InMessageBounced) {
    var storage = lazy MarketplaceV2Storage.load();

    if (!storage.escrowConfigured || in.senderAddress != storage.escrow) {
        return;
    }
    if (in.bouncedBody.remainingBitsCount() < 32) {
        return;
    }
    if (in.bouncedBody.preloadUint(32) != 0xfffffffe) {
        return;
    }

    // Only an exact bounced CreateEscrowV2 request can safely release a
    // pending listing reservation. Refund-request bounces are left in
    // ManualReview: the NFT may already have returned if its callback raced.
    try {
        val rich = lazy RichBounceBody.fromSlice(in.bouncedBody);
        val originalBody = rich.originalBody;
        var originalSlice = originalBody.beginParse();
        if (originalSlice.remainingBitsCount() < 32) {
            return;
        }
        val opcode = originalSlice.loadUint(32);

        if (opcode == 0x71b00001) {
            val create = lazy CreateEscrowV2.fromCell(originalBody);
            val queryResult = storage.queryToProduct.get(create.queryId);
            if (!queryResult.isFound) {
                return;
            }
            val productId = queryResult.loadValue();
            val productResult = storage.products.get(productId);
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
                storage.products.set(productId, product.toCell());

                val listingResult = storage.assetListings.get(product.nftItem);
                if (listingResult.isFound && listingResult.loadValue() == productId) {
                    storage.assetListings.delete(product.nftItem);
                }
                storage.queryToProduct.delete(create.queryId);
                storage.save();
            }
        }
    } catch {
        // A malformed or mismatched bounce must not mutate product or NFT indexes.
    }
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
    val result = MarketplaceV2Storage.load().products.get(productId);
    if (!result.isFound) {
        return null;
    }
    return MarketplaceV2Product.fromCell(result.loadValue());
}

get fun assetProductIdV2(nftItem: address): uint64? {
    val result = MarketplaceV2Storage.load().assetListings.get(nftItem);
    if (!result.isFound) {
        return null;
    }
    return result.loadValue();
}
