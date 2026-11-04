/// Test wrapper for TestMarketplaceEscrowV2.
import "@acton/build"
import "@acton/emulation/network"
import "@acton/testing/assert"
import "@contracts/TestMarketplaceEscrowV2"
import "@contracts/types"

struct TestMarketplaceEscrowV2 {
    address: address
    stateInit: ContractState? = null
    toShard: AddressShardingOptions? = null
}

fun TestMarketplaceEscrowV2.fromStorage(
    storage: NFTEscrowV2Storage,
    toShard: AddressShardingOptions? = null,
    workchain: int8 = BASECHAIN,
): TestMarketplaceEscrowV2 {
    val stateInit = ContractState {
        code: build("TestMarketplaceEscrowV2"),
        data: storage.toCell(),
    };
    val address = AutoDeployAddress { workchain, stateInit, toShard }.calculateAddress();
    return TestMarketplaceEscrowV2 { address, stateInit, toShard };
}

fun TestMarketplaceEscrowV2.deploy(
    self,
    from: address,
    config: SendParams = {},
): SendResultList {
    if (self.stateInit == null) {
        Assert.fail("Missing state init");
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
