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

fun NFTEscrowV2.sendCreateEscrowV2(
    self,
    from: address,
    productId: uint64,
    nftItem: address,
    collection: address,
    seller: address,
    queryId: uint64,
    itemIndex: uint256,
    kind: uint8,
    config: SendParams = {},
): SendResultList {
    val genericMsg = createMessage({
        bounce: config.bounce,
        value: config.value,
        dest: self.address,
        body: CreateEscrowV2 {
            productId,
            nftItem,
            collection,
            seller,
            queryId,
            extra: CreateEscrowV2Extra { itemIndex, kind }.toCell(),
        },
    });
    return net.send(from, genericMsg);
}

fun NFTEscrowV2.sendSetCollectionStatusV2(
    self,
    from: address,
    collection: address,
    newStatus: uint8,
    config: SendParams = {},
): SendResultList {
    val genericMsg = createMessage({
        bounce: config.bounce,
        value: config.value,
        dest: self.address,
        body: SetCollectionStatusV2 { collection, newStatus },
    });
    return net.send(from, genericMsg);
}

fun NFTEscrowV2.sendSetCollectionItemCodeV2(
    self,
    from: address,
    collection: address,
    kind: uint8,
    code: cell,
    config: SendParams = {},
): SendResultList {
    val genericMsg = createMessage({
        bounce: config.bounce,
        value: config.value,
        dest: self.address,
        body: SetCollectionItemCodeV2 { collection, kind, code },
    });
    return net.send(from, genericMsg);
}

fun NFTEscrowV2.sendEscrowDepositAckV2(
    self,
    from: address,
    escrowId: uint64,
    productId: uint64,
    nftItem: address,
    seller: address,
    queryId: uint64,
    config: SendParams = {},
): SendResultList {
    val genericMsg = createMessage({
        bounce: config.bounce,
        value: config.value,
        dest: self.address,
        body: EscrowDepositAckV2 { escrowId, productId, nftItem, seller, queryId },
    });
    return net.send(from, genericMsg);
}

fun NFTEscrowV2.sendRetryDepositCallbackV2(
    self,
    from: address,
    escrowId: uint64,
    config: SendParams = {},
): SendResultList {
    val genericMsg = createMessage({
        bounce: config.bounce,
        value: config.value,
        dest: self.address,
        body: RetryDepositCallbackV2 { escrowId },
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

fun NFTEscrowV2.sendRefundEscrowV2(
    self,
    from: address,
    escrowId: uint64,
    productId: uint64,
    queryId: uint64,
    seller: address,
    config: SendParams = {},
): SendResultList {
    val genericMsg = createMessage({
        bounce: config.bounce,
        value: config.value,
        dest: self.address,
        body: RefundEscrowV2 { escrowId, productId, queryId, seller },
    });
    return net.send(from, genericMsg);
}

fun NFTEscrowV2.sendEscrowRefundAckV2(
    self,
    from: address,
    escrowId: uint64,
    productId: uint64,
    queryId: uint64,
    nftItem: address,
    seller: address,
    config: SendParams = {},
): SendResultList {
    val genericMsg = createMessage({
        bounce: config.bounce,
        value: config.value,
        dest: self.address,
        body: EscrowRefundAckV2 { escrowId, productId, queryId, nftItem, seller },
    });
    return net.send(from, genericMsg);
}

fun NFTEscrowV2.sendRetryRefundCallbackV2(
    self,
    from: address,
    escrowId: uint64,
    config: SendParams = {},
): SendResultList {
    val genericMsg = createMessage({
        bounce: config.bounce,
        value: config.value,
        dest: self.address,
        body: RetryRefundCallbackV2 { escrowId },
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
        bounce: config.bounce,
        value: config.value,
        dest: self.address,
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
        bounce: config.bounce,
        value: config.value,
        dest: self.address,
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
        bounce: config.bounce,
        value: config.value,
        dest: self.address,
        body: RetryReleaseCallbackV2 { escrowId },
    });
    return net.send(from, genericMsg);
}

fun NFTEscrowV2.assetEscrowIdV2(self, nftItem: address): uint64? {
    return net.runGetMethod(self.address, "assetEscrowIdV2", [nftItem]);
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

fun NFTEscrowV2.depositCallbackV2(self, escrowId: uint64): EscrowDepositCallbackV2? {
    return net.runGetMethod(self.address, "depositCallbackV2", [escrowId]);
}

fun NFTEscrowV2.releaseCallbackV2(self, escrowId: uint64): EscrowReleaseCallbackV2? {
    return net.runGetMethod(self.address, "releaseCallbackV2", [escrowId]);
}

fun NFTEscrowV2.refundCallbackV2(self, escrowId: uint64): EscrowRefundCallbackV2? {
    return net.runGetMethod(self.address, "refundCallbackV2", [escrowId]);
}
