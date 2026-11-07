/// Auto-generated-style wrapper for isolated contract 'NFTEscrowV2Testnet'
import "@acton/build"
import "@acton/emulation/network"
import "@acton/testing/assert"
import "@contracts/types"

struct NFTEscrowV2Testnet {
    address: address
    stateInit: ContractState? = null
    toShard: AddressShardingOptions? = null
}

fun NFTEscrowV2Testnet.fromStorage(
    storage: NFTEscrowV2TestnetStorage,
    toShard: AddressShardingOptions? = null,
    workchain: int8 = BASECHAIN,
): NFTEscrowV2Testnet {
    val stateInit = ContractState {
        code: build("NFTEscrowV2Testnet"),
        data: storage.toCell(),
    };
    val address = AutoDeployAddress { workchain, stateInit, toShard }.calculateAddress();
    return NFTEscrowV2Testnet { address, stateInit, toShard };
}

fun NFTEscrowV2Testnet.deploy(self, from: address, config: SendParams = {}): SendResultList {
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

fun NFTEscrowV2Testnet.sendCreateEscrowV2(
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

fun NFTEscrowV2Testnet.sendSetCollectionStatusV2(
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

fun NFTEscrowV2Testnet.sendSetCollectionItemCodeV2(
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

fun NFTEscrowV2Testnet.sendEscrowDepositAckV2(
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

fun NFTEscrowV2Testnet.sendRetryDepositCallbackV2(
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

fun NFTEscrowV2Testnet.sendReleaseEscrowV2(
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

fun NFTEscrowV2Testnet.sendRefundEscrowV2(
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

fun NFTEscrowV2Testnet.sendEscrowRefundAckV2(
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

fun NFTEscrowV2Testnet.sendRetryRefundCallbackV2(
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

fun NFTEscrowV2Testnet.sendNftExcesses(
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

fun NFTEscrowV2Testnet.sendEscrowReleaseAckV2(
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

fun NFTEscrowV2Testnet.sendRetryReleaseCallbackV2(
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

fun NFTEscrowV2Testnet.sendEscrowReleaseFailureAckV2(
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
        body: EscrowReleaseFailureAckV2 { orderId, productId, escrowId, queryId, nftItem, buyer },
    });
    return net.send(from, genericMsg);
}

fun NFTEscrowV2Testnet.sendRetryReleaseFailureCallbackV2(
    self,
    from: address,
    escrowId: uint64,
    config: SendParams = {},
): SendResultList {
    val genericMsg = createMessage({
        bounce: config.bounce,
        value: config.value,
        dest: self.address,
        body: RetryReleaseFailureCallbackV2 { escrowId },
    });
    return net.send(from, genericMsg);
}

fun NFTEscrowV2Testnet.escrowIdForQueryV2(self, queryId: uint64): uint64 {
    return net.runGetMethod(self.address, "escrowIdForQueryV2", [queryId]);
}

fun NFTEscrowV2Testnet.assetEscrowIdV2(self, nftItem: address): uint64? {
    return net.runGetMethod(self.address, "assetEscrowIdV2", [nftItem]);
}

fun NFTEscrowV2Testnet.owner(self): address {
    return net.runGetMethod(self.address, "owner");
}

fun NFTEscrowV2Testnet.marketplace(self): address {
    return net.runGetMethod(self.address, "marketplace");
}

fun NFTEscrowV2Testnet.escrowRecordV2(self, escrowId: uint64): NFTEscrowV2TestnetRecord? {
    return net.runGetMethod(self.address, "escrowRecordV2", [escrowId]);
}

fun NFTEscrowV2Testnet.depositCallbackV2(self, escrowId: uint64): EscrowDepositCallbackV2? {
    return net.runGetMethod(self.address, "depositCallbackV2", [escrowId]);
}

fun NFTEscrowV2Testnet.releaseCallbackV2(self, escrowId: uint64): EscrowReleaseCallbackV2? {
    return net.runGetMethod(self.address, "releaseCallbackV2", [escrowId]);
}

fun NFTEscrowV2Testnet.refundCallbackV2(self, escrowId: uint64): EscrowRefundCallbackV2? {
    return net.runGetMethod(self.address, "refundCallbackV2", [escrowId]);
}

fun NFTEscrowV2Testnet.releaseFailureCallbackV2(
    self,
    escrowId: uint64,
): EscrowReleaseFailureCallbackV2? {
    return net.runGetMethod(self.address, "releaseFailureCallbackV2", [escrowId]);
}
