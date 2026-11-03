/// Test wrapper for MockMarketplaceEscrowV2.
import "@acton/build"
import "@acton/emulation/network"
import "@acton/testing/assert"
import "@contracts/MockMarketplaceEscrowV2"
import "@contracts/types"

struct MockMarketplaceEscrowV2 {
    address: address
    stateInit: ContractState? = null
    toShard: AddressShardingOptions? = null
}

fun MockMarketplaceEscrowV2.fromStorage(
    storage: MockMarketplaceEscrowV2Storage,
    toShard: AddressShardingOptions? = null,
    workchain: int8 = BASECHAIN,
): MockMarketplaceEscrowV2 {
    val stateInit = ContractState {
        code: build("MockMarketplaceEscrowV2"),
        data: storage.toCell(),
    };
    val address = AutoDeployAddress { workchain, stateInit, toShard }.calculateAddress();
    return MockMarketplaceEscrowV2 { address, stateInit, toShard };
}

fun MockMarketplaceEscrowV2.deploy(
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

fun MockMarketplaceEscrowV2.sendSetMockRejectRefundV2(
    self,
    from: address,
    rejectRefund: bool,
    config: SendParams = {},
): SendResultList {
    val genericMsg = createMessage({
        bounce: config.bounce,
        value: config.value,
        dest: self.address,
        body: SetMockRejectRefundV2 { rejectRefund },
    });
    return net.send(from, genericMsg);
}

fun MockMarketplaceEscrowV2.rejectRefundV2(self): bool {
    return net.runGetMethod(self.address, "rejectRefund");
}
