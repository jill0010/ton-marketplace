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
                assert (!existingQuery.isFound) throw ErrorsV2.InvalidRefund;

                product.status = 6;
                product.refundQueryId = queryId;
                storage.products.set(msg.productId, product.toCell());
                purchase.refundQueryToProduct.set(queryId, msg.productId);
                purchase.save();
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
            assert (storage.escrowConfigured) throw ErrorsV2.InvalidRefund;
            assert (in.senderAddress == storage.escrow) throw ErrorsV2.InvalidRefund;

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

get fun treasuryV2(): address {
    return MarketplaceV2Storage.load().purchaseStorage.load().treasury;
}

get fun treasuryConfiguredV2(): bool {
    return MarketplaceV2Storage.load().purchaseStorage.load().treasuryConfigured;
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
