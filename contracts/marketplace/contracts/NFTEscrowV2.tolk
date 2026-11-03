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
    | SetCollectionStatusV2
    | SetCollectionItemCodeV2
    | ReleaseEscrowV2
    | NftOwnershipAssigned
    | NftExcesses
    | EscrowDepositAckV2
    | RetryDepositCallbackV2
    | EscrowReleaseAckV2
    | RetryReleaseCallbackV2
    | EscrowReleaseFailureAckV2
    | RetryReleaseFailureCallbackV2
    | RefundEscrowV2
    | EscrowRefundAckV2
    | RetryRefundCallbackV2

fun onInternalMessage(in: InMessage) {
    val msg = lazy NFTEscrowV2AllowedMessage.fromSlice(in.body);

    match (msg) {
        SetCollectionStatusV2 => {
            var storage = lazy NFTEscrowV2Storage.load();
            assert (in.senderAddress == storage.owner) throw ErrorsV2.NotOwner;
            assert (
                msg.newStatus == 1 || msg.newStatus == 2 || msg.newStatus == 3
            ) throw ErrorsV2.InvalidCollectionStatus;

            var callbacks = storage.callbacks.load();
            var collectionStorage = callbacks.collectionStorage.load();
            if (msg.newStatus == 1) {
                val codeResult = collectionStorage.collectionItemCodes.get(msg.collection);
                assert (codeResult.isFound) throw ErrorsV2.CollectionItemCodeNotConfigured;
                val itemCode = NFTEscrowV2CollectionItemCode.fromCell(codeResult.loadValue());
                assert (itemCode.kind == 3) throw ErrorsV2.InvalidCollectionItemCode;
                val codeHash = itemCode.code.hash();
                assert (
                    codeHash ==
                    0x8b711e6809672c0335dc61d1da1dcc4059c973248af707bd586245085ea70b32 ||
                    codeHash == 0x30dcd7d5b6fcf5968c2791e1e31ad732f2672f2986e1d6970eb03cca22d23251
                ) throw ErrorsV2.InvalidCollectionItemCode;
            }
            collectionStorage.collections.set(msg.collection, msg.newStatus);
            callbacks.collectionStorage = collectionStorage.toCell();
            storage.callbacks = callbacks.toCell();
            storage.save();
        }

        SetCollectionItemCodeV2 => {
            var storage = lazy NFTEscrowV2Storage.load();
            assert (in.senderAddress == storage.owner) throw ErrorsV2.NotOwner;
            assert (msg.kind == 3) throw ErrorsV2.InvalidProductKind;

            val codeHash = msg.code.hash();
            assert (
                codeHash == 0x8b711e6809672c0335dc61d1da1dcc4059c973248af707bd586245085ea70b32 ||
                codeHash == 0x30dcd7d5b6fcf5968c2791e1e31ad732f2672f2986e1d6970eb03cca22d23251
            ) throw ErrorsV2.InvalidCollectionItemCode;

            var callbacks = storage.callbacks.load();
            var collectionStorage = callbacks.collectionStorage.load();
            val collectionResult = collectionStorage.collections.get(msg.collection);
            assert (collectionResult.isFound) throw ErrorsV2.CollectionNotApproved;
            assert (collectionResult.loadValue() != 1) throw ErrorsV2.InvalidCollectionStatus;
            assert (!msg.code.beginParse().isEmpty()) throw ErrorsV2.InvalidCollectionItemCode;

            collectionStorage
                .collectionItemCodes
                .set(
                    msg.collection,
                    NFTEscrowV2CollectionItemCode {
                        kind: msg.kind,
                        code: msg.code,
                    }.toCell(),
                );
            callbacks.collectionStorage = collectionStorage.toCell();
            storage.callbacks = callbacks.toCell();
            storage.save();
        }

        CreateEscrowV2 => {
            var storage = lazy NFTEscrowV2Storage.load();
            assert (in.senderAddress == storage.marketplace) throw ErrorsV2.InvalidRelease;
            assert (msg.productId > 0 && msg.queryId > 0) throw ErrorsV2.InvalidRelease;
            val createExtra = msg.extra.load();

            // Exact retries are idempotent only while the original custody record
            // is still pending/deposited and every identity field matches.
            val existingQuery = storage.queryToEscrow.get(msg.queryId);
            if (existingQuery.isFound) {
                val existingEscrowId = existingQuery.loadValue();
                val existingRecordResult = storage.records.get(existingEscrowId);
                assert (existingRecordResult.isFound) throw ErrorsV2.InvalidRelease;
                val existingRecord = NFTEscrowV2Record.fromCell(existingRecordResult.loadValue());
                val existingExtra = existingRecord.extra.load();
                assert (
                    existingRecord.status == 0 || existingRecord.status == 1
                ) throw ErrorsV2.InvalidRelease;
                assert (existingRecord.productId == msg.productId) throw ErrorsV2.InvalidRelease;
                assert (existingRecord.nftItem == msg.nftItem) throw ErrorsV2.InvalidRelease;
                assert (existingRecord.seller == msg.seller) throw ErrorsV2.InvalidRelease;
                assert (existingRecord.queryId == msg.queryId) throw ErrorsV2.InvalidRelease;
                assert (existingExtra.collection == msg.collection) throw ErrorsV2.InvalidRelease;
                assert (
                    existingExtra.itemIndex == createExtra.itemIndex
                ) throw ErrorsV2.InvalidRelease;
                assert (existingExtra.kind == createExtra.kind) throw ErrorsV2.InvalidRelease;
                return;
            }

            assert (
                !storage.assetToEscrow.get(msg.nftItem).isFound
            ) throw ErrorsV2.AssetAlreadyEscrowed;

            assert (createExtra.kind == 3) throw ErrorsV2.InvalidProductKind;
            val callbacks = storage.callbacks.load();
            val collectionStorage = callbacks.collectionStorage.load();
            val collectionResult = collectionStorage.collections.get(msg.collection);
            assert (collectionResult.isFound) throw ErrorsV2.CollectionNotApproved;
            assert (collectionResult.loadValue() == 1) throw ErrorsV2.CollectionNotApproved;

            val codeResult = collectionStorage.collectionItemCodes.get(msg.collection);
            assert (codeResult.isFound) throw ErrorsV2.CollectionItemCodeNotConfigured;
            val itemCode = NFTEscrowV2CollectionItemCode.fromCell(codeResult.loadValue());
            assert (itemCode.kind == createExtra.kind) throw ErrorsV2.InvalidCollectionItemCode;

            val codeHash = itemCode.code.hash();
            assert (
                codeHash == 0x8b711e6809672c0335dc61d1da1dcc4059c973248af707bd586245085ea70b32 ||
                codeHash == 0x30dcd7d5b6fcf5968c2791e1e31ad732f2672f2986e1d6970eb03cca22d23251
            ) throw ErrorsV2.InvalidCollectionItemCode;

            // Fragment Gift Item StateInit: Config = itemIndex:uint256 + collection,
            // Data = ref(Config) + state:Maybe ^Cell (none), deployed on workchain 0.
            val itemConfig = beginCell()
                .storeUint(createExtra.itemIndex, 256)
                .storeAddress(msg.collection)
                .endCell();
            val itemData = beginCell().storeRef(itemConfig).storeUint(0, 1).endCell();
            val itemStateInit: ContractState = { code: itemCode.code, data: itemData };
            val expectedNftItem = AutoDeployAddress {
                workchain: 0,
                stateInit: itemStateInit,
            }.calculateAddress();
            assert (msg.nftItem == expectedNftItem) throw ErrorsV2.InvalidNftItem;

            val escrowId = storage.nextEscrowId;
            val record = NFTEscrowV2Record {
                escrowId,
                nftItem: msg.nftItem,
                seller: msg.seller,
                productId: msg.productId,
                status: 0,
                queryId: msg.queryId,
                extra: NFTEscrowV2RecordExtra {
                    collection: msg.collection,
                    itemIndex: createExtra.itemIndex,
                    kind: createExtra.kind,
                }.toCell(),
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

            // Require the exact seller-authorized listing payload. A valid NFT
            // Item must not activate a listing from an unrelated transfer that
            // happens to reuse a pending query ID.
            var payload = msg.forwardPayload;
            val payloadType = payload.loadUint(1);
            assert (payloadType == 1) throw ErrorsV2.InvalidRelease;
            val payloadCell = payload.loadRef();
            var payloadData = payloadCell.beginParse();
            val payloadMarker = payloadData.loadUint(32);
            assert (payloadMarker == 0x53564950) throw ErrorsV2.InvalidRelease;
            val payloadQueryId = payloadData.loadUint(64);
            assert (payloadQueryId == record.queryId) throw ErrorsV2.InvalidRelease;
            payloadData.assertEnd();
            payload.assertEnd();

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
            var releaseCallbacks = callbacks.releaseStorage.load();
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
            // Never "deliver" an NFT to the Escrow itself or to the NFT Item
            // contract. Either destination could leave the asset effectively
            // trapped while the release state machine records it as Released.
            assert (msg.buyer != contract.getAddress()) throw ErrorsV2.InvalidRelease;
            assert (msg.buyer != record.nftItem) throw ErrorsV2.InvalidRelease;
            assert (msg.buyer != record.seller) throw ErrorsV2.InvalidRelease;

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
                val pendingResult = releaseCallbacks.pendingReleases.get(msg.escrowId);
                assert (pendingResult.isFound) throw ErrorsV2.ReleaseAlreadyPending;
                val pending = EscrowReleaseCallbackV2.fromCell(pendingResult.loadValue());
                assert (
                    pending.toCell().hash() == callback.toCell().hash()
                ) throw ErrorsV2.ReleaseAlreadyPending;
                return;
            }

            assert (record.status == 1) throw ErrorsV2.InvalidRelease;
            assert (msg.buyer != record.seller) throw ErrorsV2.InvalidRelease;
            // Do not start another release while the previous failure callback
            // remains unacknowledged by MarketplaceV2.
            assert (
                !releaseCallbacks.releaseFailureCallbacks.get(msg.escrowId).isFound
            ) throw ErrorsV2.InvalidRelease;

            val existingQuery = storage.queryToEscrow.get(msg.queryId);
            assert (!existingQuery.isFound) throw ErrorsV2.InvalidRelease;

            record.status = 2;
            storage.records.set(msg.escrowId, record.toCell());
            releaseCallbacks.pendingReleases.set(msg.escrowId, callback.toCell());
            callbacks.releaseStorage = releaseCallbacks.toCell();
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

        RefundEscrowV2 => {
            var storage = lazy NFTEscrowV2Storage.load();
            var callbacks = storage.callbacks.load();
            var refundCallbacks = callbacks.refundStorage.load();
            assert (in.senderAddress == storage.marketplace) throw ErrorsV2.InvalidRefund;
            assert (
                msg.escrowId > 0 && msg.productId > 0 && msg.queryId > 0
            ) throw ErrorsV2.InvalidRefund;

            val recordResult = storage.records.get(msg.escrowId);
            assert (recordResult.isFound) throw ErrorsV2.InvalidRefund;
            var record = NFTEscrowV2Record.fromCell(recordResult.loadValue());
            assert (record.escrowId == msg.escrowId) throw ErrorsV2.InvalidRefund;
            assert (record.productId == msg.productId) throw ErrorsV2.InvalidRefund;
            assert (record.seller == msg.seller) throw ErrorsV2.InvalidRefund;

            val callback = EscrowRefundCallbackV2 {
                escrowId: msg.escrowId,
                productId: msg.productId,
                queryId: msg.queryId,
                nftItem: record.nftItem,
                seller: record.seller,
            };

            if (record.status == 4) {
                val pendingResult = refundCallbacks.pendingRefunds.get(msg.escrowId);
                assert (pendingResult.isFound) throw ErrorsV2.InvalidRefund;
                val pending = EscrowRefundCallbackV2.fromCell(pendingResult.loadValue());
                assert (
                    pending.toCell().hash() == callback.toCell().hash()
                ) throw ErrorsV2.InvalidRefund;
                return;
            }

            assert (record.status == 1) throw ErrorsV2.InvalidRefund;
            val existingQuery = storage.queryToEscrow.get(msg.queryId);
            assert (!existingQuery.isFound) throw ErrorsV2.InvalidRefund;

            record.status = 4;
            storage.records.set(msg.escrowId, record.toCell());
            refundCallbacks.pendingRefunds.set(msg.escrowId, callback.toCell());
            callbacks.refundStorage = refundCallbacks.toCell();
            storage.callbacks = callbacks.toCell();
            storage.queryToEscrow.set(msg.queryId, msg.escrowId);
            storage.save();

            val transfer = NftTransfer {
                queryId: msg.queryId,
                newOwner: record.seller,
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
            var releaseCallbacks = callbacks.releaseStorage.load();
            var refundCallbacks = callbacks.refundStorage.load();
            val indexResult = storage.queryToEscrow.get(msg.queryId);
            assert (indexResult.isFound) throw ErrorsV2.InvalidReleaseConfirmation;
            val escrowId = indexResult.loadValue();

            val recordResult = storage.records.get(escrowId);
            assert (recordResult.isFound) throw ErrorsV2.InvalidReleaseConfirmation;
            var record = NFTEscrowV2Record.fromCell(recordResult.loadValue());
            assert (in.senderAddress == record.nftItem) throw ErrorsV2.InvalidReleaseConfirmation;
            if (record.status == 2) {
                val pendingResult = releaseCallbacks.pendingReleases.get(escrowId);
                assert (pendingResult.isFound) throw ErrorsV2.InvalidReleaseConfirmation;
                val pending = EscrowReleaseCallbackV2.fromCell(pendingResult.loadValue());
                assert (pending.queryId == msg.queryId) throw ErrorsV2.InvalidReleaseConfirmation;
                assert (
                    pending.productId == record.productId
                ) throw ErrorsV2.InvalidReleaseConfirmation;
                assert (pending.escrowId == escrowId) throw ErrorsV2.InvalidReleaseConfirmation;
                assert (
                    pending.nftItem == record.nftItem
                ) throw ErrorsV2.InvalidReleaseConfirmation;

                record.status = 3;
                storage.records.set(escrowId, record.toCell());
                val assetIndexResult = storage.assetToEscrow.get(record.nftItem);
                if (assetIndexResult.isFound && assetIndexResult.loadValue() == escrowId) {
                    storage.assetToEscrow.delete(record.nftItem);
                }
                releaseCallbacks.pendingReleases.delete(escrowId);
                releaseCallbacks.releaseCallbacks.set(escrowId, pending.toCell());
                callbacks.releaseStorage = releaseCallbacks.toCell();
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
            } else if (record.status == 4) {
                val pendingResult = refundCallbacks.pendingRefunds.get(escrowId);
                assert (pendingResult.isFound) throw ErrorsV2.InvalidRefund;
                val pending = EscrowRefundCallbackV2.fromCell(pendingResult.loadValue());
                assert (pending.queryId == msg.queryId) throw ErrorsV2.InvalidRefund;
                assert (pending.productId == record.productId) throw ErrorsV2.InvalidRefund;
                assert (pending.escrowId == escrowId) throw ErrorsV2.InvalidRefund;
                assert (pending.nftItem == record.nftItem) throw ErrorsV2.InvalidRefund;
                assert (pending.seller == record.seller) throw ErrorsV2.InvalidRefund;

                record.status = 5;
                storage.records.set(escrowId, record.toCell());
                val assetIndexResult = storage.assetToEscrow.get(record.nftItem);
                if (assetIndexResult.isFound && assetIndexResult.loadValue() == escrowId) {
                    storage.assetToEscrow.delete(record.nftItem);
                }
                refundCallbacks.pendingRefunds.delete(escrowId);
                refundCallbacks.refundCallbacks.set(escrowId, pending.toCell());
                callbacks.refundStorage = refundCallbacks.toCell();
                storage.callbacks = callbacks.toCell();
                storage.save();

                val callbackMessage = createMessage({
                    bounce: BounceMode.Only256BitsOfBody,
                    value: grams("0.03"),
                    dest: storage.marketplace,
                    body: EscrowRefundedV2 {
                        escrowId: pending.escrowId,
                        productId: pending.productId,
                        queryId: pending.queryId,
                        nftItem: pending.nftItem,
                        seller: pending.seller,
                    },
                });
                callbackMessage.send(SEND_MODE_REGULAR);
            } else {
                throw ErrorsV2.InvalidReleaseConfirmation;
            }
        }

        EscrowReleaseAckV2 => {
            var storage = lazy NFTEscrowV2Storage.load();
            var callbacks = storage.callbacks.load();
            var releaseCallbacks = callbacks.releaseStorage.load();
            assert (
                in.senderAddress == storage.marketplace
            ) throw ErrorsV2.InvalidReleaseConfirmation;
            val callbackResult = releaseCallbacks.releaseCallbacks.get(msg.escrowId);
            assert (callbackResult.isFound) throw ErrorsV2.InvalidReleaseConfirmation;
            val callback = EscrowReleaseCallbackV2.fromCell(callbackResult.loadValue());
            assert (callback.orderId == msg.orderId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (callback.productId == msg.productId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (callback.escrowId == msg.escrowId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (callback.queryId == msg.queryId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (callback.nftItem == msg.nftItem) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (callback.buyer == msg.buyer) throw ErrorsV2.InvalidReleaseConfirmation;
            releaseCallbacks.releaseCallbacks.delete(msg.escrowId);
            callbacks.releaseStorage = releaseCallbacks.toCell();
            storage.callbacks = callbacks.toCell();
            storage.save();
        }

        EscrowRefundAckV2 => {
            var storage = lazy NFTEscrowV2Storage.load();
            var callbacks = storage.callbacks.load();
            var refundCallbacks = callbacks.refundStorage.load();
            assert (in.senderAddress == storage.marketplace) throw ErrorsV2.InvalidRefund;
            val callbackResult = refundCallbacks.refundCallbacks.get(msg.escrowId);
            assert (callbackResult.isFound) throw ErrorsV2.InvalidRefund;
            val callback = EscrowRefundCallbackV2.fromCell(callbackResult.loadValue());
            assert (callback.escrowId == msg.escrowId) throw ErrorsV2.InvalidRefund;
            assert (callback.productId == msg.productId) throw ErrorsV2.InvalidRefund;
            assert (callback.queryId == msg.queryId) throw ErrorsV2.InvalidRefund;
            assert (callback.nftItem == msg.nftItem) throw ErrorsV2.InvalidRefund;
            assert (callback.seller == msg.seller) throw ErrorsV2.InvalidRefund;
            refundCallbacks.refundCallbacks.delete(msg.escrowId);
            callbacks.refundStorage = refundCallbacks.toCell();
            storage.callbacks = callbacks.toCell();
            storage.save();
        }

        RetryRefundCallbackV2 => {
            val storage = lazy NFTEscrowV2Storage.load();
            val callbacks = storage.callbacks.load();
            val refundCallbacks = callbacks.refundStorage.load();
            assert (in.senderAddress == storage.owner) throw ErrorsV2.NotOwner;
            val callbackResult = refundCallbacks.refundCallbacks.get(msg.escrowId);
            assert (callbackResult.isFound) throw ErrorsV2.InvalidRefund;
            val callback = EscrowRefundCallbackV2.fromCell(callbackResult.loadValue());
            val retryMessage = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: grams("0.03"),
                dest: storage.marketplace,
                body: EscrowRefundedV2 {
                    escrowId: callback.escrowId,
                    productId: callback.productId,
                    queryId: callback.queryId,
                    nftItem: callback.nftItem,
                    seller: callback.seller,
                },
            });
            retryMessage.send(SEND_MODE_REGULAR);
        }

        RetryReleaseCallbackV2 => {
            val storage = lazy NFTEscrowV2Storage.load();
            val callbacks = storage.callbacks.load();
            val releaseCallbacks = callbacks.releaseStorage.load();
            assert (in.senderAddress == storage.owner) throw ErrorsV2.NotOwner;
            val callbackResult = releaseCallbacks.releaseCallbacks.get(msg.escrowId);
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

        EscrowReleaseFailureAckV2 => {
            var storage = lazy NFTEscrowV2Storage.load();
            var callbacks = storage.callbacks.load();
            var releaseCallbacks = callbacks.releaseStorage.load();
            assert (in.senderAddress == storage.marketplace) throw ErrorsV2.InvalidReleaseConfirmation;
            val callbackResult = releaseCallbacks.releaseFailureCallbacks.get(msg.escrowId);
            assert (callbackResult.isFound) throw ErrorsV2.InvalidReleaseConfirmation;
            val callback = EscrowReleaseFailureCallbackV2.fromCell(callbackResult.loadValue());
            assert (callback.orderId == msg.orderId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (callback.productId == msg.productId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (callback.escrowId == msg.escrowId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (callback.queryId == msg.queryId) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (callback.nftItem == msg.nftItem) throw ErrorsV2.InvalidReleaseConfirmation;
            assert (callback.buyer == msg.buyer) throw ErrorsV2.InvalidReleaseConfirmation;
            releaseCallbacks.releaseFailureCallbacks.delete(msg.escrowId);
            callbacks.releaseStorage = releaseCallbacks.toCell();
            storage.callbacks = callbacks.toCell();
            storage.save();
        }

        RetryReleaseFailureCallbackV2 => {
            val storage = lazy NFTEscrowV2Storage.load();
            val callbacks = storage.callbacks.load();
            val releaseCallbacks = callbacks.releaseStorage.load();
            assert (in.senderAddress == storage.owner) throw ErrorsV2.NotOwner;
            val callbackResult = releaseCallbacks.releaseFailureCallbacks.get(msg.escrowId);
            assert (callbackResult.isFound) throw ErrorsV2.InvalidReleaseConfirmation;
            val callback = EscrowReleaseFailureCallbackV2.fromCell(callbackResult.loadValue());
            val retryMessage = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: grams("0.03"),
                dest: storage.marketplace,
                body: EscrowReleaseFailedV2 {
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
        // A malformed RichBounce envelope or truncated TEP-62 body must never
        // make the bounce transaction fail or mutate custody state.
        try {
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
            var releaseCallbacks = callbacks.releaseStorage.load();
            var refundCallbacks = callbacks.refundStorage.load();
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
            if (record.status == 2) {
                val pendingResult = releaseCallbacks.pendingReleases.get(escrowId);
                if (!pendingResult.isFound) {
                    return;
                }
                val pending = EscrowReleaseCallbackV2.fromCell(pendingResult.loadValue());
                if (
                    in.senderAddress == record.nftItem && pending.queryId == transfer.queryId &&
                    pending.buyer == transfer.newOwner &&
                    pending.nftItem == record.nftItem &&
                    pending.escrowId == escrowId &&
                    pending.productId == record.productId
                ) {
                    record.status = 1;
                    storage.records.set(escrowId, record.toCell());
                    releaseCallbacks.pendingReleases.delete(escrowId);
                    callbacks.releaseStorage = releaseCallbacks.toCell();
                    storage.queryToEscrow.delete(transfer.queryId);
                    val failureCallback = EscrowReleaseFailureCallbackV2 {
                        orderId: pending.orderId,
                        productId: pending.productId,
                        escrowId: pending.escrowId,
                        queryId: pending.queryId,
                        nftItem: pending.nftItem,
                        buyer: pending.buyer,
                    };
                    releaseCallbacks.releaseFailureCallbacks.set(
                        escrowId,
                        failureCallback.toCell(),
                    );
                    callbacks.releaseStorage = releaseCallbacks.toCell();
                    storage.callbacks = callbacks.toCell();
                    storage.save();

                    val failureMessage = createMessage({
                        bounce: BounceMode.Only256BitsOfBody,
                        value: grams("0.03"),
                        dest: storage.marketplace,
                        body: EscrowReleaseFailedV2 {
                            orderId: pending.orderId,
                            productId: pending.productId,
                            escrowId: pending.escrowId,
                            queryId: pending.queryId,
                            nftItem: pending.nftItem,
                            buyer: pending.buyer,
                        },
                    });
                    failureMessage.send(SEND_MODE_REGULAR);
                }
            } else if (record.status == 4) {
                val pendingResult = refundCallbacks.pendingRefunds.get(escrowId);
                if (!pendingResult.isFound) {
                    return;
                }
                val pending = EscrowRefundCallbackV2.fromCell(pendingResult.loadValue());
                if (
                    in.senderAddress == record.nftItem && pending.queryId == transfer.queryId &&
                    pending.seller == transfer.newOwner &&
                    pending.nftItem == record.nftItem &&
                    pending.escrowId == escrowId &&
                    pending.productId == record.productId &&
                    pending.seller == record.seller
                ) {
                    record.status = 1;
                    storage.records.set(escrowId, record.toCell());
                    refundCallbacks.pendingRefunds.delete(escrowId);
                    callbacks.refundStorage = refundCallbacks.toCell();
                    storage.queryToEscrow.delete(transfer.queryId);
                    storage.callbacks = callbacks.toCell();
                    storage.save();
                }
            }
        } catch {
            // Ignore malformed bounce data; only a fully correlated bounce can restore Deposited.
        }
    } else if (bouncePrefix == 0xffffffff) {
        var bodySlice = in.bouncedBody;
        bodySlice.skipBouncedPrefix();
        if (bodySlice.remainingBitsCount() < 32) {
            return;
        }
        val opcode = bodySlice.loadUint(32);
        if (
            opcode == 0x71b00003 || opcode == 0x71b00004 ||
            opcode == 0x71b0000F || opcode == 0x71b00013
        ) {
            val storage = lazy NFTEscrowV2Storage.load();
            if (in.senderAddress != storage.marketplace) {
                return;
            }
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
    val releaseCallbacks = callbacks.releaseStorage.load();
    val result = releaseCallbacks.releaseCallbacks.get(escrowId);
    if (!result.isFound) {
        return null;
    }
    return EscrowReleaseCallbackV2.fromCell(result.loadValue());
}

get fun releaseFailureCallbackV2(
    escrowId: uint64,
): EscrowReleaseFailureCallbackV2? {
    val callbacks = NFTEscrowV2Storage.load().callbacks.load();
    val releaseCallbacks = callbacks.releaseStorage.load();
    val result = releaseCallbacks.releaseFailureCallbacks.get(escrowId);
    if (!result.isFound) {
        return null;
    }
    return EscrowReleaseFailureCallbackV2.fromCell(result.loadValue());
}

get fun refundCallbackV2(escrowId: uint64): EscrowRefundCallbackV2? {
    val callbacks = NFTEscrowV2Storage.load().callbacks.load();
    val refundCallbacks = callbacks.refundStorage.load();
    val result = refundCallbacks.refundCallbacks.get(escrowId);
    if (!result.isFound) {
        return null;
    }
    return EscrowRefundCallbackV2.fromCell(result.loadValue());
}
