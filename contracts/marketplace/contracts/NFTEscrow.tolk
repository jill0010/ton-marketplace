import "types"

contract NFTEscrow {
    author: "Acton User"
    version: "1.0.0"
    description: "TON NFT Escrow Contract"
    storage: EscrowStorage
    incomingMessages: AllowedMessage
}

type AllowedMessage =
    | ChangeOwner
    | SetEscrowPaused
    | CreateEscrow
    | SetCollectionStatus
    | SetCollectionItemCode
    | NftOwnershipAssigned
    | RequestRefund
    | NftExcesses
    | EscrowRefundAck
    | RetryRefundCallback
    | EscrowDepositAck
    | RetryDepositCallback

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessage.fromSlice(in.body);

    match (msg) {
        ChangeOwner => {
            var storage = lazy EscrowStorage.load();
            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;
            storage.owner = msg.newOwner;
            storage.save();
        }

        SetEscrowPaused => {
            var storage = lazy EscrowStorage.load();
            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;
            storage.paused = msg.paused;
            storage.save();
        }

        SetCollectionStatus => {
            var storage = lazy EscrowStorage.load();
            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;

            assert (
                msg.newStatus == 1 || msg.newStatus == 2 || msg.newStatus == 3
            ) throw Errors.InvalidCollectionStatus;

            var collectionStorage = storage.collectionStorage.load();

            // 只有配置了官方 NFT Item Code 的 Collection 才能激活
            if (msg.newStatus == 1) {
                val codeResult = collectionStorage.collectionItemCodes.get(msg.collection);
                assert (codeResult.isFound) throw Errors.CollectionItemCodeNotConfigured;

                val itemCode = codeResult.loadValue().load();
                assert (itemCode.kind == 3) throw Errors.InvalidCollectionItemCode;

                val codeHash = itemCode.code.hash();
                assert (
                    codeHash ==
                    0x8b711e6809672c0335dc61d1da1dcc4059c973248af707bd586245085ea70b32 ||
                    codeHash == 0x30dcd7d5b6fcf5968c2791e1e31ad732f2672f2986e1d6970eb03cca22d23251
                ) throw Errors.InvalidCollectionItemCode;
            }

            collectionStorage.collections.set(msg.collection, msg.newStatus);
            storage.collectionStorage = collectionStorage.toCell();
            storage.save();
        }

        SetCollectionItemCode => {
            var storage = lazy EscrowStorage.load();

            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;
            assert (msg.kind == 3) throw Errors.InvalidProductKind;

            val codeHash = msg.code.hash();
            assert (
                codeHash == 0x8b711e6809672c0335dc61d1da1dcc4059c973248af707bd586245085ea70b32 ||
                codeHash == 0x30dcd7d5b6fcf5968c2791e1e31ad732f2672f2986e1d6970eb03cca22d23251
            ) throw Errors.InvalidCollectionItemCode;

            var collectionStorage = storage.collectionStorage.load();
            val collectionResult = collectionStorage.collections.get(msg.collection);
            assert (collectionResult.isFound) throw Errors.CollectionNotApproved;

            val collectionStatus = collectionResult.loadValue();
            assert (collectionStatus != 1) throw Errors.InvalidCollectionStatus;

            val codeSlice = msg.code.beginParse();
            assert (!codeSlice.isEmpty()) throw Errors.InvalidCollectionItemCode;

            val itemCode = CollectionItemCode {
                kind: msg.kind,
                code: msg.code,
            };

            collectionStorage.collectionItemCodes.set(msg.collection, itemCode.toCell());
            storage.collectionStorage = collectionStorage.toCell();
            storage.save();
        }

        CreateEscrow => {
            var storage = lazy EscrowStorage.load();

            assert (in.senderAddress == storage.marketplace) throw Errors.NotOwner;

            val createExtra = msg.extra.load();
            val queryId = createExtra.queryId;

            assert (queryId > 0) throw Errors.InvalidQueryId;

            val existingQuery = storage.queryToEscrow.get(queryId);

            if (existingQuery.isFound) {
                // 重试请求：只接受与原托管记录完全一致的身份信息。
                val existingEscrowId = existingQuery.loadValue();
                val existingRecordResult = storage.records.get(existingEscrowId);
                assert (existingRecordResult.isFound) throw Errors.EscrowAlreadyExists;

                val existingRecord = EscrowRecord.fromCell(
                    existingRecordResult.loadValue(),
                );
                val existingExtra = existingRecord.extra.load();

                assert (
                    existingRecord.status == 1 || existingRecord.status == 2
                ) throw Errors.EscrowAlreadyExists;

                assert (existingRecord.nftItem == msg.nftItem) throw Errors.EscrowAlreadyExists;
                assert (
                    existingRecord.collection == msg.collection
                ) throw Errors.EscrowAlreadyExists;
                assert (existingRecord.seller == msg.seller) throw Errors.EscrowAlreadyExists;
                assert (existingRecord.productId == msg.productId) throw Errors.EscrowAlreadyExists;
                assert (existingExtra.queryId == queryId) throw Errors.EscrowAlreadyExists;
                assert (
                    existingExtra.itemIndex == createExtra.itemIndex
                ) throw Errors.EscrowAlreadyExists;
                assert (existingExtra.kind == msg.kind) throw Errors.EscrowAlreadyExists;
            } else {
                assert (!storage.paused) throw Errors.EscrowPaused;

                val collectionStorage = storage.collectionStorage.load();
                val collectionResult = collectionStorage.collections.get(msg.collection);
                assert (collectionResult.isFound) throw Errors.CollectionNotApproved;

                val collectionStatus = collectionResult.loadValue();
                assert (collectionStatus == 1) throw Errors.CollectionNotApproved;

                // 第一版仅接受已核实 Code 的 Fragment Gift NFT。
                assert (msg.kind == 3) throw Errors.InvalidProductKind;

                val codeResult = collectionStorage.collectionItemCodes.get(msg.collection);
                assert (codeResult.isFound) throw Errors.CollectionItemCodeNotConfigured;

                val itemCode = codeResult.loadValue().load();
                assert (itemCode.kind == msg.kind) throw Errors.InvalidCollectionItemCode;

                val codeHash = itemCode.code.hash();
                assert (
                    codeHash ==
                    0x8b711e6809672c0335dc61d1da1dcc4059c973248af707bd586245085ea70b32 ||
                    codeHash == 0x30dcd7d5b6fcf5968c2791e1e31ad732f2672f2986e1d6970eb03cca22d23251
                ) throw Errors.InvalidCollectionItemCode;

                // Fragment Gift NFT Item 初始数据：
                // Config = itemIndex:uint256 + collection:MsgAddressInt
                // Data = ref(Config) + state:Maybe ^Cell（此处为 none）
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

                assert (msg.nftItem == expectedNftItem) throw Errors.InvalidNftItem;

                val escrowId = storage.nextEscrowId;

                val recordExtra = EscrowRecordExtra {
                    queryId: queryId,
                    createdAt: createExtra.createdAt,
                    itemIndex: createExtra.itemIndex,
                    kind: msg.kind,
                };

                val record = EscrowRecord {
                    escrowId: escrowId,
                    nftItem: msg.nftItem,
                    collection: msg.collection,
                    seller: msg.seller,
                    productId: msg.productId,
                    status: 1,
                    extra: recordExtra.toCell(),
                };

                storage.records.set(escrowId, record.toCell());
                storage.queryToEscrow.set(queryId, escrowId);
                storage.nextEscrowId = escrowId + 1;
                storage.save();
            }
        }

        NftOwnershipAssigned => {
            var storage = lazy EscrowStorage.load();
            var callbackStorage = storage.callbackStorage.load();

            val indexResult = storage.queryToEscrow.get(msg.queryId);
            assert (indexResult.isFound) throw Errors.InvalidQueryId;

            val escrowId = indexResult.loadValue();
            val recordResult = storage.records.get(escrowId);
            assert (recordResult.isFound) throw Errors.InvalidEscrow;

            val recordCell = recordResult.loadValue();
            var record = EscrowRecord.fromCell(recordCell);
            val recordExtra = record.extra.load();

            assert (in.senderAddress == record.nftItem) throw Errors.InvalidNftItem;
            assert (msg.queryId == recordExtra.queryId) throw Errors.InvalidQueryId;
            assert (msg.prevOwner == record.seller) throw Errors.InvalidSeller;
            assert (record.status == 1) throw Errors.EscrowNotPending;

            var payload = msg.forwardPayload;
            val payloadType = payload.loadUint(1);
            assert (payloadType == 1) throw Errors.InvalidNftNotification;

            val payloadCell = payload.loadRef();
            var payloadData = payloadCell.beginParse();

            val payloadMarker = payloadData.loadUint(32);
            assert (payloadMarker == 0x53564950) throw Errors.InvalidNftNotification;

            val payloadQueryId = payloadData.loadUint(64);
            assert (payloadQueryId == recordExtra.queryId) throw Errors.InvalidQueryId;

            payloadData.assertEnd();
            payload.assertEnd();

            record.status = 2;
            storage.records.set(escrowId, record.toCell());

            val callbackRecord = EscrowDepositCallback {
                queryId: recordExtra.queryId,
                productId: record.productId,
                nftItem: record.nftItem,
                seller: record.seller,
            };

            callbackStorage.depositCallbacks.set(escrowId, callbackRecord.toCell());
            storage.callbackStorage = callbackStorage.toCell();
            storage.save();

            val callback = EscrowDeposited {
                queryId: recordExtra.queryId,
                productId: record.productId,
                nftItem: record.nftItem,
                seller: record.seller,
            };

            val callbackMessage = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: grams("0.03"),
                dest: storage.marketplace,
                body: callback,
            });

            callbackMessage.send(SEND_MODE_REGULAR);
        }

        RequestRefund => {
            var storage = lazy EscrowStorage.load();

            val recordResult = storage.records.get(msg.escrowId);
            assert (recordResult.isFound) throw Errors.InvalidEscrow;

            val recordCell = recordResult.loadValue();
            var record = EscrowRecord.fromCell(recordCell);
            val recordExtra = record.extra.load();

            assert (
                in.senderAddress == record.seller || in.senderAddress == storage.owner
            ) throw Errors.RefundNotAuthorized;

            assert (record.status != 6) throw Errors.RefundAlreadyPending;
            assert (record.status == 2) throw Errors.RefundNotAllowed;

            record.status = 6;
            storage.records.set(msg.escrowId, record.toCell());
            storage.save();

            val transfer = NftTransfer {
                queryId: recordExtra.queryId,
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

        EscrowRefundAck => {
            var storage = lazy EscrowStorage.load();
            var callbackStorage = storage.callbackStorage.load();

            // 只有配置的 Marketplace 可以确认退款回调。
            assert (in.senderAddress == storage.marketplace) throw Errors.InvalidRefundConfirmation;

            // 通过原始 queryId 找到对应的 Escrow。
            val indexResult = storage.queryToEscrow.get(msg.queryId);
            assert (indexResult.isFound) throw Errors.InvalidRefundConfirmation;

            val escrowId = indexResult.loadValue();
            val callbackResult = callbackStorage.refundCallbacks.get(escrowId);
            assert (callbackResult.isFound) throw Errors.InvalidRefundConfirmation;

            val callbackCell = callbackResult.loadValue();
            val callback = EscrowRefundCallback.fromCell(callbackCell);

            // ACK 中的所有身份信息必须与持久化记录完全一致。
            assert (callback.queryId == msg.queryId) throw Errors.InvalidRefundConfirmation;
            assert (callback.productId == msg.productId) throw Errors.InvalidRefundConfirmation;
            assert (callback.nftItem == msg.nftItem) throw Errors.InvalidRefundConfirmation;
            assert (callback.seller == msg.seller) throw Errors.InvalidRefundConfirmation;

            // 仅在验证全部通过后删除待确认记录。
            callbackStorage.refundCallbacks.delete(escrowId);
            storage.callbackStorage = callbackStorage.toCell();
            storage.save();
        }

        EscrowDepositAck => {
            var storage = lazy EscrowStorage.load();
            var callbackStorage = storage.callbackStorage.load();

            assert (
                in.senderAddress == storage.marketplace
            ) throw Errors.InvalidDepositConfirmation;

            val indexResult = storage.queryToEscrow.get(msg.queryId);
            assert (indexResult.isFound) throw Errors.InvalidDepositConfirmation;

            val escrowId = indexResult.loadValue();
            val callbackResult = callbackStorage.depositCallbacks.get(escrowId);
            assert (callbackResult.isFound) throw Errors.InvalidDepositConfirmation;

            val callback = EscrowDepositCallback.fromCell(
                callbackResult.loadValue(),
            );

            assert (callback.queryId == msg.queryId) throw Errors.InvalidDepositConfirmation;
            assert (callback.productId == msg.productId) throw Errors.InvalidDepositConfirmation;
            assert (callback.nftItem == msg.nftItem) throw Errors.InvalidDepositConfirmation;
            assert (callback.seller == msg.seller) throw Errors.InvalidDepositConfirmation;

            callbackStorage.depositCallbacks.delete(escrowId);
            storage.callbackStorage = callbackStorage.toCell();
            storage.save();
        }

        RetryDepositCallback => {
            var storage = lazy EscrowStorage.load();
            var callbackStorage = storage.callbackStorage.load();

            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;

            val callbackResult = callbackStorage.depositCallbacks.get(msg.escrowId);
            assert (callbackResult.isFound) throw Errors.InvalidDepositConfirmation;

            val callback = EscrowDepositCallback.fromCell(
                callbackResult.loadValue(),
            );

            val retryMessage = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: grams("0.03"),
                dest: storage.marketplace,
                body: EscrowDeposited {
                    queryId: callback.queryId,
                    productId: callback.productId,
                    nftItem: callback.nftItem,
                    seller: callback.seller,
                },
            });

            retryMessage.send(SEND_MODE_REGULAR);
        }

        RetryRefundCallback => {
            var storage = lazy EscrowStorage.load();
            var callbackStorage = storage.callbackStorage.load();

            // 只有 Escrow 管理员可以重试退款通知。
            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;

            // 只能重发仍然存在的待确认记录。
            val callbackResult = callbackStorage.refundCallbacks.get(msg.escrowId);
            assert (callbackResult.isFound) throw Errors.InvalidRefundConfirmation;

            val callbackCell = callbackResult.loadValue();
            val callback = EscrowRefundCallback.fromCell(callbackCell);

            val retryMessage = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: grams("0.03"),
                dest: storage.marketplace,
                body: EscrowRefunded {
                    queryId: callback.queryId,
                    productId: callback.productId,
                    nftItem: callback.nftItem,
                    seller: callback.seller,
                },
            });

            retryMessage.send(SEND_MODE_REGULAR);
        }

        NftExcesses => {
            var storage = lazy EscrowStorage.load();
            var callbackStorage = storage.callbackStorage.load();

            val indexResult = storage.queryToEscrow.get(msg.queryId);
            assert (indexResult.isFound) throw Errors.InvalidRefundConfirmation;

            val escrowId = indexResult.loadValue();
            val recordResult = storage.records.get(escrowId);
            assert (recordResult.isFound) throw Errors.InvalidRefundConfirmation;

            val recordCell = recordResult.loadValue();
            var record = EscrowRecord.fromCell(recordCell);
            val recordExtra = record.extra.load();

            assert (in.senderAddress == record.nftItem) throw Errors.InvalidRefundConfirmation;
            assert (msg.queryId == recordExtra.queryId) throw Errors.InvalidRefundConfirmation;
            assert (record.status == 6) throw Errors.InvalidRefundConfirmation;

            record.status = 4;
            storage.records.set(escrowId, record.toCell());

            val callbackRecord = EscrowRefundCallback {
                queryId: recordExtra.queryId,
                productId: record.productId,
                nftItem: record.nftItem,
                seller: record.seller,
            };

            callbackStorage.refundCallbacks.set(escrowId, callbackRecord.toCell());
            storage.callbackStorage = callbackStorage.toCell();
            storage.save();

            val callback = EscrowRefunded {
                queryId: recordExtra.queryId,
                productId: record.productId,
                nftItem: record.nftItem,
                seller: record.seller,
            };

            val callbackMessage = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                value: grams("0.03"),
                dest: storage.marketplace,
                body: callback,
            });

            callbackMessage.send(SEND_MODE_REGULAR);
        }

        else => {
            assert (in.body.isEmpty()) throw Errors.InvalidMessage;
        }
    }
}

fun onBouncedMessage(in: InMessageBounced) {
    if (in.bouncedBody.remainingBitsCount() < 32) {
        return;
    }

    val bouncePrefix = in.bouncedBody.preloadUint(32);

    if (bouncePrefix == 0xfffffffe) {
        // RichBounce：只处理 NFT 转账失败。
        val rich = lazy RichBounceBody.fromSlice(in.bouncedBody);
        val originalBody = rich.originalBody;

        if (originalBody.beginParse().remainingBitsCount() < 32) {
            return;
        }

        var bodySlice = originalBody.beginParse();
        val opcode = bodySlice.loadUint(32);

        if (opcode == 0x5fcc3d14) {
            val transfer = lazy NftTransfer.fromSlice(originalBody.beginParse());

            if (
                transfer.responseDestination != null &&
                transfer.responseDestination!! == contract.getAddress()
            ) {
                var storage = lazy EscrowStorage.load();

                val indexResult = storage.queryToEscrow.get(transfer.queryId);

                if (indexResult.isFound) {
                    val escrowId = indexResult.loadValue();
                    val recordResult = storage.records.get(escrowId);

                    if (recordResult.isFound) {
                        val recordCell = recordResult.loadValue();
                        var record = EscrowRecord.fromCell(recordCell);
                        val recordExtra = record.extra.load();

                        if (
                            in.senderAddress == record.nftItem &&
                            transfer.queryId == recordExtra.queryId &&
                            transfer.newOwner == record.seller &&
                            record.status == 6
                        ) {
                            record.status = 2;
                            storage.records.set(escrowId, record.toCell());
                            storage.save();
                        }
                    }
                }
            }
        }
    } else if (bouncePrefix == 0xffffffff) {
        // Only256BitsOfBody：只读取完整保留的原消息 opcode。
        var bodySlice = in.bouncedBody;
        bodySlice.skipBouncedPrefix();
        if (bodySlice.remainingBitsCount() < 32) {
            return;
        }
        val opcode = bodySlice.loadUint(32);

        if (opcode == 0x71a00003 || opcode == 0x71a00007) {
            // Marketplace 回调退回：保留待确认记录，供管理员重试。
            val storage = lazy EscrowStorage.load();
            assert (in.senderAddress == storage.marketplace) throw Errors.InvalidMessage;
        }
    }
}

// 查询管理员
get fun owner(): address {
    val storage = lazy EscrowStorage.load();
    return storage.owner;
}

// 查询 Marketplace 地址
get fun marketplace(): address {
    val storage = lazy EscrowStorage.load();
    return storage.marketplace;
}

// 查询指定 Collection 白名单状态
get fun collectionStatus(collection: address): uint8 {
    val storage = lazy EscrowStorage.load();

    val collectionStorage = storage.collectionStorage.load();
    val result = collectionStorage.collections.get(collection);

    if (!result.isFound) {
        return 0;
    }

    return result.loadValue();
}

// 按托管编号查询托管记录
get fun escrowRecord(escrowId: uint64): EscrowRecord? {
    val storage = lazy EscrowStorage.load();

    val result = storage.records.get(escrowId);

    if (!result.isFound) {
        return null;
    }

    val recordCell = result.loadValue();
    return EscrowRecord.fromCell(recordCell);
}

// 根据 Query ID 查询托管编号
get fun escrowIdByQueryId(queryId: uint64): uint64? {
    val storage = lazy EscrowStorage.load();

    val result = storage.queryToEscrow.get(queryId);

    if (!result.isFound) {
        return null;
    }

    return result.loadValue();
}

// 查询 NFT Escrow 全局暂停状态
get fun paused(): bool {
    val storage = lazy EscrowStorage.load();
    return storage.paused;
}
