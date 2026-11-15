// S05 TESTNET ONLY: one-shot Peppermint NFT fixture collection.
// Item StateInit uses this deployed contract address, never the wallet address.
import "types"

contract S05PeppermintCollection {
    author: "TON Market"
    version: "0.1.0"
    description: "Testnet-only Peppermint fixture collection"
    storage: S05PeppermintCollectionStorage
    incomingMessages: S05PeppermintMint
}

struct S05PeppermintCollectionStorage {
    owner: address
    itemIndex: uint256
    itemCode: cell
    minted: bool
}

struct (0x53050001) S05PeppermintMint {
    queryId: uint64
    deployBody: cell
}

fun S05PeppermintCollectionStorage.load(): S05PeppermintCollectionStorage {
    return S05PeppermintCollectionStorage.fromCell(contract.getData());
}

fun S05PeppermintCollectionStorage.save(self) {
    contract.setData(self.toCell());
}

fun S05PeppermintCollectionStorage.itemState(self, collection: address): ContractState {
    val config = beginCell().storeUint(self.itemIndex, 256).storeAddress(collection).endCell();
    val itemData = beginCell().storeRef(config).storeUint(0, 1).endCell();
    return { code: self.itemCode, data: itemData };
}

fun onInternalMessage(in: InMessage) {
    // Allow the initial contract deployment without attempting a mint.
    if (in.body.isEmpty()) {
        return;
    }
    val msg = lazy S05PeppermintMint.fromSlice(in.body);
    var storage = lazy S05PeppermintCollectionStorage.load();
    assert (in.senderAddress == storage.owner) throw 401;
    assert (!storage.minted) throw 402;
    assert (storage.itemIndex == 1) throw 403;
    val destination = AutoDeployAddress {
        workchain: 0,
        stateInit: storage.itemState(contract.getAddress()),
    };
    val deploy = createMessage({
        bounce: false,
        value: grams("1.5"),
        dest: destination,
        body: msg.deployBody,
    });
    storage.minted = true;
    storage.save();
    deploy.send(SEND_MODE_PAY_FEES_SEPARATELY);
}

fun onBouncedMessage(_in: InMessageBounced) {}

get fun get_nft_address_by_index(index: int): address {
    val storage = lazy S05PeppermintCollectionStorage.load();
    assert (index == storage.itemIndex) throw 404;
    val destination = AutoDeployAddress {
        workchain: 0,
        stateInit: storage.itemState(contract.getAddress()),
    };
    return destination.calculateAddress();
}
