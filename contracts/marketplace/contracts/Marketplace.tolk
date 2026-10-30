import "types"

contract Marketplace {
    author: "Acton User"
    version: "1.0.0"
    description: "TON digital asset marketplace"
    storage: MarketplaceStorage
    incomingMessages: AllowedMessage
}

type AllowedMessage = ChangeOwner

// 处理链上内部消息
fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessage.fromSlice(in.body);

    match (msg) {
        ChangeOwner => {
            var storage = lazy MarketplaceStorage.load();

            // 只有当前管理员可以转移所有权
            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;

            storage.owner = msg.newOwner;
            storage.save();
        }
        else => {
            assert (in.body.isEmpty()) throw Errors.InvalidMessage;
        }
    }
}

// 处理退回消息
fun onBouncedMessage(_in: InMessageBounced) {}

// 查询当前管理员
get fun owner(): address {
    val storage = lazy MarketplaceStorage.load();
    return storage.owner;
}
