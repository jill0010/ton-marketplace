import "types"

struct TestMarketplaceEscrowV2Record {
    productId: uint64
    nftItem: address
    seller: address
    queryId: uint64
}

struct TestMarketplaceEscrowV2Storage {
    owner: address
    marketplace: address
    records: map<uint64, Cell<TestMarketplaceEscrowV2Record>>
}

type TestMarketplaceEscrowV2AllowedMessage =
    | CreateEscrowV2
    | ReleaseEscrowV2
    | RefundEscrowV2
    | EscrowDepositAckV2
    | EscrowReleaseFailureAckV2
    | EscrowRefundAckV2

contract TestMarketplaceEscrowV2 {
    author: "TON Market"
    version: "1.0.0"
    description: "Test-only Escrow that deterministically fails NFT delivery and confirms seller return"
    storage: TestMarketplaceEscrowV2Storage
    incomingMessages: TestMarketplaceEscrowV2AllowedMessage
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy TestMarketplaceEscrowV2AllowedMessage.fromSlice(in.body);
    match (msg) {
        CreateEscrowV2 => {
            var storage = lazy TestMarketplaceEscrowV2Storage.load();
            assert (in.senderAddress == storage.marketplace) throw ErrorsV2.InvalidRelease;
            val escrowId = msg.productId;
            val existing = storage.records.get(escrowId);
            assert (!existing.isFound) throw ErrorsV2.AssetAlreadyEscrowed;
            val record = TestMarketplaceEscrowV2Record {
                productId: msg.productId,
                nftItem: msg.nftItem,
                seller: msg.seller,
                queryId: msg.queryId,
            };
            storage.records.set(escrowId, record.toCell());
            storage.save();

            val callback = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: grams("0.03"),
                dest: storage.marketplace,
                body: EscrowDepositedV2 {
                    escrowId,
                    productId: msg.productId,
                    nftItem: msg.nftItem,
                    seller: msg.seller,
                    queryId: msg.queryId,
                },
            });
            callback.send(SEND_MODE_REGULAR);
        }

        ReleaseEscrowV2 => {
            val storage = lazy TestMarketplaceEscrowV2Storage.load();
            assert (in.senderAddress == storage.marketplace) throw ErrorsV2.InvalidRelease;
            val recordResult = storage.records.get(msg.escrowId);
            assert (recordResult.isFound) throw ErrorsV2.InvalidRelease;
            val record = TestMarketplaceEscrowV2Record.fromCell(recordResult.loadValue());
            assert (record.productId == msg.productId) throw ErrorsV2.InvalidRelease;
            assert (record.queryId != 0) throw ErrorsV2.InvalidRelease;

            // Simulate an authenticated release failure from Escrow. The real
            // NFTEscrowV2 emits this only after the official NFT Item transfer bounces.
            val failure = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: grams("0.03"),
                dest: storage.marketplace,
                body: EscrowReleaseFailedV2 {
                    orderId: msg.orderId,
                    productId: msg.productId,
                    escrowId: msg.escrowId,
                    queryId: msg.queryId,
                    nftItem: record.nftItem,
                    buyer: msg.buyer,
                },
            });
            failure.send(SEND_MODE_REGULAR);
        }

        RefundEscrowV2 => {
            val storage = lazy TestMarketplaceEscrowV2Storage.load();
            assert (in.senderAddress == storage.marketplace) throw ErrorsV2.InvalidRefund;
            val recordResult = storage.records.get(msg.escrowId);
            assert (recordResult.isFound) throw ErrorsV2.InvalidRefund;
            val record = TestMarketplaceEscrowV2Record.fromCell(recordResult.loadValue());
            assert (record.productId == msg.productId) throw ErrorsV2.InvalidRefund;
            assert (record.seller == msg.seller) throw ErrorsV2.InvalidRefund;

            val refunded = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: grams("0.03"),
                dest: storage.marketplace,
                body: EscrowRefundedV2 {
                    escrowId: msg.escrowId,
                    productId: msg.productId,
                    queryId: msg.queryId,
                    nftItem: record.nftItem,
                    seller: record.seller,
                },
            });
            refunded.send(SEND_MODE_REGULAR);
        }

        EscrowDepositAckV2 => {
            val storage = lazy TestMarketplaceEscrowV2Storage.load();
            assert (in.senderAddress == storage.marketplace) throw ErrorsV2.InvalidReleaseConfirmation;
        }

        EscrowReleaseFailureAckV2 => {
            val storage = lazy TestMarketplaceEscrowV2Storage.load();
            assert (in.senderAddress == storage.marketplace) throw ErrorsV2.InvalidReleaseConfirmation;
        }

        EscrowRefundAckV2 => {
            val storage = lazy TestMarketplaceEscrowV2Storage.load();
            assert (in.senderAddress == storage.marketplace) throw ErrorsV2.InvalidRefund;
        }
    }
}

fun onBouncedMessage(_in: InMessageBounced) {}
