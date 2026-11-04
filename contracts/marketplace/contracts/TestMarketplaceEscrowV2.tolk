import "types"

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
    storage: NFTEscrowV2Storage
    incomingMessages: TestMarketplaceEscrowV2AllowedMessage
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy TestMarketplaceEscrowV2AllowedMessage.fromSlice(in.body);
    match (msg) {
        CreateEscrowV2 => {
            var storage = lazy NFTEscrowV2Storage.load();
            assert (in.senderAddress == storage.marketplace) throw ErrorsV2.InvalidRelease;
            val escrowId = msg.productId;
            val existing = storage.records.get(escrowId);
            assert (!existing.isFound) throw ErrorsV2.AssetAlreadyEscrowed;
            val createExtra = msg.extra.load();
            val record = NFTEscrowV2Record {
                escrowId,
                nftItem: msg.nftItem,
                seller: msg.seller,
                productId: msg.productId,
                status: 1,
                queryId: msg.queryId,
                extra: NFTEscrowV2RecordExtra {
                    collection: msg.collection,
                    itemIndex: createExtra.itemIndex,
                    kind: createExtra.kind,
                }.toCell(),
            };
            storage.records.set(escrowId, record.toCell());
            storage.assetToEscrow.set(msg.nftItem, escrowId);
            storage.queryToEscrow.set(msg.queryId, escrowId);
            storage.nextEscrowId = escrowId + 1;
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
            val storage = lazy NFTEscrowV2Storage.load();
            assert (in.senderAddress == storage.marketplace) throw ErrorsV2.InvalidRelease;
            val recordResult = storage.records.get(msg.escrowId);
            assert (recordResult.isFound) throw ErrorsV2.InvalidRelease;
            val record = NFTEscrowV2Record.fromCell(recordResult.loadValue());
            assert (record.productId == msg.productId) throw ErrorsV2.InvalidRelease;
            assert (record.status == 1) throw ErrorsV2.InvalidRelease;
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
            var storage = lazy NFTEscrowV2Storage.load();
            assert (in.senderAddress == storage.marketplace) throw ErrorsV2.InvalidRefund;
            val recordResult = storage.records.get(msg.escrowId);
            assert (recordResult.isFound) throw ErrorsV2.InvalidRefund;
            val record = NFTEscrowV2Record.fromCell(recordResult.loadValue());
            assert (record.productId == msg.productId) throw ErrorsV2.InvalidRefund;
            assert (record.seller == msg.seller) throw ErrorsV2.InvalidRefund;
            var updatedRecord = record;
            updatedRecord.status = 5;
            storage.records.set(msg.escrowId, updatedRecord.toCell());
            storage.assetToEscrow.delete(record.nftItem);
            storage.save();

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
            val storage = lazy NFTEscrowV2Storage.load();
            assert (in.senderAddress == storage.marketplace) throw ErrorsV2.InvalidReleaseConfirmation;
        }

        EscrowReleaseFailureAckV2 => {
            val storage = lazy NFTEscrowV2Storage.load();
            assert (in.senderAddress == storage.marketplace) throw ErrorsV2.InvalidReleaseConfirmation;
        }

        EscrowRefundAckV2 => {
            val storage = lazy NFTEscrowV2Storage.load();
            assert (in.senderAddress == storage.marketplace) throw ErrorsV2.InvalidRefund;
        }
    }
}

fun onBouncedMessage(_in: InMessageBounced) {}
