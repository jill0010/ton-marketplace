
import "types"

contract NFTEscrow {
    author: "Acton User"
    version: "1.0.0"
    description: "TON NFT Escrow Contract"
    storage: EscrowStorage
    incomingMessages: AllowedMessage
}

type AllowedMessage = ChangeOwner | CreateEscrow

// 处理链上内部消息
fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessage.fromSlice(in.body);

    match (msg) {
        ChangeOwner => {
            var storage = lazy EscrowStorage.load();

            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;

            storage.owner = msg.newOwner;
            storage.save();
        }

        CreateEscrow => {
            var storage = lazy EscrowStorage.load();

            // 暂停状态下不允许创建托管
            assert (!storage.paused) throw Errors.EscrowPaused;

            // 只能由绑定的 Marketplace 合约发起
            assert (in.senderAddress == storage.marketplace) throw Errors.NotOwner;

            val escrowId = storage.nextEscrowId;

            // 创建托管记录
            val record = EscrowRecord {
                escrowId: escrowId,
                nftItem: msg.nftItem,
                collection: msg.collection,
                seller: msg.seller,
                productId: msg.productId,
                status: EscrowStatus.Pending,
                createdAt: msg.createdAt,
            };

            // 独立 Cell 存储，避免字典叶子节点溢出
            storage.records.set(escrowId, record.toCell());

            storage.nextEscrowId = escrowId + 1;

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
