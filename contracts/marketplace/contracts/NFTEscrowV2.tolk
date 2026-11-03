import "types"

contract NFTEscrowV2 {
    author: "TON Market"
    version: "2.0.0"
    description: "Isolated Marketplace V2 NFT release escrow"
    storage: NFTEscrowV2Storage
    incomingMessages: NFTEscrowV2AllowedMessage
}

type NFTEscrowV2AllowedMessage =
    | CreateEscrowV2
    | ReleaseEscrowV2
    | NftOwnershipAssigned
    | NftExcesses
    | EscrowDepositAckV2
    | RetryDepositCallbackV2
    | EscrowReleaseAckV2
    | RetryReleaseCallbackV2

fun onInternalMessage(in: InMessage) {
    val msg = lazy NFTEscrowV2AllowedMessage.fromSlice(in.body);

    match (msg) {
        CreateEscrowV2 => {
            var storage = lazy NFTEscrowV2Storage.load();
            assert (in.senderAddress == storage.marketplace) throw ErrorsV2.InvalidRelease;
            assert (msg.productId > 0 && msg.queryId > 0) throw ErrorsV2.InvalidRelease;
            assert (!storage.queryToEscrow.get(msg.queryId).isFound) throw ErrorsV2.InvalidRelease;
            assert (
                !storage.assetToEscrow.get(msg.nftItem).isFound
            ) throw ErrorsV2.AssetAlreadyEscrowed;

            val escrowId = storage.nextEscrowId;
            val record = NFTEscrowV2Record {
                escrowId,
                nftItem: msg.nftItem,
                seller: msg.seller,
                productId: msg.productId,
                status: 0,
                queryId: msg.queryId,
            };
            storage.records.set(escrowId, record.toCell());
            storage.queryToEscrow.set(msg.queryId, escrowId);
            storage.assetToEscrow.set(msg.nftItem, escrowId);
            storage.nextEscrowId = escrowId + 1;
            storage.save();
        }

        NftOwnershipAssigned => {
            var storage = lazy NFTEscrowV2Storage.load();
            var callbacks = storage.callbacks.load();
            val indexResult = storage.queryToEscrow.get(msg.queryId);
            assert (indexResult.isFound) throw ErrorsV2.InvalidRelease;
            val escrowId = indexResult.loadValue();
            val recordResult = storage.records.get(escrowId);
            assert (recordResult.isFound) throw ErrorsV2.InvalidRelease;
            var record = NFTEscrowV2Record.fromCell(recordResult.loadValue());
            assert (in.senderAddress == record.nftItem) throw ErrorsV2.InvalidRelease;
            assert (msg.prevOwner == record.seller) throw ErrorsV2.InvalidRelease;
            assert (record.queryId == msg.queryId) throw ErrorsV2.InvalidRelease;
            assert (record.status == 0) throw ErrorsV2.InvalidRelease;
            record.status = 1;
            storage.records.set(escrowId, record.toCell());

            val callback = EscrowDepositCallbackV2 {
                escrowId,
                productId: record.productId,
                nftItem: record.nftItem,
                seller: record.seller,
                queryId: msg.queryId,
            };
            callbacks.depositCallbacks.set(escrowId, callback.toCell());
            storage.callbacks = callbacks.toCell();
            storage.save();

            val callbackMessage = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: grams("0.03"),
                dest: storage.marketplace,
                body: EscrowDepositedV2 {
                    escrowId,
                    productId: record.productId,
                    nftItem: record.nftItem,
                    seller: record.seller,
                    queryId: msg.queryId,
                },
            });
            callbackMessage.send(SEND_MODE_REGULAR);
        }

        EscrowDepositAckV2 => {
            var storage = lazy NFTEscrowV2Storage.load();
            var callbacks = storage.callbacks.load();
            assert (
                in.senderAddress == storage.marketplace
            ) throw ErrorsV2.InvalidReleaseConfirmation;
            val callbackResult = callbacks.depositCallbacks.get(msg.escrowId);
            assert (callbackResult.isFound) throw ErrorsV2.InvalidReleaseConfirmation;
            val callback = EscrowDepositCallbackV2.fromCell(callbackResult.loadValue());
            assert (callback.escrowId == msg.escrowId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (callback.productId == msg.productId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (callback.nftItem == msg.nftItem) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (callback.seller == msg.seller) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (callback.queryId == msg.queryId) throw ErrorsV2.InvalidReleaseConfirmation;
            callbacks.depositCallbacks.delete(msg.escrowId);
            storage.callbacks = callbacks.toCell();
            storage.save();
        }

        RetryDepositCallbackV2 => {
            val storage = lazy NFTEscrowV2Storage.load();
            val callbacks = storage.callbacks.load();
            assert (in.senderAddress == storage.owner) throw ErrorsV2.NotOwner;
            val callbackResult = callbacks.depositCallbacks.get(msg.escrowId);
            assert (callbackResult.isFound) throw ErrorsV2.InvalidReleaseConfirmation;
            val callback = EscrowDepositCallbackV2.fromCell(callbackResult.loadValue());
            val retryMessage = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: grams("0.03"),
                dest: storage.marketplace,
                body: EscrowDepositedV2 {
                    escrowId: callback.escrowId,
                    productId: callback.productId,
                    nftItem: callback.nftItem,
                    seller: callback.seller,
                    queryId: callback.queryId,
                },
            });
            retryMessage.send(SEND_MODE_REGULAR);
        }

        ReleaseEscrowV2 => {
            var storage = lazy NFTEscrowV2Storage.load();
            var callbacks = storage.callbacks.load();
            assert (in.senderAddress == storage.marketplace) throw ErrorsV2.InvalidRelease;
            assert (
                msg.orderId > 0 && msg.productId > 0 && msg.queryId > 0
            ) throw ErrorsV2.InvalidRelease;
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
                val pendingResult = callbacks.pendingReleases.get(msg.escrowId);
                assert (pendingResult.isFound) throw ErrorsV2.ReleaseAlreadyPending;
                val pending = EscrowReleaseCallbackV2.fromCell(pendingResult.loadValue());
                assert (
                    pending.toCell().hash() == callback.toCell().hash()
                ) throw ErrorsV2.ReleaseAlreadyPending;
                return;
            }

            assert (record.status == 1) throw ErrorsV2.InvalidRelease;
            assert (msg.buyer != record.seller) throw ErrorsV2.InvalidRelease;

            val existingQuery = storage.queryToEscrow.get(msg.queryId);
            assert (!existingQuery.isFound) throw ErrorsV2.InvalidRelease;

            record.status = 2;
            storage.records.set(msg.escrowId, record.toCell());
            callbacks.pendingReleases.set(msg.escrowId, callback.toCell());
            storage.callbacks = callbacks.toCell();
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
            var callbacks = storage.callbacks.load();
            val indexResult = storage.queryToEscrow.get(msg.queryId);
            assert (indexResult.isFound) throw ErrorsV2.InvalidReleaseConfirmation;
            val escrowId = indexResult.loadValue();

            val recordResult = storage.records.get(escrowId);
            assert (recordResult.isFound) throw ErrorsV2.InvalidReleaseConfirmation;
            var record = NFTEscrowV2Record.fromCell(recordResult.loadValue());
            assert (in.senderAddress == record.nftItem) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (record.status == 2) throw ErrorsV2.InvalidReleaseConfirmation;

            val pendingResult = callbacks.pendingReleases.get(escrowId);
            assert (pendingResult.isFound) throw ErrorsV2.InvalidReleaseConfirmation;
            val pending = EscrowReleaseCallbackV2.fromCell(pendingResult.loadValue());
            assert (pending.queryId == msg.queryId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (
                pending.productId == record.productId
            ) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (pending.escrowId == escrowId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (pending.nftItem == record.nftItem) throw ErrorsV2.InvalidReleaseConfirmation;

            record.status = 3;
            storage.records.set(escrowId, record.toCell());
            val assetIndexResult = storage.assetToEscrow.get(record.nftItem);
            if (assetIndexResult.isFound && assetIndexResult.loadValue() == escrowId) {
                storage.assetToEscrow.delete(record.nftItem);
            }
            callbacks.pendingReleases.delete(escrowId);
            callbacks.releaseCallbacks.set(escrowId, pending.toCell());
            storage.callbacks = callbacks.toCell();
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
            var callbacks = storage.callbacks.load();
            assert (
                in.senderAddress == storage.marketplace
            ) throw ErrorsV2.InvalidReleaseConfirmation;
            val callbackResult = callbacks.releaseCallbacks.get(msg.escrowId);
            assert (callbackResult.isFound) throw ErrorsV2.InvalidReleaseConfirmation;
            val callback = EscrowReleaseCallbackV2.fromCell(callbackResult.loadValue());
            assert (callback.orderId == msg.orderId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (callback.productId == msg.productId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (callback.escrowId == msg.escrowId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (callback.queryId == msg.queryId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (callback.nftItem == msg.nftItem) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (callback.buyer == msg.buyer) throw ErrorsV2.InvalidReleaseConfirmation;
            callbacks.releaseCallbacks.delete(msg.escrowId);
            storage.callbacks = callbacks.toCell();
            storage.save();
        }

        RetryReleaseCallbackV2 => {
            val storage = lazy NFTEscrowV2Storage.load();
            val callbacks = storage.callbacks.load();
            assert (in.senderAddress == storage.owner) throw ErrorsV2.NotOwner;
            val callbackResult = callbacks.releaseCallbacks.get(msg.escrowId);
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

        else => {
            assert (in.body.isEmpty()) throw ErrorsV2.InvalidMessage;
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
        if (
            transfer.responseDestination == null ||
            transfer.responseDestination!! != contract.getAddress()
        ) {
            return;
        }

        var storage = lazy NFTEscrowV2Storage.load();
        var callbacks = storage.callbacks.load();
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
        val pendingResult = callbacks.pendingReleases.get(escrowId);
        if (!pendingResult.isFound) {
            return;
        }
        val pending = EscrowReleaseCallbackV2.fromCell(pendingResult.loadValue());

        if (
            in.senderAddress == record.nftItem && pending.queryId == transfer.queryId &&
            pending.buyer == transfer.newOwner &&
            pending.nftItem == record.nftItem &&
            record.status == 2
        ) {
            record.status = 1;
            storage.records.set(escrowId, record.toCell());
            callbacks.pendingReleases.delete(escrowId);
            storage.queryToEscrow.delete(transfer.queryId);
            storage.callbacks = callbacks.toCell();
            storage.save();
        }
    } else if (bouncePrefix == 0xffffffff) {
        var bodySlice = in.bouncedBody;
        bodySlice.skipBouncedPrefix();
        if (bodySlice.remainingBitsCount() < 32) {
            return;
        }
        val opcode = bodySlice.loadUint(32);
        if (opcode == 0x71b00003 || opcode == 0x71b00004) {
            val storage = lazy NFTEscrowV2Storage.load();
            assert (in.senderAddress == storage.marketplace) throw ErrorsV2.InvalidMessage;
            // Callback remains persisted for an owner-authorized retry.
        }
    }
}

get fun assetEscrowIdV2(nftItem: address): uint64? {
    val result = NFTEscrowV2Storage.load().assetToEscrow.get(nftItem);
    if (!result.isFound) {
        return null;
    }
    return result.loadValue();
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

get fun depositCallbackV2(escrowId: uint64): EscrowDepositCallbackV2? {
    val callbacks = NFTEscrowV2Storage.load().callbacks.load();
    val result = callbacks.depositCallbacks.get(escrowId);
    if (!result.isFound) {
        return null;
    }
    return EscrowDepositCallbackV2.fromCell(result.loadValue());
}

get fun releaseCallbackV2(escrowId: uint64): EscrowReleaseCallbackV2? {
    val callbacks = NFTEscrowV2Storage.load().callbacks.load();
    val result = callbacks.releaseCallbacks.get(escrowId);
    if (!result.isFound) {
        return null;
    }
    return EscrowReleaseCallbackV2.fromCell(result.loadValue());
}
