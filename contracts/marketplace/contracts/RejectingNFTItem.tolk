import "types"

struct (0x7f000001) SetRejectReturn {
    rejectReturn: bool
}

contract RejectingNFTItem {
    author: "Acton User"
    version: "1.0.0"
    description: "Test-only TEP-62 NFT Item that can reject a return transfer"
    storage: RejectingNFTItemStorage
    incomingMessages: RejectingNFTItemAllowedMessage
}

struct RejectingNFTItemStorage {
    owner: address
    controller: address
    rejectOwner: address
    rejectReturn: bool
}

fun RejectingNFTItemStorage.load(): RejectingNFTItemStorage {
    return RejectingNFTItemStorage.fromCell(contract.getData());
}

fun RejectingNFTItemStorage.save(self) {
    contract.setData(self.toCell());
}

type RejectingNFTItemAllowedMessage = NftTransfer | SetRejectReturn

fun onInternalMessage(in: InMessage) {
    val msg = lazy RejectingNFTItemAllowedMessage.fromSlice(in.body);

    match (msg) {
        SetRejectReturn => {
            var storage = lazy RejectingNFTItemStorage.load();
            assert (in.senderAddress == storage.controller) throw Errors.NotOwner;
            storage.rejectReturn = msg.rejectReturn;
            storage.save();
        }

        NftTransfer => {
            var storage = lazy RejectingNFTItemStorage.load();
            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;

            // 测试开关模拟 NFT Item 在退回给原卖家时发生真实 compute-phase failure。
            // 失败发生在所有权写入和任何通知发送之前，链上状态应保持不变。
            assert (!(storage.rejectReturn && msg.newOwner == storage.rejectOwner)) throw 402;

            val previousOwner = storage.owner;
            var restAmount = contract.getOriginalBalance() - grams("0.05");
            val fwdFees = in.originalForwardFee * 3 / 2;

            if (msg.forwardAmount > 0) {
                restAmount -= msg.forwardAmount + fwdFees;
            }
            if (msg.responseDestination != null) {
                restAmount -= fwdFees;
            }
            assert (restAmount >= 0) throw 402;

            if (msg.forwardAmount > 0) {
                val notification = NftOwnershipAssigned {
                    queryId: msg.queryId,
                    prevOwner: previousOwner,
                    forwardPayload: msg.forwardPayload,
                };
                createMessage({
                    bounce: BounceMode.Only256BitsOfBody,
                    value: msg.forwardAmount,
                    dest: msg.newOwner,
                    body: notification,
                }).send(SEND_MODE_PAY_FEES_SEPARATELY);
            }

            if (msg.responseDestination != null) {
                val excesses = NftExcesses { queryId: msg.queryId };
                createMessage({
                    bounce: BounceMode.NoBounce,
                    value: restAmount,
                    dest: msg.responseDestination!!,
                    body: excesses,
                }).send(SEND_MODE_PAY_FEES_SEPARATELY);
            }

            storage.owner = msg.newOwner;
            storage.save();
        }

        else => {
            assert (in.body.isEmpty()) throw Errors.InvalidMessage;
        }
    }
}

fun onBouncedMessage(_in: InMessageBounced) {}

get fun owner(): address {
    val storage = lazy RejectingNFTItemStorage.load();
    return storage.owner;
}
