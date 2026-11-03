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

fun MarketplaceV2.sendPublishProductV2(
    self,
    from: address,
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
        body: PublishProductV2 { nftItem, collection, itemIndex, kind, price },
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

fun MarketplaceV2.escrowV2(self): address {
    return net.runGetMethod(self.address, "escrowV2");
}

fun MarketplaceV2.escrowConfiguredV2(self): bool {
    return net.runGetMethod(self.address, "escrowConfiguredV2");
}

fun MarketplaceV2.productV2(self, productId: uint64): MarketplaceV2Product? {
    return net.runGetMethod(self.address, "productV2", [productId]);
}

fun MarketplaceV2.assetProductIdV2(self, nftItem: address): uint64? {
    return net.runGetMethod(self.address, "assetProductIdV2", [nftItem]);
}
