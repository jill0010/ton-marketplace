import "types"

contract MarketplaceV2 {
    author: "TON Market"
    version: "2.0.0"
    description: "Isolated Marketplace V2 listing and escrow callback integration"
    storage: MarketplaceV2Storage
    incomingMessages: MarketplaceV2AllowedMessage
}

type MarketplaceV2AllowedMessage =
    | SetMarketplaceV2Escrow
    | SetMarketplaceV2Treasury
    | BuyProductV2
    | RetryPayoutV2
    | EscrowReleasedV2
    | EscrowReleaseFailedV2
    | PublishProductV2
    | CancelProductV2
    | EscrowDepositedV2
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
            var purchase = storage.purchaseStorage.load();
            assert (purchase.schemaVersion == 2) throw ErrorsV2.InvalidRelease;
            // Treasury is immutable after configuration. Changing it after an order
            // exists would redirect already-created platform liabilities.
            assert (!purchase.treasuryConfigured) throw ErrorsV2.InvalidRelease;
            assert (purchase.nextOrderId == 1) throw ErrorsV2.InvalidRelease;
            val orderStorage = purchase.orders.load();
            assert (!orderStorage.orders.get(1).isFound) throw ErrorsV2.InvalidRelease;
            assert (msg.treasury != contract.getAddress()) throw ErrorsV2.InvalidRelease;
            assert (msg.treasury != storage.escrow) throw ErrorsV2.InvalidRelease;
            purchase.treasury = msg.treasury;
            purchase.treasuryConfigured = true;
            storage.purchaseStorage = purchase.toCell();
            storage.save();
        }

        BuyProductV2 => {
            var storage = lazy MarketplaceV2Storage.load();
            var purchase = storage.purchaseStorage.load();
            assert (purchase.schemaVersion == 2) throw ErrorsV2.InvalidPurchase;
            assert (purchase.treasuryConfigured) throw ErrorsV2.InvalidPurchase;
            assert (storage.escrowConfigured) throw ErrorsV2.InvalidPurchase;
            assert (msg.queryId > 0) throw ErrorsV2.InvalidPurchase;
            assert (msg.deadline >= in.createdAt) throw ErrorsV2.InvalidPurchase;
            assert (msg.deadline <= in.createdAt + 900) throw ErrorsV2.InvalidPurchase;

            val productResult = storage.products.get(msg.productId);
            assert (productResult.isFound) throw ErrorsV2.InvalidPurchase;
            var product = MarketplaceV2Product.fromCell(productResult.loadValue());
            assert (product.id == msg.productId) throw ErrorsV2.InvalidPurchase;
            assert (product.status == 2 && product.escrowId > 0) throw ErrorsV2.InvalidPurchase;
            assert (in.senderAddress != product.seller) throw ErrorsV2.InvalidPurchase;
            assert (msg.expectedPrice == product.price) throw ErrorsV2.InvalidPurchase;

            // The exact 0.2 TON execution reserve funds escrow release, callback
            // acknowledgement and the two independently fee-paid payout messages.
            // Any under/over-payment bounces as a whole; no partial order is created.
            assert (in.valueCoins == product.price + grams("0.2")) throw ErrorsV2.InvalidPayment;

            var orderStorage = purchase.orders.load();
            var payoutStorage = purchase.payoutStorage.load();
            assert (
                !orderStorage.productToOrder.get(msg.productId).isFound
            ) throw ErrorsV2.InvalidPurchase;
            assert (
                !orderStorage.paymentQueryToOrder.get(msg.queryId).isFound
            ) throw ErrorsV2.InvalidPurchase;
            assert (
                !payoutStorage.payoutQueryToOperation.get(msg.queryId).isFound
            ) throw ErrorsV2.InvalidPurchase;

            val orderId = purchase.nextOrderId;
            val releaseQueryId = storage.nextQueryId;
            val sellerPayoutQueryId = releaseQueryId + 1;
            val platformPayoutQueryId = releaseQueryId + 2;
            val buyerRefundQueryId = releaseQueryId + 3;
            val sellerPayoutOperationId = purchase.nextOperationId;
            val platformPayoutOperationId = sellerPayoutOperationId + 1;
            val buyerRefundOperationId = platformPayoutOperationId + 1;
            assert (orderId > 0 && releaseQueryId > 0) throw ErrorsV2.InvalidPurchase;
            assert (sellerPayoutOperationId > 0) throw ErrorsV2.InvalidPurchase;
            assert (msg.queryId != releaseQueryId) throw ErrorsV2.InvalidPurchase;
            assert (msg.queryId != sellerPayoutQueryId) throw ErrorsV2.InvalidPurchase;
            assert (msg.queryId != platformPayoutQueryId) throw ErrorsV2.InvalidPurchase;
            assert (msg.queryId != buyerRefundQueryId) throw ErrorsV2.InvalidPurchase;
            assert (msg.queryId < releaseQueryId || msg.queryId > buyerRefundQueryId) throw ErrorsV2.InvalidPurchase;
            assert (!orderStorage.paymentQueryToOrder.get(releaseQueryId).isFound) throw ErrorsV2.InvalidPurchase;
            assert (!orderStorage.paymentQueryToOrder.get(sellerPayoutQueryId).isFound) throw ErrorsV2.InvalidPurchase;
            assert (!orderStorage.paymentQueryToOrder.get(platformPayoutQueryId).isFound) throw ErrorsV2.InvalidPurchase;
            assert (!orderStorage.paymentQueryToOrder.get(buyerRefundQueryId).isFound) throw ErrorsV2.InvalidPurchase;

            val amounts = calculateSettlementAmounts(product.price);
            val productExtra = product.extra.load();
            val operations = MarketplaceV2OrderOperations {
                paymentQueryId: msg.queryId,
                releaseQueryId,
                sellerPayoutOperationId,
                platformPayoutOperationId,
                buyerRefundOperationId,
                sellerPayoutQueryId,
                platformPayoutQueryId,
                buyerRefundQueryId,
            };
            val orderExtra = MarketplaceV2OrderExtra {
                parties: MarketplaceV2OrderParties {
                    buyer: in.senderAddress,
                    seller: product.seller,
                    treasury: purchase.treasury,
                }.toCell(),
                asset: MarketplaceV2OrderAsset {
                    nftItem: product.nftItem,
                    collection: productExtra.collection,
                    itemIndex: productExtra.itemIndex,
                    escrowId: product.escrowId,
                }.toCell(),
                settlement: MarketplaceV2OrderSettlement {
                    gross: amounts.gross,
                    feeBps: 300,
                    feeRoundingVersion: 1,
                    platformFee: amounts.platformFee,
                    sellerProceeds: amounts.sellerAmount,
                    processingReserve: grams("0.2"),
                }.toCell(),
                operations: operations.toCell(),
            };
            val order = MarketplaceV2Order {
                id: orderId,
                productId: product.id,
                status: 2,
                deliveryStatus: 1,
                sellerPayoutStatus: 1,
                platformPayoutStatus: 1,
                refundStatus: 0,
                createdAt: in.createdAt,
                extra: orderExtra.toCell(),
            };
            val sellerPayout = MarketplaceV2Payout {
                orderId,
                operationId: sellerPayoutOperationId,
                queryId: sellerPayoutQueryId,
                beneficiary: product.seller,
                amount: amounts.sellerAmount,
                kind: 1,
                status: 1,
                createdAt: in.createdAt,
            };
            val platformPayout = MarketplaceV2Payout {
                orderId,
                operationId: platformPayoutOperationId,
                queryId: platformPayoutQueryId,
                beneficiary: purchase.treasury,
                amount: amounts.platformFee,
                kind: 2,
                status: 1,
                createdAt: in.createdAt,
            };
            val buyerRefund = MarketplaceV2Payout {
                orderId,
                operationId: buyerRefundOperationId,
                queryId: buyerRefundQueryId,
                beneficiary: in.senderAddress,
                amount: amounts.gross,
                kind: 3,
                status: 0,
                createdAt: in.createdAt,
            };

            orderStorage.orders.set(orderId, order.toCell());
            orderStorage.productToOrder.set(msg.productId, orderId);
            orderStorage.paymentQueryToOrder.set(msg.queryId, orderId);
            payoutStorage.payouts.set(sellerPayoutOperationId, sellerPayout.toCell());
            payoutStorage.payouts.set(platformPayoutOperationId, platformPayout.toCell());
            payoutStorage.payouts.set(buyerRefundOperationId, buyerRefund.toCell());
            payoutStorage.payoutQueryToOperation.set(sellerPayoutQueryId, sellerPayoutOperationId);
            payoutStorage
                .payoutQueryToOperation
                .set(platformPayoutQueryId, platformPayoutOperationId);
            purchase.orders = orderStorage.toCell();
            purchase.payoutStorage = payoutStorage.toCell();
            purchase.nextOrderId = orderId + 1;
            purchase.nextOperationId = buyerRefundOperationId + 1;
            storage.purchaseStorage = purchase.toCell();
            storage.nextQueryId = buyerRefundQueryId + 1;

            // Reserve the product and persist every liability before calling Escrow.
            product.status = 3;
            storage.products.set(msg.productId, product.toCell());
            storage.save();

            val release = createMessage({
                bounce: BounceMode.RichBounce,
                value: grams("0.05"),
                dest: storage.escrow,
                body: ReleaseEscrowV2 {
                    orderId,
                    productId: product.id,
                    escrowId: product.escrowId,
                    queryId: releaseQueryId,
                    buyer: in.senderAddress,
                },
            });
            release.send(SEND_MODE_REGULAR);
        }

        EscrowReleaseFailedV2 => {
            var storage = lazy MarketplaceV2Storage.load();
            var purchase = storage.purchaseStorage.load();
            var orderStorage = purchase.orders.load();
            assert (storage.escrowConfigured) throw ErrorsV2.InvalidDelivery;
            assert (in.senderAddress == storage.escrow) throw ErrorsV2.InvalidDelivery;

            val orderResult = orderStorage.orders.get(msg.orderId);
            assert (orderResult.isFound) throw ErrorsV2.InvalidDelivery;
            var order = MarketplaceV2Order.fromCell(orderResult.loadValue());
            val extra = order.extra.load();
            val parties = extra.parties.load();
            val asset = extra.asset.load();
            val operations = extra.operations.load();
            assert (order.status == 2 && order.deliveryStatus == 1) throw ErrorsV2.InvalidDelivery;
            assert (order.productId == msg.productId) throw ErrorsV2.InvalidDelivery;
            assert (asset.escrowId == msg.escrowId) throw ErrorsV2.InvalidDelivery;
            assert (asset.nftItem == msg.nftItem) throw ErrorsV2.InvalidDelivery;
            assert (parties.buyer == msg.buyer) throw ErrorsV2.InvalidDelivery;
            assert (operations.releaseQueryId == msg.queryId) throw ErrorsV2.InvalidDelivery;

            val returnQueryId = storage.nextQueryId;
            assert (returnQueryId > 0) throw ErrorsV2.InvalidRefund;
            assert (!orderStorage.paymentQueryToOrder.get(returnQueryId).isFound) throw ErrorsV2.InvalidRefund;
            assert (
                !orderStorage.refundQueryToOrder.get(returnQueryId).isFound
            ) throw ErrorsV2.InvalidRefund;
            order.status = 6;
            order.deliveryStatus = 3;
            order.refundStatus = 1;
            orderStorage.orders.set(order.id, order.toCell());
            orderStorage.refundQueryToOrder.set(returnQueryId, order.id);
            purchase.refundQueryToProduct.set(returnQueryId, order.productId);
            purchase.orders = orderStorage.toCell();

            val productResult = storage.products.get(order.productId);
            assert (productResult.isFound) throw ErrorsV2.InvalidRefund;
            var product = MarketplaceV2Product.fromCell(productResult.loadValue());
            assert (
                product.status == 3 && product.nftItem == msg.nftItem
            ) throw ErrorsV2.InvalidRefund;
            product.status = 6;
            product.refundQueryId = returnQueryId;
            storage.products.set(product.id, product.toCell());
            storage.purchaseStorage = purchase.toCell();
            storage.nextQueryId = returnQueryId + 1;
            storage.save();

            val returnNft = createMessage({
                bounce: BounceMode.RichBounce,
                value: grams("0.05"),
                dest: storage.escrow,
                body: RefundEscrowV2 {
                    escrowId: msg.escrowId,
                    productId: msg.productId,
                    queryId: returnQueryId,
                    seller: parties.seller,
                },
            });
            returnNft.send(SEND_MODE_REGULAR);

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

        EscrowReleasedV2 => {
            var storage = lazy MarketplaceV2Storage.load();
            var purchase = storage.purchaseStorage.load();
            var orderStorage = purchase.orders.load();
            var payoutStorage = purchase.payoutStorage.load();
            assert (storage.escrowConfigured) throw ErrorsV2.InvalidDelivery;
            assert (in.senderAddress == storage.escrow) throw ErrorsV2.InvalidDelivery;

            val orderResult = orderStorage.orders.get(msg.orderId);
            assert (orderResult.isFound) throw ErrorsV2.InvalidDelivery;
            var order = MarketplaceV2Order.fromCell(orderResult.loadValue());
            val extra = order.extra.load();
            val parties = extra.parties.load();
            val asset = extra.asset.load();
            val operations = extra.operations.load();
            assert (order.status == 2 && order.deliveryStatus == 1) throw ErrorsV2.InvalidDelivery;
            assert (order.productId == msg.productId) throw ErrorsV2.InvalidDelivery;
            assert (asset.escrowId == msg.escrowId) throw ErrorsV2.InvalidDelivery;
            assert (asset.nftItem == msg.nftItem) throw ErrorsV2.InvalidDelivery;
            assert (parties.buyer == msg.buyer) throw ErrorsV2.InvalidDelivery;
            assert (operations.releaseQueryId == msg.queryId) throw ErrorsV2.InvalidDelivery;

            val sellerPayoutResult = payoutStorage.payouts.get(operations.sellerPayoutOperationId);
            val platformPayoutResult = payoutStorage
                .payouts
                .get(operations.platformPayoutOperationId);
            assert (
                sellerPayoutResult.isFound && platformPayoutResult.isFound
            ) throw ErrorsV2.InvalidPayout;
            var sellerPayout = MarketplaceV2Payout.fromCell(sellerPayoutResult.loadValue());
            var platformPayout = MarketplaceV2Payout.fromCell(platformPayoutResult.loadValue());
            assert (
                sellerPayout.status == 1 && platformPayout.status == 1
            ) throw ErrorsV2.InvalidPayout;
            assert (
                sellerPayout.orderId == order.id && platformPayout.orderId == order.id
            ) throw ErrorsV2.InvalidPayout;

            sellerPayout.status = 2;
            platformPayout.status = 2;
            order.status = 5;
            order.deliveryStatus = 2;
            order.sellerPayoutStatus = 2;
            order.platformPayoutStatus = 2;
            payoutStorage.payouts.set(sellerPayout.operationId, sellerPayout.toCell());
            payoutStorage.payouts.set(platformPayout.operationId, platformPayout.toCell());
            orderStorage.orders.set(order.id, order.toCell());
            purchase.orders = orderStorage.toCell();
            purchase.payoutStorage = payoutStorage.toCell();
            storage.purchaseStorage = purchase.toCell();
            storage.save();

            val sellerTransfer = createMessage({
                bounce: BounceMode.RichBounce,
                value: sellerPayout.amount,
                dest: sellerPayout.beneficiary,
                body: SellerPayoutV2 {
                    orderId: order.id,
                    operationId: sellerPayout.operationId,
                    queryId: sellerPayout.queryId,
                },
            });
            sellerTransfer.send(SEND_MODE_PAY_FEES_SEPARATELY);

            val platformTransfer = createMessage({
                bounce: BounceMode.RichBounce,
                value: platformPayout.amount,
                dest: platformPayout.beneficiary,
                body: PlatformPayoutV2 {
                    orderId: order.id,
                    operationId: platformPayout.operationId,
                    queryId: platformPayout.queryId,
                },
            });
            platformTransfer.send(SEND_MODE_PAY_FEES_SEPARATELY);

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

        RetryPayoutV2 => {
            var storage = lazy MarketplaceV2Storage.load();
            var purchase = storage.purchaseStorage.load();
            var orderStorage = purchase.orders.load();
            var payoutStorage = purchase.payoutStorage.load();
            val payoutResult = payoutStorage.payouts.get(msg.operationId);
            assert (payoutResult.isFound) throw ErrorsV2.InvalidPayout;
            var payout = MarketplaceV2Payout.fromCell(payoutResult.loadValue());
            assert (payout.status == 3) throw ErrorsV2.InvalidPayout;
            assert (payout.operationId == msg.operationId) throw ErrorsV2.InvalidPayout;
            val orderResult = orderStorage.orders.get(payout.orderId);
            assert (orderResult.isFound) throw ErrorsV2.InvalidPayout;
            var order = MarketplaceV2Order.fromCell(orderResult.loadValue());
            if (payout.kind == 3) {
                assert (
                    order.deliveryStatus == 3 && order.refundStatus == 3
                ) throw ErrorsV2.InvalidPayout;
            } else {
                assert (order.deliveryStatus == 2) throw ErrorsV2.InvalidPayout;
                assert (payout.kind == 1 || payout.kind == 2) throw ErrorsV2.InvalidPayout;
            }

            val newQueryId = storage.nextQueryId;
            assert (newQueryId > 0) throw ErrorsV2.InvalidPayout;
            assert (!orderStorage.paymentQueryToOrder.get(newQueryId).isFound) throw ErrorsV2.InvalidPayout;
            assert (
                !payoutStorage.payoutQueryToOperation.get(newQueryId).isFound
            ) throw ErrorsV2.InvalidPayout;
            payout.queryId = newQueryId;
            payout.status = 2;
            payoutStorage.payouts.set(payout.operationId, payout.toCell());
            payoutStorage.payoutQueryToOperation.set(newQueryId, payout.operationId);
            if (payout.kind == 1) {
                order.sellerPayoutStatus = 2;
            } else if (payout.kind == 2) {
                order.platformPayoutStatus = 2;
            } else {
                order.refundStatus = 2;
            }
            if (payout.kind == 3) {
                order.status = 8;
            } else if (order.sellerPayoutStatus == 2 && order.platformPayoutStatus == 2) {
                order.status = 5;
            } else {
                order.status = 4;
            }
            orderStorage.orders.set(order.id, order.toCell());
            purchase.orders = orderStorage.toCell();
            purchase.payoutStorage = payoutStorage.toCell();
            storage.purchaseStorage = purchase.toCell();
            storage.nextQueryId = newQueryId + 1;
            storage.save();

            if (payout.kind == 1) {
                val transfer = createMessage({
                    bounce: BounceMode.RichBounce,
                    value: payout.amount,
                    dest: payout.beneficiary,
                    body: SellerPayoutV2 {
                        orderId: payout.orderId,
                        operationId: payout.operationId,
                        queryId: payout.queryId,
                    },
                });
                transfer.send(SEND_MODE_PAY_FEES_SEPARATELY);
            } else if (payout.kind == 2) {
                val transfer = createMessage({
                    bounce: BounceMode.RichBounce,
                    value: payout.amount,
                    dest: payout.beneficiary,
                    body: PlatformPayoutV2 {
                        orderId: payout.orderId,
                        operationId: payout.operationId,
                        queryId: payout.queryId,
                    },
                });
                transfer.send(SEND_MODE_PAY_FEES_SEPARATELY);
            } else {
                val transfer = createMessage({
                    bounce: BounceMode.RichBounce,
                    value: payout.amount,
                    dest: payout.beneficiary,
                    body: BuyerRefundV2 {
                        orderId: payout.orderId,
                        operationId: payout.operationId,
                        queryId: payout.queryId,
                    },
                });
                transfer.send(SEND_MODE_PAY_FEES_SEPARATELY);
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
            val purchase = storage.purchaseStorage.load();
            val orderStorage = purchase.orders.load();
            assert (productId > 0 && queryId > 0) throw ErrorsV2.InvalidRelease;
            assert (!orderStorage.paymentQueryToOrder.get(queryId).isFound) throw ErrorsV2.InvalidRelease;

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
            var purchase = storage.purchaseStorage.load();
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
                val existingQuery = purchase.refundQueryToProduct.get(queryId);
                val orderStorage = purchase.orders.load();
                assert (!existingQuery.isFound) throw ErrorsV2.InvalidRefund;
                assert (!orderStorage.paymentQueryToOrder.get(queryId).isFound) throw ErrorsV2.InvalidRefund;

                product.status = 6;
                product.refundQueryId = queryId;
                storage.products.set(msg.productId, product.toCell());
                purchase.refundQueryToProduct.set(queryId, msg.productId);
                storage.purchaseStorage = purchase.toCell();
                storage.nextQueryId = queryId + 1;
                storage.save();
            } else {
                // A seller can retry the exact same refund query after Escrow
                // reports a correlated NFT transfer bounce and restores Deposited.
                assert (product.status == 6) throw ErrorsV2.InvalidRefund;
                queryId = product.refundQueryId;
                assert (queryId > 0) throw ErrorsV2.InvalidRefund;
                val queryResult = purchase.refundQueryToProduct.get(queryId);
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

        EscrowRefundedV2 => {
            var storage = lazy MarketplaceV2Storage.load();
            var purchase = storage.purchaseStorage.load();
            var orderStorage = purchase.orders.load();
            var payoutStorage = purchase.payoutStorage.load();
            assert (storage.escrowConfigured) throw ErrorsV2.InvalidRefund;
            assert (in.senderAddress == storage.escrow) throw ErrorsV2.InvalidRefund;

            val orderQueryResult = orderStorage.refundQueryToOrder.get(msg.queryId);
            if (orderQueryResult.isFound) {
                val orderId = orderQueryResult.loadValue();
                val orderResult = orderStorage.orders.get(orderId);
                assert (orderResult.isFound) throw ErrorsV2.InvalidRefund;
                var order = MarketplaceV2Order.fromCell(orderResult.loadValue());
                val extra = order.extra.load();
                val parties = extra.parties.load();
                val asset = extra.asset.load();
                val operations = extra.operations.load();
                assert (order.productId == msg.productId) throw ErrorsV2.InvalidRefund;
                assert (asset.escrowId == msg.escrowId) throw ErrorsV2.InvalidRefund;
                assert (asset.nftItem == msg.nftItem) throw ErrorsV2.InvalidRefund;
                assert (parties.seller == msg.seller) throw ErrorsV2.InvalidRefund;
                assert (order.deliveryStatus == 3) throw ErrorsV2.InvalidRefund;

                val productResult = storage.products.get(order.productId);
                assert (productResult.isFound) throw ErrorsV2.InvalidRefund;
                var product = MarketplaceV2Product.fromCell(productResult.loadValue());
                assert (
                    (product.status == 6 || product.status == 5) &&
                    product.refundQueryId == msg.queryId
                ) throw ErrorsV2.InvalidRefund;
                if (product.status == 6) {
                    product.status = 5;
                    storage.products.set(product.id, product.toCell());
                    val listingResult = storage.assetListings.get(product.nftItem);
                    if (listingResult.isFound && listingResult.loadValue() == product.id) {
                        storage.assetListings.delete(product.nftItem);
                    }
                }

                val refundPayoutResult = payoutStorage
                    .payouts
                    .get(operations.buyerRefundOperationId);
                assert (refundPayoutResult.isFound) throw ErrorsV2.InvalidPayout;
                var refundPayout = MarketplaceV2Payout.fromCell(refundPayoutResult.loadValue());
                assert (
                    refundPayout.kind == 3 && refundPayout.beneficiary == parties.buyer
                ) throw ErrorsV2.InvalidPayout;
                assert (refundPayout.amount > 0) throw ErrorsV2.InvalidPayout;
                if (refundPayout.status == 0) {
                    refundPayout.queryId = operations.buyerRefundQueryId;
                    refundPayout.status = 2;
                    order.refundStatus = 2;
                    order.status = 8;
                    orderStorage.orders.set(order.id, order.toCell());
                    payoutStorage.payouts.set(refundPayout.operationId, refundPayout.toCell());
                    payoutStorage
                        .payoutQueryToOperation
                        .set(refundPayout.queryId, refundPayout.operationId);
                    purchase.orders = orderStorage.toCell();
                    purchase.payoutStorage = payoutStorage.toCell();
                    storage.purchaseStorage = purchase.toCell();
                    storage.save();

                    val buyerRefund = createMessage({
                        bounce: BounceMode.RichBounce,
                        value: refundPayout.amount,
                        dest: refundPayout.beneficiary,
                        body: BuyerRefundV2 {
                            orderId: refundPayout.orderId,
                            operationId: refundPayout.operationId,
                            queryId: refundPayout.queryId,
                        },
                    });
                    buyerRefund.send(SEND_MODE_PAY_FEES_SEPARATELY);
                } else {
                    assert (
                        refundPayout.status == 2 || refundPayout.status == 3
                    ) throw ErrorsV2.InvalidPayout;
                }

                val orderRefundAck = createMessage({
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
                orderRefundAck.send(SEND_MODE_REGULAR);
                return;
            }

            val queryResult = purchase.refundQueryToProduct.get(msg.queryId);
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

    if (!storage.escrowConfigured) {
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

        if (opcode == 0x71b00101 || opcode == 0x71b00102 || opcode == 0x71b00104) {
            var purchase = storage.purchaseStorage.load();
            var orderStorage = purchase.orders.load();
            var payoutStorage = purchase.payoutStorage.load();

            if (opcode == 0x71b00101) {
                val bounced = lazy SellerPayoutV2.fromCell(originalBody);
                val payoutResult = payoutStorage.payouts.get(bounced.operationId);
                if (!payoutResult.isFound) {
                    return;
                }
                var payout = MarketplaceV2Payout.fromCell(payoutResult.loadValue());
                if (
                    payout.kind != 1 || payout.orderId != bounced.orderId ||
                    payout.beneficiary != in.senderAddress ||
                    payout.queryId != bounced.queryId ||
                    payout.status != 2
                ) {
                    return;
                }
                val orderResult = orderStorage.orders.get(bounced.orderId);
                if (!orderResult.isFound) {
                    return;
                }
                var order = MarketplaceV2Order.fromCell(orderResult.loadValue());
                if (order.deliveryStatus != 2) {
                    return;
                }
                payout.status = 3;
                order.sellerPayoutStatus = 3;
                order.status = 4;
                payoutStorage.payouts.set(payout.operationId, payout.toCell());
                orderStorage.orders.set(order.id, order.toCell());
            } else if (opcode == 0x71b00102) {
                val bounced = lazy PlatformPayoutV2.fromCell(originalBody);
                val payoutResult = payoutStorage.payouts.get(bounced.operationId);
                if (!payoutResult.isFound) {
                    return;
                }
                var payout = MarketplaceV2Payout.fromCell(payoutResult.loadValue());
                if (
                    payout.kind != 2 || payout.orderId != bounced.orderId ||
                    payout.beneficiary != in.senderAddress ||
                    payout.queryId != bounced.queryId ||
                    payout.status != 2
                ) {
                    return;
                }
                val orderResult = orderStorage.orders.get(bounced.orderId);
                if (!orderResult.isFound) {
                    return;
                }
                var order = MarketplaceV2Order.fromCell(orderResult.loadValue());
                if (order.deliveryStatus != 2) {
                    return;
                }
                payout.status = 3;
                order.platformPayoutStatus = 3;
                order.status = 4;
                payoutStorage.payouts.set(payout.operationId, payout.toCell());
                orderStorage.orders.set(order.id, order.toCell());
            } else {
                val bounced = lazy BuyerRefundV2.fromCell(originalBody);
                val payoutResult = payoutStorage.payouts.get(bounced.operationId);
                if (!payoutResult.isFound) {
                    return;
                }
                var payout = MarketplaceV2Payout.fromCell(payoutResult.loadValue());
                if (
                    payout.kind != 3 || payout.orderId != bounced.orderId ||
                    payout.beneficiary != in.senderAddress ||
                    payout.queryId != bounced.queryId ||
                    payout.status != 2
                ) {
                    return;
                }
                val orderResult = orderStorage.orders.get(bounced.orderId);
                if (!orderResult.isFound) {
                    return;
                }
                var order = MarketplaceV2Order.fromCell(orderResult.loadValue());
                if (order.deliveryStatus != 3 || order.refundStatus != 2) {
                    return;
                }
                payout.status = 3;
                order.refundStatus = 3;
                order.status = 6;
                payoutStorage.payouts.set(payout.operationId, payout.toCell());
                orderStorage.orders.set(order.id, order.toCell());
            }

            purchase.orders = orderStorage.toCell();
            purchase.payoutStorage = payoutStorage.toCell();
            storage.purchaseStorage = purchase.toCell();
            storage.save();
            return;
        }

        // Listing creation bounces are accepted only from the configured Escrow.
        if (in.senderAddress != storage.escrow) {
            return;
        }

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

get fun treasuryV2(): address {
    return MarketplaceV2Storage.load().purchaseStorage.load().treasury;
}

get fun treasuryConfiguredV2(): bool {
    return MarketplaceV2Storage.load().purchaseStorage.load().treasuryConfigured;
}

get fun orderV2(orderId: uint64): MarketplaceV2Order? {
    val purchase = MarketplaceV2Storage.load().purchaseStorage.load();
    val orderStorage = purchase.orders.load();
    val result = orderStorage.orders.get(orderId);
    if (!result.isFound) {
        return null;
    }
    return MarketplaceV2Order.fromCell(result.loadValue());
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
