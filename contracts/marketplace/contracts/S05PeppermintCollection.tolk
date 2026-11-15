// S05 TESTNET ONLY: minimal one-item Peppermint fixture collection.
// The item StateInit must embed THIS contract's address as collection.
// Owner can mint once; no mainnet use, no public minting.
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
    itemData: cell
    minted: bool
}

struct (0x53050001) S05PeppermintMint {
    queryId: uint64
    initialOwner: address
    deployBody: cell
}

fun S05PeppermintCollectionStorage.load(): S05PeppermintCollectionStorage {
    return S05PeppermintCollectionStorage.fromCell(contract.getData());
}

fun S05PeppermintCollectionStorage.save(self) {
    contract.setData(self.toCell());
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy S05PeppermintMint.fromSlice(in.body);
    var storage = lazy S05PeppermintCollectionStorage.load();
    assert (in.senderAddress == storage.owner) throw 401;
    assert (!storage.minted) throw 402;
    assert (storage.itemIndex == 1) throw 403;

    // The item data and its address are immutable after this mint.
    // The StateInit must use the Peppermint library-reference Item code.
    val init: ContractState = {
        code: storage.itemCode,
        data: storage.itemData,
    };
    val destination = AutoDeployAddress {
        workchain: 0,
        stateInit: init,
    };
    val deploy = createMessage({
        bounce: false,
        value: grams("1.5"),
        dest: destination,
        body: msg.deployBody,
    });
    // Prevent replay before dispatching the outbound initialization.
    storage.minted = true;
    storage.save();
    deploy.send(SEND_MODE_PAY_FEES_SEPARATELY);
}

fun onBouncedMessage(_in: InMessageBounced) {}

get fun get_nft_address_by_index(index: int): address {
    val storage = lazy S05PeppermintCollectionStorage.load();
    assert (index == storage.itemIndex) throw 404;
    val init: ContractState = {
        code: storage.itemCode,
        data: storage.itemData,
    };
    val destination = AutoDeployAddress {
        workchain: 0,
        stateInit: init,
    };
    return destination.calculateAddress();
}
