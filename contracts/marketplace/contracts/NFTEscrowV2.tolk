import "types"

contract NFTEscrowV2 {
    author: "TON Market"
    version: "2.0.0"
    description: "Isolated Marketplace V2 NFT release escrow"
    storage: NFTEscrowV2Storage
    incomingMessages: NFTEscrowV2AllowedMessage
}

type NFTEscrowV2AllowedMessage =
    | ReleaseEscrowV2
    | NftExcesses
    | EscrowReleaseAckV2
    | RetryReleaseCallbackV2

fun onInternalMessage(in: InMessage) {
    val msg = lazy NFTEscrowV2AllowedMessage.fromSlice(in.body);

    match (msg) {
        ReleaseEscrowV2 => {
            var storage = lazy NFTEscrowV2Storage.load();
            assert (in.senderAddress == storage.marketplace) throw ErrorsV2.InvalidRelease;
            assert (msg.orderId > 0 && msg.productId > 0 && msg.queryId > 0) throw ErrorsV2.InvalidRelease;
            assert (msg.buyer != storage.marketplace) throw ErrorsV2.InvalidRelease;

            val recordResult = storage.records.get(msg.escrowId);
            assert (recordResult.isFound) throw ErrorsV2.InvalidRelease;
            var record = NFTEscrowV2Record.fromCell(recordResult.loadValue());
            assert (record.escrowId == msg.escrowId) throw ErrorsV2.InvalidRelease;
            assert (record.productId == msg.productId) throw ErrorsV2.InvalidRelease;

            val callback = EscrowReleaseCallbackV2 {
                orderId: msg.orderId,
                productId: msg.productId,
                escrowId: msg.escrowId,
                queryId: msg.queryId,
                nftItem: record.nftItem,
                buyer: msg.buyer,
            };

            if (record.status == 2) {
                // Exact duplicate delivery request is idempotent: do not transfer twice.
                val pendingResult = storage.pendingReleases.get(msg.escrowId);
                assert (pendingResult.isFound) throw ErrorsV2.ReleaseAlreadyPending;
                val pending = EscrowReleaseCallbackV2.fromCell(pendingResult.loadValue());
                assert (pending.toCell().hash() == callback.toCell().hash()) throw ErrorsV2.ReleaseAlreadyPending;
                return;
            }

            assert (record.status == 1) throw ErrorsV2.InvalidRelease;
            assert (msg.buyer != record.seller) throw ErrorsV2.InvalidRelease;

            val existingQuery = storage.queryToEscrow.get(msg.queryId);
            assert (!existingQuery.isFound) throw ErrorsV2.InvalidRelease;

            record.status = 2;
            storage.records.set(msg.escrowId, record.toCell());
            storage.pendingReleases.set(msg.escrowId, callback.toCell());
            storage.queryToEscrow.set(msg.queryId, msg.escrowId);
            storage.save();

            val transfer = NftTransfer {
                queryId: msg.queryId,
                newOwner: msg.buyer,
                responseDestination: contract.getAddress(),
                customPayload: null,
                forwardAmount: grams("0.01"),
                forwardPayload: beginCell().endCell().beginParse(),
            };
            val transferMessage = createMessage({
                bounce: BounceMode.RichBounce,
                value: grams("0.05"),
                dest: record.nftItem,
                body: transfer,
            });
            transferMessage.send(SEND_MODE_PAY_FEES_SEPARATELY);
        }

        NftExcesses => {
            var storage = lazy NFTEscrowV2Storage.load();
            val indexResult = storage.queryToEscrow.get(msg.queryId);
            assert (indexResult.isFound) throw ErrorsV2.InvalidReleaseConfirmation;
            val escrowId = indexResult.loadValue();

            val recordResult = storage.records.get(escrowId);
            assert (recordResult.isFound) throw ErrorsV2.InvalidReleaseConfirmation;
            var record = NFTEscrowV2Record.fromCell(recordResult.loadValue());
            assert (in.senderAddress == record.nftItem) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (record.status == 2) throw ErrorsV2.InvalidReleaseConfirmation;

            val pendingResult = storage.pendingReleases.get(escrowId);
            assert (pendingResult.isFound) throw ErrorsV2.InvalidReleaseConfirmation;
            val pending = EscrowReleaseCallbackV2.fromCell(pendingResult.loadValue());
            assert (pending.queryId == msg.queryId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (pending.productId == record.productId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (pending.escrowId == escrowId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (pending.nftItem == record.nftItem) throw ErrorsV2.InvalidReleaseConfirmation;

            record.status = 3;
            storage.records.set(escrowId, record.toCell());
            storage.pendingReleases.delete(escrowId);
            storage.releaseCallbacks.set(escrowId, pending.toCell());
            storage.save();

            val callbackMessage = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: grams("0.03"),
                dest: storage.marketplace,
                body: EscrowReleasedV2 {
                    orderId: pending.orderId,
                    productId: pending.productId,
                    escrowId: pending.escrowId,
                    queryId: pending.queryId,
                    nftItem: pending.nftItem,
                    buyer: pending.buyer,
                },
            });
            callbackMessage.send(SEND_MODE_REGULAR);
        }

        EscrowReleaseAckV2 => {
            var storage = lazy NFTEscrowV2Storage.load();
            assert (in.senderAddress == storage.marketplace) throw ErrorsV2.InvalidReleaseConfirmation;
            val callbackResult = storage.releaseCallbacks.get(msg.escrowId);
            assert (callbackResult.isFound) throw ErrorsV2.InvalidReleaseConfirmation;
            val callback = EscrowReleaseCallbackV2.fromCell(callbackResult.loadValue());
            assert (callback.orderId == msg.orderId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (callback.productId == msg.productId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (callback.escrowId == msg.escrowId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (callback.queryId == msg.queryId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (callback.nftItem == msg.nftItem) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (callback.buyer == msg.buyer) throw ErrorsV2.InvalidReleaseConfirmation;
            storage.releaseCallbacks.delete(msg.escrowId);
            storage.save();
        }

        RetryReleaseCallbackV2 => {
            val storage = lazy NFTEscrowV2Storage.load();
            assert (in.senderAddress == storage.owner) throw ErrorsV2.NotOwner;
            val callbackResult = storage.releaseCallbacks.get(msg.escrowId);
            assert (callbackResult.isFound) throw ErrorsV2.InvalidReleaseConfirmation;
            val callback = EscrowReleaseCallbackV2.fromCell(callbackResult.loadValue());
            val retryMessage = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: grams("0.03"),
                dest: storage.marketplace,
                body: EscrowReleasedV2 {
                    orderId: callback.orderId,
                    productId: callback.productId,
                    escrowId: callback.escrowId,
                    queryId: callback.queryId,
                    nftItem: callback.nftItem,
                    buyer: callback.buyer,
                },
            });
            retryMessage.send(SEND_MODE_REGULAR);
        }
    }
}

fun onBouncedMessage(in: InMessageBounced) {
    if (in.bouncedBody.remainingBitsCount() < 32) {
        return;
    }

    val bouncePrefix = in.bouncedBody.preloadUint(32);
    if (bouncePrefix == 0xfffffffe) {
        val rich = lazy RichBounceBody.fromSlice(in.bouncedBody);
        val originalBody = rich.originalBody;
        if (originalBody.beginParse().remainingBitsCount() < 32) {
            return;
        }

        val opcode = originalBody.beginParse().preloadUint(32);
        if (opcode != 0x5fcc3d14) {
            return;
        }

        val transfer = lazy NftTransfer.fromSlice(originalBody.beginParse());
        if (transfer.responseDestination == null || transfer.responseDestination!! != contract.getAddress()) {
            return;
        }

        var storage = lazy NFTEscrowV2Storage.load();
        val indexResult = storage.queryToEscrow.get(transfer.queryId);
        if (!indexResult.isFound) {
            return;
        }
        val escrowId = indexResult.loadValue();
        val recordResult = storage.records.get(escrowId);
        if (!recordResult.isFound) {
            return;
        }
        var record = NFTEscrowV2Record.fromCell(recordResult.loadValue());
        val pendingResult = storage.pendingReleases.get(escrowId);
        if (!pendingResult.isFound) {
            return;
        }
        val pending = EscrowReleaseCallbackV2.fromCell(pendingResult.loadValue());

        if (
            in.senderAddress == record.nftItem &&
            pending.queryId == transfer.queryId &&
            pending.buyer == transfer.newOwner &&
            pending.nftItem == record.nftItem &&
            record.status == 2
        ) {
            record.status = 1;
            storage.records.set(escrowId, record.toCell());
            storage.pendingReleases.delete(escrowId);
            storage.queryToEscrow.delete(transfer.queryId);
            storage.save();
        }
    } else if (bouncePrefix == 0xffffffff) {
        var bodySlice = in.bouncedBody;
        bodySlice.skipBouncedPrefix();
        if (bodySlice.remainingBitsCount() < 32) {
            return;
        }
        val opcode = bodySlice.loadUint(32);
        if (opcode == 0x71b00003) {
            val storage = lazy NFTEscrowV2Storage.load();
            assert (in.senderAddress == storage.marketplace) throw ErrorsV2.InvalidMessage;
            // Callback remains persisted for an owner-authorized retry.
        }
    }
}

get fun owner(): address {
    return NFTEscrowV2Storage.load().owner;
}

get fun marketplace(): address {
    return NFTEscrowV2Storage.load().marketplace;
}

get fun escrowRecordV2(escrowId: uint64): NFTEscrowV2Record? {
    val result = NFTEscrowV2Storage.load().records.get(escrowId);
    if (!result.isFound) {
        return null;
    }
    return NFTEscrowV2Record.fromCell(result.loadValue());
}

get fun releaseCallbackV2(escrowId: uint64): EscrowReleaseCallbackV2? {
    val result = NFTEscrowV2Storage.load().releaseCallbacks.get(escrowId);
    if (!result.isFound) {
        return null;
    }
    return EscrowReleaseCallbackV2.fromCell(result.loadValue());
}
