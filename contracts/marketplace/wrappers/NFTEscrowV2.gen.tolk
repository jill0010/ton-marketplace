/// Auto-generated-style wrapper for isolated contract 'NFTEscrowV2'
import "@acton/build"
import "@acton/emulation/network"
import "@acton/testing/assert"
import "@contracts/types"

struct NFTEscrowV2 {
    address: address
    stateInit: ContractState? = null
    toShard: AddressShardingOptions? = null
}

fun NFTEscrowV2.fromStorage(
    storage: NFTEscrowV2Storage,
    toShard: AddressShardingOptions? = null,
    workchain: int8 = BASECHAIN,
): NFTEscrowV2 {
    val stateInit = ContractState {
        code: build("NFTEscrowV2"),
        data: storage.toCell(),
    };
    val address = AutoDeployAddress { workchain, stateInit, toShard }.calculateAddress();
    return NFTEscrowV2 { address, stateInit, toShard };
}

fun NFTEscrowV2.deploy(self, from: address, config: SendParams = {}): SendResultList {
    if (self.stateInit == null) {
        Assert.fail("Cannot deploy a contract created without state init");
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

fun NFTEscrowV2.sendReleaseEscrowV2(
    self,
    from: address,
    orderId: uint64,
    productId: uint64,
    escrowId: uint64,
    queryId: uint64,
    buyer: address,
    config: SendParams = {},
): SendResultList {
    val genericMsg = createMessage({
        bounce: config.bounce,
        value: config.value,
        dest: self.address,
        body: ReleaseEscrowV2 { orderId, productId, escrowId, queryId, buyer },
    });
    return net.send(from, genericMsg);
}

fun NFTEscrowV2.sendNftExcesses(
    self,
    from: address,
    queryId: uint64,
    config: SendParams = {},
): SendResultList {
    val genericMsg = createMessage({
        bounce: config.bounce, value: config.value, dest: self.address,
        body: NftExcesses { queryId },
    });
    return net.send(from, genericMsg);
}

fun NFTEscrowV2.sendEscrowReleaseAckV2(
    self,
    from: address,
    orderId: uint64,
    productId: uint64,
    escrowId: uint64,
    queryId: uint64,
    nftItem: address,
    buyer: address,
    config: SendParams = {},
): SendResultList {
    val genericMsg = createMessage({
        bounce: config.bounce, value: config.value, dest: self.address,
        body: EscrowReleaseAckV2 { orderId, productId, escrowId, queryId, nftItem, buyer },
    });
    return net.send(from, genericMsg);
}

fun NFTEscrowV2.sendRetryReleaseCallbackV2(
    self,
    from: address,
    escrowId: uint64,
    config: SendParams = {},
): SendResultList {
    val genericMsg = createMessage({
        bounce: config.bounce, value: config.value, dest: self.address,
        body: RetryReleaseCallbackV2 { escrowId },
    });
    return net.send(from, genericMsg);
}

fun NFTEscrowV2.owner(self): address {
    return net.runGetMethod(self.address, "owner");
}

fun NFTEscrowV2.marketplace(self): address {
    return net.runGetMethod(self.address, "marketplace");
}

fun NFTEscrowV2.escrowRecordV2(self, escrowId: uint64): NFTEscrowV2Record? {
    return net.runGetMethod(self.address, "escrowRecordV2", [escrowId]);
}

fun NFTEscrowV2.releaseCallbackV2(self, escrowId: uint64): EscrowReleaseCallbackV2? {
    return net.runGetMethod(self.address, "releaseCallbackV2", [escrowId]);
}
