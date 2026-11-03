import "types"

struct (0x7f000006) SetMockRejectRefundV2 {
    rejectRefund: bool
}

struct MockMarketplaceEscrowV2Config {
    owner: address
    marketplace: address
}

struct MockMarketplaceEscrowV2State {
    escrowId: uint64
    nftItem: address
    seller: address
    rejectRefund: bool
}

struct MockMarketplaceEscrowV2Storage {
    config: Cell<MockMarketplaceEscrowV2Config>
    state: Cell<MockMarketplaceEscrowV2State>
}

fun MockMarketplaceEscrowV2Storage.load(): MockMarketplaceEscrowV2Storage {
    return MockMarketplaceEscrowV2Storage.fromCell(contract.getData());
}

fun MockMarketplaceEscrowV2Storage.save(self) {
    contract.setData(self.toCell());
}

type MockMarketplaceEscrowV2AllowedMessage =
    | SetMockRejectRefundV2
    | CreateEscrowV2
    | EscrowDepositAckV2
    | ReleaseEscrowV2
    | EscrowReleaseFailureAckV2
    | RefundEscrowV2
    | EscrowRefundAckV2

contract MockMarketplaceEscrowV2 {
    author: "TON Market"
    version: "1.0.0"
    description: "Test-only escrow adapter for Marketplace V2 refund state-machine integration"
    storage: MockMarketplaceEscrowV2Storage
    incomingMessages: MockMarketplaceEscrowV2AllowedMessage
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy MockMarketplaceEscrowV2AllowedMessage.fromSlice(in.body);
    match (msg) {
        SetMockRejectRefundV2 => {
            var storage = lazy MockMarketplaceEscrowV2Storage.load();
            val config = storage.config.load();
            var state = storage.state.load();
            assert (in.senderAddress == config.owner) throw ErrorsV2.NotOwner;
            state.rejectRefund = msg.rejectRefund;
            storage.state = state.toCell();
            storage.save();
        }

        CreateEscrowV2 => {
            var storage = lazy MockMarketplaceEscrowV2Storage.load();
            val config = storage.config.load();
            var state = storage.state.load();
            assert (in.senderAddress == config.marketplace) throw ErrorsV2.InvalidRelease;
            assert (msg.productId > 0 && msg.queryId > 0) throw ErrorsV2.InvalidRelease;
            state.escrowId = 77;
            state.nftItem = msg.nftItem;
            state.seller = msg.seller;
            storage.state = state.toCell();
            storage.save();

            val callback = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: grams("0.03"),
                dest: config.marketplace,
                body: EscrowDepositedV2 {
                    escrowId: storage.escrowId,
                    productId: msg.productId,
                    nftItem: msg.nftItem,
                    seller: msg.seller,
                    queryId: msg.queryId,
                },
            });
            callback.send(SEND_MODE_REGULAR);
        }

        EscrowDepositAckV2 => {
            val storage = lazy MockMarketplaceEscrowV2Storage.load();
            val config = storage.config.load();
            assert (in.senderAddress == config.marketplace) throw ErrorsV2.InvalidReleaseConfirmation;
        }

        ReleaseEscrowV2 => {
            val storage = lazy MockMarketplaceEscrowV2Storage.load();
            val config = storage.config.load();
            val state = storage.state.load();
            assert (in.senderAddress == config.marketplace) throw ErrorsV2.InvalidRelease;
            assert (msg.escrowId == state.escrowId) throw ErrorsV2.InvalidRelease;
            assert (msg.productId > 0 && msg.orderId > 0) throw ErrorsV2.InvalidRelease;

            // Deterministically simulate the escrow's durable release-failure
            // callback. NFTEscrowV2's actual transfer-bounce behavior is covered
            // by its separate emulator integration tests.
            val callback = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: grams("0.03"),
                dest: config.marketplace,
                body: EscrowReleaseFailedV2 {
                    orderId: msg.orderId,
                    productId: msg.productId,
                    escrowId: msg.escrowId,
                    queryId: msg.queryId,
                    nftItem: state.nftItem,
                    buyer: msg.buyer,
                },
            });
            callback.send(SEND_MODE_REGULAR);
        }

        EscrowReleaseFailureAckV2 => {
            val storage = lazy MockMarketplaceEscrowV2Storage.load();
            val config = storage.config.load();
            assert (in.senderAddress == config.marketplace) throw ErrorsV2.InvalidReleaseConfirmation;
        }

        RefundEscrowV2 => {
            val storage = lazy MockMarketplaceEscrowV2Storage.load();
            val config = storage.config.load();
            val state = storage.state.load();
            assert (in.senderAddress == config.marketplace) throw ErrorsV2.InvalidRefund;
            assert (msg.escrowId == state.escrowId) throw ErrorsV2.InvalidRefund;
            assert (msg.seller == state.seller) throw ErrorsV2.InvalidRefund;
            if (state.rejectRefund) {
                throw ErrorsV2.InvalidRefund;
            }

            val callback = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: grams("0.03"),
                dest: config.marketplace,
                body: EscrowRefundedV2 {
                    escrowId: msg.escrowId,
                    productId: msg.productId,
                    queryId: msg.queryId,
                    nftItem: storage.nftItem,
                    seller: msg.seller,
                },
            });
            callback.send(SEND_MODE_REGULAR);
        }

        EscrowRefundAckV2 => {
            val storage = lazy MockMarketplaceEscrowV2Storage.load();
            val config = storage.config.load();
            assert (in.senderAddress == config.marketplace) throw ErrorsV2.InvalidRefund;
        }

        else => {
            assert (in.body.isEmpty()) throw ErrorsV2.InvalidMessage;
        }
    }
}

get fun rejectRefund(): bool {
    val storage = MockMarketplaceEscrowV2Storage.load();
    val state = storage.state.load();
    return state.rejectRefund;
}
