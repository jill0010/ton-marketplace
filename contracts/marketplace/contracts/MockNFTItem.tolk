import "types"

contract MockNFTItem {
    author: "Acton User"
    version: "1.0.0"
    description: "Local TEP-62 NFT Item Simulator"
    storage: MockNFTItemStorage
    incomingMessages: MockNFTItemAllowedMessage
}

struct MockNFTItemStorage {
    owner: address
}

fun MockNFTItemStorage.load(): MockNFTItemStorage {
    return MockNFTItemStorage.fromCell(contract.getData());
}

fun MockNFTItemStorage.save(self) {
    contract.setData(self.toCell());
}

struct (0x5fcc3d14) NftTransfer {
    queryId: uint64
    newOwner: address
    responseDestination: address
    customPayload: cell?
    forwardAmount: coins
    forwardPayload: RemainingBitsAndRefs
}

type MockNFTItemAllowedMessage = NftTransfer

struct (0x05138d91) NftOwnershipAssigned {
    queryId: uint64
    prevOwner: address
    forwardPayload: RemainingBitsAndRefs
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy MockNFTItemAllowedMessage.fromSlice(in.body);

    match (msg) {
        NftTransfer => {
            var storage = lazy MockNFTItemStorage.load();

            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;

            val previousOwner = storage.owner;

            storage.owner = msg.newOwner;
            storage.save();

            if (msg.forwardAmount > 0) {
                val notification = NftOwnershipAssigned {
                    queryId: msg.queryId,
                    prevOwner: previousOwner,
                    forwardPayload: msg.forwardPayload,
                };

                val outMsg = createMessage({
                    bounce: BounceMode.Only256BitsOfBody,
                    value: msg.forwardAmount,
                    dest: msg.newOwner,
                    body: notification,
                });

                outMsg.send(SEND_MODE_REGULAR);
            }
        }

        else => {
            assert (in.body.isEmpty()) throw Errors.InvalidMessage;
        }
    }
}

fun onBouncedMessage(_in: InMessageBounced) {}

get fun owner(): address {
    val storage = lazy MockNFTItemStorage.load();
    return storage.owner;
}
