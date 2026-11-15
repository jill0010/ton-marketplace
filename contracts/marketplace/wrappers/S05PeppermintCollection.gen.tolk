/// Testnet fixture wrapper for S05PeppermintCollection.
/// Mirrors the Acton-generated deployment wrapper pattern.
import "@acton/build"
import "@acton/emulation/network"
import "@acton/testing/assert"
import "@contracts/S05PeppermintCollection"

struct S05PeppermintCollection {
    address: address
    stateInit: ContractState? = null
    toShard: AddressShardingOptions? = null
}

fun S05PeppermintCollection.fromStorage(
    storage: S05PeppermintCollectionStorage,
    toShard: AddressShardingOptions? = null,
    workchain: int8 = BASECHAIN,
): S05PeppermintCollection {
    val stateInit = ContractState {
        code: build("S05PeppermintCollection"),
        data: storage.toCell(),
    };
    val address = AutoDeployAddress { workchain, stateInit, toShard }.calculateAddress();
    return S05PeppermintCollection { address, stateInit, toShard };
}

fun S05PeppermintCollection.deploy(self, from: address, config: SendParams = {}): SendResultList {
    if (self.stateInit == null) {
        Assert.fail("Cannot deploy collection without StateInit");
    }
    val genericMsg = createMessage({
        bounce: config.bounce,
        value: config.value,
        dest: {
            workchain: self.address.getWorkchain(),
            stateInit: self.stateInit,
            toShard: self.toShard,
        },
    });
    return net.send(from, genericMsg);
}
