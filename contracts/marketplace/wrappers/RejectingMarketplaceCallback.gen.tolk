/// Test wrapper for RejectingMarketplaceCallback.
import "@acton/build"
import "@acton/emulation/network"
import "@acton/testing/assert"
import "@contracts/RejectingMarketplaceCallback"
import "@contracts/types"

struct RejectingMarketplaceCallback {
    address: address
    stateInit: ContractState? = null
    toShard: AddressShardingOptions? = null
}

fun RejectingMarketplaceCallback.fromStorage(
    storage: RejectingMarketplaceCallbackStorage,
    toShard: AddressShardingOptions? = null,
    workchain: int8 = BASECHAIN,
): RejectingMarketplaceCallback {
    val stateInit = ContractState {
        code: build("RejectingMarketplaceCallback"),
        data: storage.toCell(),
    };
    val address = AutoDeployAddress { workchain, stateInit, toShard }.calculateAddress();
    return RejectingMarketplaceCallback { address, stateInit, toShard };
}

fun RejectingMarketplaceCallback.deploy(self, from: address, config: SendParams = {}): SendResultList {
    if (self.stateInit == null) Assert.fail("Missing state init");
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

fun RejectingMarketplaceCallback.sendSetTestEscrowAddressV2(
    self, from: address, escrow: address, config: SendParams = {},
): SendResultList {
    val genericMsg = createMessage({
        bounce: config.bounce, value: config.value, dest: self.address,
        body: SetTestEscrowAddressV2 { escrow },
    });
    return net.send(from, genericMsg);
}

fun RejectingMarketplaceCallback.sendSetRejectCallbackV2(
    self, from: address, rejectAction: bool, config: SendParams = {},
): SendResultList {
    val genericMsg = createMessage({
        bounce: config.bounce, value: config.value, dest: self.address,
        body: SetRejectCallbackV2 { rejectAction },
    });
    return net.send(from, genericMsg);
}

fun RejectingMarketplaceCallback.sendStartTestEscrowV2(
    self, from: address, productId: uint64, nftItem: address, seller: address,
    queryId: uint64, config: SendParams = {},
): SendResultList {
    val genericMsg = createMessage({
        bounce: config.bounce, value: config.value, dest: self.address,
        body: StartTestEscrowV2 { productId, nftItem, seller, queryId },
    });
    return net.send(from, genericMsg);
}

fun RejectingMarketplaceCallback.sendStartTestReleaseV2(
    self, from: address, orderId: uint64, productId: uint64, escrowId: uint64,
    queryId: uint64, buyer: address, config: SendParams = {},
): SendResultList {
    val genericMsg = createMessage({
        bounce: config.bounce, value: config.value, dest: self.address,
        body: StartTestReleaseV2 { orderId, productId, escrowId, queryId, buyer },
    });
    return net.send(from, genericMsg);
}

fun RejectingMarketplaceCallback.rejectAction(self): bool {
    return net.runGetMethod(self.address, "rejectAction");
}
