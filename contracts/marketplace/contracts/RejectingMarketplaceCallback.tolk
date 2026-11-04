import "types"

struct (0x7f000002) SetRejectCallbackV2 {
    rejectAction: bool
}

struct (0x7f000003) StartTestEscrowV2 {
    productId: uint64
    nftItem: address
    seller: address
    queryId: uint64
}

struct (0x7f000005) SetTestEscrowAddressV2 {
    escrow: address
}

struct (0x7f000004) StartTestReleaseV2 {
    orderId: uint64
    productId: uint64
    escrowId: uint64
    queryId: uint64
    buyer: address
}

struct RejectingMarketplaceCallbackStorage {
    controller: address
    escrow: address
    rejectAction: bool
}

fun RejectingMarketplaceCallbackStorage.load(): RejectingMarketplaceCallbackStorage {
    return RejectingMarketplaceCallbackStorage.fromCell(contract.getData());
}

fun RejectingMarketplaceCallbackStorage.save(self) {
    contract.setData(self.toCell());
}

type RejectingMarketplaceCallbackAllowedMessage =
    | SetRejectCallbackV2
    | StartTestEscrowV2
    | StartTestReleaseV2
    | SetTestEscrowAddressV2
    | EscrowDepositedV2
    | EscrowReleasedV2
    | EscrowReleaseFailedV2
    | PlatformPayoutV2

contract RejectingMarketplaceCallback {
    author: "TON Market"
    version: "1.0.0"
    description: "Test-only Marketplace receiver that can force an action-phase failure"
    storage: RejectingMarketplaceCallbackStorage
    incomingMessages: RejectingMarketplaceCallbackAllowedMessage
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy RejectingMarketplaceCallbackAllowedMessage.fromSlice(in.body);
    match (msg) {
        SetRejectCallbackV2 => {
            var storage = lazy RejectingMarketplaceCallbackStorage.load();
            assert (in.senderAddress == storage.controller) throw ErrorsV2.NotOwner;
            storage.rejectAction = msg.rejectAction;
            storage.save();
        }

        SetTestEscrowAddressV2 => {
            var storage = lazy RejectingMarketplaceCallbackStorage.load();
            assert (in.senderAddress == storage.controller) throw ErrorsV2.NotOwner;
            storage.escrow = msg.escrow;
            storage.save();
        }

        StartTestEscrowV2 => {
            val storage = lazy RejectingMarketplaceCallbackStorage.load();
            assert (in.senderAddress == storage.controller) throw ErrorsV2.NotOwner;
            createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: grams("0.05"),
                dest: storage.escrow,
                body: CreateEscrowV2 {
                    productId: msg.productId,
                    nftItem: msg.nftItem,
                    collection: storage.controller,
                    seller: msg.seller,
                    queryId: msg.queryId,
                    extra: CreateEscrowV2Extra {
                        itemIndex: 0,
                        kind: 3,
                    }.toCell(),
                },
            }).send(SEND_MODE_PAY_FEES_SEPARATELY);
        }

        StartTestReleaseV2 => {
            val storage = lazy RejectingMarketplaceCallbackStorage.load();
            assert (in.senderAddress == storage.controller) throw ErrorsV2.NotOwner;
            createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: grams("0.1"),
                dest: storage.escrow,
                body: ReleaseEscrowV2 {
                    orderId: msg.orderId,
                    productId: msg.productId,
                    escrowId: msg.escrowId,
                    queryId: msg.queryId,
                    buyer: msg.buyer,
                },
            }).send(SEND_MODE_PAY_FEES_SEPARATELY);
        }

        EscrowDepositedV2 => {
            val storage = lazy RejectingMarketplaceCallbackStorage.load();
            createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: grams("0.01"),
                dest: storage.escrow,
                body: EscrowDepositAckV2 {
                    escrowId: msg.escrowId,
                    productId: msg.productId,
                    nftItem: msg.nftItem,
                    seller: msg.seller,
                    queryId: msg.queryId,
                },
            }).send(SEND_MODE_PAY_FEES_SEPARATELY);
        }

        EscrowReleasedV2 => {
            val storage = lazy RejectingMarketplaceCallbackStorage.load();
            if (storage.rejectAction) {
                // Deliberately exceed the receiver's available balance. The incoming
                // callback's action phase must fail with noFunds and bounce to Escrow.
                createMessage({
                    bounce: false,
                    value: grams("1"),
                    dest: storage.controller,
                    body: beginCell().endCell().beginParse(),
                }).send(SEND_MODE_REGULAR + SEND_MODE_BOUNCE_ON_ACTION_FAIL);
            } else {
                createMessage({
                    bounce: BounceMode.Only256BitsOfBody,
                    value: grams("0.01"),
                    dest: storage.escrow,
                    body: EscrowReleaseAckV2 {
                        orderId: msg.orderId,
                        productId: msg.productId,
                        escrowId: msg.escrowId,
                        queryId: msg.queryId,
                        nftItem: msg.nftItem,
                        buyer: msg.buyer,
                    },
                }).send(SEND_MODE_PAY_FEES_SEPARATELY);
            }
        }

        PlatformPayoutV2 => {
            val storage = lazy RejectingMarketplaceCallbackStorage.load();
            if (storage.rejectAction) {
                // Force a real action-phase no-funds bounce for the platform payout.
                createMessage({
                    bounce: false,
                    value: grams("1"),
                    dest: storage.controller,
                    body: beginCell().endCell().beginParse(),
                }).send(SEND_MODE_REGULAR + SEND_MODE_BOUNCE_ON_ACTION_FAIL);
            }
        }

        EscrowReleaseFailedV2 => {
            val storage = lazy RejectingMarketplaceCallbackStorage.load();
            if (storage.rejectAction) {
                // Force a real action-phase failure so the durable failure callback
                // must remain stored and be retried by the Escrow owner.
                createMessage({
                    bounce: false,
                    value: grams("1"),
                    dest: storage.controller,
                    body: beginCell().endCell().beginParse(),
                }).send(SEND_MODE_REGULAR + SEND_MODE_BOUNCE_ON_ACTION_FAIL);
            } else {
                createMessage({
                    bounce: BounceMode.Only256BitsOfBody,
                    value: grams("0.01"),
                    dest: storage.escrow,
                    body: EscrowReleaseFailureAckV2 {
                        orderId: msg.orderId,
                        productId: msg.productId,
                        escrowId: msg.escrowId,
                        queryId: msg.queryId,
                        nftItem: msg.nftItem,
                        buyer: msg.buyer,
                    },
                }).send(SEND_MODE_PAY_FEES_SEPARATELY);
            }
        }

        else => {
            assert (in.body.isEmpty()) throw ErrorsV2.InvalidMessage;
        }
    }
}

fun onBouncedMessage(_in: InMessageBounced) {}

get fun rejectAction(): bool {
    return RejectingMarketplaceCallbackStorage.load().rejectAction;
}
