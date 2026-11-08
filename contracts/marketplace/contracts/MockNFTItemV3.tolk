import "types"

contract MockNFTItemV3 {
    author: "TON Market Testnet"
    version: "3.0.0-testnet"
    description: "Testnet-only TEP-62 fixture with Fragment-compatible StateInit layout"
    storage: MockNFTItemV3Storage
    incomingMessages: MockNFTItemV3AllowedMessage
}

struct MockNFTItemV3Storage {
    itemIndex: uint256
    collection: address
    initialized: bool
    owner: address
    content: cell
}

fun MockNFTItemV3Storage.load(): MockNFTItemV3Storage {
    var root = contract.getData().beginParse();
    var config = root.loadRef().beginParse();
    val itemIndex = config.loadUint(256);
    val collection = config.loadAddress();
    val initialized = root.loadUint(1) == 1;
    if (!initialized) {
        return MockNFTItemV3Storage {
            itemIndex,
            collection,
            initialized: false,
            owner: collection,
            content: beginCell().endCell(),
        };
    }
    var state = root.loadRef().beginParse();
    val owner = state.loadAddress();
    val content = state.loadRef();
    state.assertEnd();
    root.assertEnd();
    return MockNFTItemV3Storage {
        itemIndex,
        collection,
        initialized: true,
        owner,
        content,
    };
}

fun MockNFTItemV3Storage.save(self) {
    val config = beginCell().storeUint(self.itemIndex, 256).storeAddress(self.collection).endCell();
    val state = beginCell().storeAddress(self.owner).storeRef(self.content).endCell();
    val data = beginCell().storeRef(config).storeUint(1, 1).storeRef(state).endCell();
    contract.setData(data);
}

struct (0x299a3e15) DeployMockNFTItemV3 {
    owner: address
    amount: coins
    tokenInfo: cell
    content: cell
    auctionConfig: cell
    royaltyParams: cell
}

type MockNFTItemV3AllowedMessage = DeployMockNFTItemV3 | NftTransfer

fun onInternalMessage(in: InMessage) {
    val msg = lazy MockNFTItemV3AllowedMessage.fromSlice(in.body);
    match (msg) {
        DeployMockNFTItemV3 => {
            var storage = MockNFTItemV3Storage.load();
            assert (!storage.initialized) throw Errors.InvalidMessage;
            assert (in.senderAddress == storage.collection) throw Errors.NotOwner;
            assert (msg.owner != storage.collection) throw Errors.NotOwner;
            storage.owner = msg.owner;
            storage.content = msg.content;
            storage.initialized = true;
            storage.save();
        }

        NftTransfer => {
            var storage = MockNFTItemV3Storage.load();
            assert (storage.initialized && in.senderAddress == storage.owner) throw Errors.NotOwner;
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
                createMessage({
                    bounce: BounceMode.NoBounce,
                    value: restAmount,
                    dest: msg.responseDestination!!,
                    body: NftExcesses { queryId: msg.queryId },
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

get fun get_nft_data(): (int, uint256, address, address, cell) {
    val storage = MockNFTItemV3Storage.load();
    var initialized: int = 0;
    if (storage.initialized) {
        initialized = -1;
    }
    return (initialized, storage.itemIndex, storage.collection, storage.owner, storage.content);
}

get fun owner(): address {
    return MockNFTItemV3Storage.load().owner;
}

get fun collection(): address {
    return MockNFTItemV3Storage.load().collection;
}

get fun index(): uint256 {
    return MockNFTItemV3Storage.load().itemIndex;
}
