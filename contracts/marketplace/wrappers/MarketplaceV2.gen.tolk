/// Auto-generated-style wrapper for isolated contract 'MarketplaceV2'.
import "@acton/build"
import "@acton/emulation/network"
import "@acton/testing/assert"
import "@contracts/MarketplaceV2"
import "@contracts/types"

struct MarketplaceV2 {
    address: address
    stateInit: ContractState? = null
    toShard: AddressShardingOptions? = null
}

fun MarketplaceV2.fromStorage(
    storage: MarketplaceV2Storage,
    toShard: AddressShardingOptions? = null,
    workchain: int8 = BASECHAIN,
): MarketplaceV2 {
    val stateInit = ContractState {
        code: build("MarketplaceV2"),
        data: storage.toCell(),
    };
    val address = AutoDeployAddress { workchain, stateInit, toShard }.calculateAddress();
    return MarketplaceV2 { address, stateInit, toShard };
}

fun MarketplaceV2.deploy(
    self,
    from: address,
    config: SendParams = {},
): SendResultList {
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

fun MarketplaceV2.sendSetMarketplaceV2Escrow(
    self,
    from: address,
    escrow: address,
    config: SendParams = {},
): SendResultList {
    val genericMsg = createMessage({
        bounce: config.bounce,
        value: config.value,
        dest: self.address,
        body: SetMarketplaceV2Escrow { escrow },
    });
    return net.send(from, genericMsg);
}

fun MarketplaceV2.sendSetMarketplaceV2Treasury(
    self,
    from: address,
    treasury: address,
    config: SendParams = {},
): SendResultList {
    val genericMsg = createMessage({
        bounce: config.bounce,
        value: config.value,
        dest: self.address,
        body: SetMarketplaceV2Treasury { treasury },
    });
    return net.send(from, genericMsg);
}

fun MarketplaceV2.sendPublishProductV2(
    self,
    from: address,
    expectedProductId: uint64,
    queryId: uint64,
    nftItem: address,
    collection: address,
    itemIndex: uint256,
    kind: uint8,
    price: coins,
    config: SendParams = {},
): SendResultList {
    val genericMsg = createMessage({
        bounce: config.bounce,
        value: config.value,
        dest: self.address,
        body: PublishProductV2 {
            expectedProductId,
            queryId,
            nftItem,
            collection,
            extra: PublishProductV2Extra { itemIndex, kind, price }.toCell(),
        },
    });
    return net.send(from, genericMsg);
}

fun MarketplaceV2.sendBuyProductV2(
    self,
    from: address,
    productId: uint64,
    expectedPrice: coins,
    queryId: uint64,
    deadline: uint32,
    config: SendParams = {},
): SendResultList {
    val genericMsg = createMessage({
        bounce: config.bounce,
        value: config.value,
        dest: self.address,
        body: BuyProductV2 { productId, expectedPrice, queryId, deadline },
    });
    return net.send(from, genericMsg);
}

fun MarketplaceV2.sendRetryPayoutV2(
    self,
    from: address,
    operationId: uint64,
    config: SendParams = {},
): SendResultList {
    val genericMsg = createMessage({
        bounce: config.bounce,
        value: config.value,
        dest: self.address,
        body: RetryPayoutV2 { operationId },
    });
    return net.send(from, genericMsg);
}

fun MarketplaceV2.sendCancelProductV2(
    self,
    from: address,
    productId: uint64,
    config: SendParams = {},
): SendResultList {
    val genericMsg = createMessage({
        bounce: config.bounce,
        value: config.value,
        dest: self.address,
        body: CancelProductV2 { productId },
    });
    return net.send(from, genericMsg);
}

fun MarketplaceV2.ownerV2(self): address {
    return net.runGetMethod(self.address, "ownerV2");
}

fun MarketplaceV2.nextProductIdV2(self): uint64 {
    return net.runGetMethod(self.address, "nextProductIdV2");
}

fun MarketplaceV2.nextQueryIdV2(self): uint64 {
    return net.runGetMethod(self.address, "nextQueryIdV2");
}

fun MarketplaceV2.escrowV2(self): address {
    return net.runGetMethod(self.address, "escrowV2");
}

fun MarketplaceV2.escrowConfiguredV2(self): bool {
    return net.runGetMethod(self.address, "escrowConfiguredV2");
}

fun MarketplaceV2.treasuryV2(self): address {
    return net.runGetMethod(self.address, "treasuryV2");
}

fun MarketplaceV2.treasuryConfiguredV2(self): bool {
    return net.runGetMethod(self.address, "treasuryConfiguredV2");
}

fun MarketplaceV2.productStatusV2(self, productId: uint64): uint8? {
    return net.runGetMethod(self.address, "productStatusV2", [productId]);
}

fun MarketplaceV2.productEscrowIdV2(self, productId: uint64): uint64? {
    return net.runGetMethod(self.address, "productEscrowIdV2", [productId]);
}

fun MarketplaceV2.productQueryIdV2(self, productId: uint64): uint64? {
    return net.runGetMethod(self.address, "productQueryIdV2", [productId]);
}

fun MarketplaceV2.productV2(self, productId: uint64): MarketplaceV2Product? {
    return net.runGetMethod(self.address, "productV2", [productId]);
}

fun MarketplaceV2.payoutV2(self, operationId: uint64): MarketplaceV2Payout? {
    return net.runGetMethod(self.address, "payoutV2", [operationId]);
}

fun MarketplaceV2.orderV2(self, orderId: uint64): MarketplaceV2Order? {
    return net.runGetMethod(self.address, "orderV2", [orderId]);
}

fun MarketplaceV2.orderCellV2(self, orderId: uint64): cell? {
    return net.runGetMethod(self.address, "orderCellV2", [orderId]);
}

fun MarketplaceV2.orderIdForProductV2(self, productId: uint64): uint64? {
    return net.runGetMethod(self.address, "orderIdForProductV2", [productId]);
}

fun MarketplaceV2.assetProductIdV2(self, nftItem: address): uint64? {
    return net.runGetMethod(self.address, "assetProductIdV2", [nftItem]);
}
