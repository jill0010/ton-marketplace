import "types"

contract Marketplace {
    author: "Acton User"
    version: "1.0.0"
    description: "TON digital asset marketplace"
    storage: MarketplaceStorage
    incomingMessages: AllowedMessage
}

type AllowedMessage =
    | ChangeOwner
    | SetEscrowAddress
    | PublishProduct
    | RetryCreateEscrow
    | EscrowDeposited
    | EscrowRefunded

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessage.fromSlice(in.body);

    match (msg) {
        ChangeOwner => {
            var storage = lazy MarketplaceStorage.load();
            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;
            storage.owner = msg.newOwner;
            storage.save();
        }
        SetEscrowAddress => {
            var storage = lazy MarketplaceStorage.load();
            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;
            storage.escrow = msg.escrow;
            storage.escrowConfigured = true;
            storage.save();
        }
        PublishProduct => {
            var storage = lazy MarketplaceStorage.load();

            assert (storage.escrowConfigured) throw Errors.EscrowNotConfigured;
            assert (msg.kind == 1 || msg.kind == 2 || msg.kind == 3) throw Errors.InvalidProductKind;
            assert (msg.price > 0) throw Errors.InvalidProductPrice;

            val seller = in.senderAddress;
            val productId = storage.nextProductId;
            assert (productId > 0) throw Errors.InvalidQueryId;

            val productExtra = ProductExtra {
                collection: msg.collection,
                queryId: productId,
                itemIndex: msg.itemIndex,
            };

            val product = Product {
                id: productId,
                seller: seller,
                kind: msg.kind,
                assetAddress: msg.nftItem,
                price: msg.price,
                deliveryMode: msg.deliveryMode,
                status: 1,
                createdAt: in.createdAt,
                extra: productExtra.toCell(),
            };

            val escrowAddress = storage.escrow;

            storage.products.set(productId, product);
            storage.nextProductId = productId + 1;
            storage.save();

            val createExtra = CreateEscrowExtra {
                queryId: productId,
                createdAt: in.createdLt,
                itemIndex: msg.itemIndex,
            };

            val escrowMessage = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: grams("0.05"),
                dest: escrowAddress,
                body: CreateEscrow {
                    nftItem: msg.nftItem,
                    collection: msg.collection,
                    seller: seller,
                    productId: productId,
                    kind: msg.kind,
                    extra: createExtra.toCell(),
                },
            });

            escrowMessage.send(SEND_MODE_REGULAR);
        }
        RetryCreateEscrow => {
            var storage = lazy MarketplaceStorage.load();

            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;
            assert (storage.escrowConfigured) throw Errors.EscrowNotConfigured;

            val productResult = storage.products.get(msg.productId);
            assert (productResult.isFound) throw Errors.ProductNotFound;

            val product = productResult.loadValue();
            assert (product.status == 1) throw Errors.ProductNotPending;

            val productExtra = product.extra.load();

            val createExtra = CreateEscrowExtra {
                queryId: productExtra.queryId,
                createdAt: 0,
                itemIndex: productExtra.itemIndex,
            };

            val retryMessage = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: grams("0.05"),
                dest: storage.escrow,
                body: CreateEscrow {
                    nftItem: product.assetAddress,
                    collection: productExtra.collection,
                    seller: product.seller,
                    productId: product.id,
                    kind: product.kind,
                    extra: createExtra.toCell(),
                },
            });

            retryMessage.send(SEND_MODE_REGULAR);
        }
        EscrowDeposited => {
            var storage = lazy MarketplaceStorage.load();

            assert (storage.escrowConfigured) throw Errors.EscrowNotConfigured;
            assert (in.senderAddress == storage.escrow) throw Errors.InvalidEscrowCallback;

            val productResult = storage.products.get(msg.productId);
            assert (productResult.isFound) throw Errors.ProductNotFound;

            var product = productResult.loadValue();
            val productExtra = product.extra.load();

            assert (productExtra.queryId == msg.queryId) throw Errors.InvalidQueryId;
            assert (product.assetAddress == msg.nftItem) throw Errors.InvalidNftItem;
            assert (product.seller == msg.seller) throw Errors.InvalidSeller;

            // 首次通知：激活商品；重复通知：保持激活状态并重新 ACK。
            assert (
                product.status == 1 ||
                product.status == 2
            ) throw Errors.ProductNotPending;

            if (product.status == 1) {
                product.status = 2;
                storage.products.set(msg.productId, product);
                storage.save();
            }

            val ack = EscrowDepositAck {
                queryId: msg.queryId,
                productId: msg.productId,
                nftItem: msg.nftItem,
                seller: msg.seller,
            };

            val ackMessage = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: grams("0.03"),
                dest: storage.escrow,
                body: ack,
            });

            ackMessage.send(SEND_MODE_REGULAR);
        }
        EscrowRefunded => {
            var storage = lazy MarketplaceStorage.load();

            assert (storage.escrowConfigured) throw Errors.EscrowNotConfigured;
            assert (in.senderAddress == storage.escrow) throw Errors.InvalidEscrowCallback;

            val productResult = storage.products.get(msg.productId);
            assert (productResult.isFound) throw Errors.ProductNotFound;

            var product = productResult.loadValue();
            val productExtra = product.extra.load();

            assert (productExtra.queryId == msg.queryId) throw Errors.InvalidRefundConfirmation;
            assert (product.assetAddress == msg.nftItem) throw Errors.InvalidRefundConfirmation;
            assert (product.seller == msg.seller) throw Errors.InvalidRefundConfirmation;

            // 首次通知：取消商品；重复通知：保持已取消状态并重新 ACK。
            assert (
                product.status == 2 ||
                product.status == 5
            ) throw Errors.InvalidProductStatus;

            if (product.status == 2) {
                product.status = 5;
                storage.products.set(msg.productId, product);
                storage.save();
            }

            // 通知 Escrow：Marketplace 已确认处理这笔退款。
            val ack = EscrowRefundAck {
                queryId: msg.queryId,
                productId: msg.productId,
                nftItem: msg.nftItem,
                seller: msg.seller,
            };

            val ackMessage = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: grams("0.03"),
                dest: storage.escrow,
                body: ack,
            });

            ackMessage.send(SEND_MODE_REGULAR);
        }
        else => {
            assert (in.body.isEmpty()) throw Errors.InvalidMessage;
        }
    }
}

fun onBouncedMessage(_in: InMessageBounced) {}

get fun owner(): address {
    val storage = lazy MarketplaceStorage.load();
    return storage.owner;
}

get fun escrow(): address {
    val storage = lazy MarketplaceStorage.load();
    return storage.escrow;
}

get fun escrowConfigured(): bool {
    val storage = lazy MarketplaceStorage.load();
    return storage.escrowConfigured;
}

get fun product(productId: uint64): Product? {
    val storage = lazy MarketplaceStorage.load();
    val result = storage.products.get(productId);

    if (!result.isFound) {
        return null;
    }

    return result.loadValue();
}
