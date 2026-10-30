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
    | CreateEscrow
    | SetCollectionStatus
    | OwnershipAssigned

// TEP-62 NFT ownership_assigned 标准通知
// opcode = 0x05138d91
struct (0x05138d91) OwnershipAssigned {
    queryId: uint64
    prevOwner: address
    forwardPayload: RemainingBitsAndRefs
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessage.fromSlice(in.body);

    match (msg) {
        ChangeOwner => {
            var storage = lazy EscrowStorage.load();

            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;

            storage.owner = msg.newOwner;
            storage.save();
        }

        SetCollectionStatus => {
            var storage = lazy EscrowStorage.load();

            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;

            assert (
                msg.newStatus == 1 || msg.newStatus == 2 || msg.newStatus == 3
            ) throw Errors.InvalidCollectionStatus;

            storage
                .collections
                .set(
                    msg.collection,
                    msg.newStatus,
                );

            storage.save();
        }

        CreateEscrow => {
            var storage = lazy EscrowStorage.load();

            assert (!storage.paused) throw Errors.EscrowPaused;

            assert (in.senderAddress == storage.marketplace) throw Errors.NotOwner;

            // 读取消息扩展数据
            val createExtra = msg.extra.load();
            val queryId = createExtra.queryId;

            assert (queryId > 0) throw Errors.InvalidQueryId;

            // 防止重复 queryId
            val existingQuery = storage
                .queryToEscrow
                .get(
                    queryId,
                );

            assert (!existingQuery.isFound) throw Errors.EscrowAlreadyExists;

            // 检查 Collection 白名单
            val collectionResult = storage
                .collections
                .get(
                    msg.collection,
                );

            assert (collectionResult.isFound) throw Errors.CollectionNotApproved;

            val collectionStatus = collectionResult.loadValue();

            assert (collectionStatus == 1) throw Errors.CollectionNotApproved;

            val escrowId = storage.nextEscrowId;

            val recordExtra = EscrowRecordExtra {
                queryId: queryId,
                createdAt: createExtra.createdAt,
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

            storage
                .records
                .set(
                    escrowId,
                    record.toCell(),
                );

            storage
                .queryToEscrow
                .set(
                    queryId,
                    escrowId,
                );

            storage.nextEscrowId = escrowId + 1;

            storage.save();
        }

        OwnershipAssigned => {
            var storage = lazy EscrowStorage.load();

            // 根据 queryId 查找托管记录
            val indexResult = storage
                .queryToEscrow
                .get(
                    msg.queryId,
                );

            assert (indexResult.isFound) throw Errors.InvalidQueryId;

            val escrowId = indexResult.loadValue();

            val recordResult = storage
                .records
                .get(
                    escrowId,
                );

            assert (recordResult.isFound) throw Errors.InvalidEscrow;

            val recordCell = recordResult.loadValue();

            var record = EscrowRecord.fromCell(recordCell);
            val recordExtra = record.extra.load();

            // 必须由指定 NFT Item 发出通知
            assert (in.senderAddress == record.nftItem) throw Errors.InvalidNftItem;

            // queryId 必须一致
            assert (msg.queryId == recordExtra.queryId) throw Errors.InvalidQueryId;

            // 前任所有者必须是原卖家
            assert (msg.prevOwner == record.seller) throw Errors.InvalidSeller;

            // 只允许 Pending 状态完成入库
            assert (record.status == 1) throw Errors.EscrowNotPending;

            // 必须使用 TEP-62 forward_payload 的引用 Cell 分支
            var payload = msg.forwardPayload;
            val payloadType = payload.loadUint(1);

            assert (payloadType == 1) throw Errors.InvalidNftNotification;

            // 读取引用 Cell 中的托管验证数据
            val payloadCell = payload.loadRef();
            var payloadData = payloadCell.beginParse();

            // 验证平台专用标记
            val payloadMarker = payloadData.loadUint(32);

            assert (payloadMarker == 0x53564950) throw Errors.InvalidNftNotification;

            // 验证 Payload 中的 queryId
            val payloadQueryId = payloadData.loadUint(64);

            assert (payloadQueryId == recordExtra.queryId) throw Errors.InvalidQueryId;

            // 不允许携带未经验证的额外数据
            payloadData.assertEnd();
            payload.assertEnd();

            // 所有验证通过后，才变更托管状态
            record.status = 2;

            storage
                .records
                .set(
                    escrowId,
                    record.toCell(),
                );

            storage.save();
        }

        else => {
            assert (in.body.isEmpty()) throw Errors.InvalidMessage;
        }
    }
}

// 处理退回消息
fun onBouncedMessage(_in: InMessageBounced) {}

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

    val result = storage.collections.get(collection);

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

// 根据 Marketplace 订单编号查询托管编号
get fun escrowIdByQueryId(queryId: uint64): uint64? {
    val storage = lazy EscrowStorage.load();

    val result = storage.queryToEscrow.get(queryId);

    if (!result.isFound) {
        return null;
    }

    return result.loadValue();
}
