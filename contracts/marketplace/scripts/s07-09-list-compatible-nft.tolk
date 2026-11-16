import "@acton/env"
import "@acton/io"
import "@acton/emulation/scripts"
import "@acton/emulation/network"
import "@wrappers/MarketplaceV2.gen"
import "@wrappers/NFTEscrowV2.gen"
import "list-testnet-nft-fixture"

fun main() {
    assert (env<bool>("S07_09_COMPATIBLE_LISTING_APPROVED") ?? false) throw 975;
    val seller = scripts.wallet("deployer");
    val treasury = scripts.wallet("treasury");
    val nftItem = env<address>("S07_09_COMPATIBLE_NFT_ADDRESS")!!;
    val marketplace = MarketplaceV2 { address: env<address>("V3_PRODUCTION_TESTNET_MARKETPLACE_ADDRESS")!! };
    val escrow = NFTEscrowV2 { address: env<address>("V3_PRODUCTION_TESTNET_ESCROW_ADDRESS")!! };
    assert (seller.address == env<address>("V3_TESTNET_DEPLOYER_ADDRESS")!!) throw 976;
    assert (treasury.address == env<address>("PLATFORM_TREASURY_ADDRESS")!!) throw 976;
    assert (marketplace.escrowConfiguredV2() && marketplace.escrowV2() == escrow.address) throw 977;
    assert (escrow.marketplace() == marketplace.address) throw 977;
    assert (marketplace.treasuryV2() == treasury.address) throw 977;
    val data = net.runGetMethod<tuple>(nftItem, "get_nft_data");
    val collection = data.get(2) as address;
    assert ((data.get(0) as int) == -1) throw 978;
    assert ((data.get(1) as int) == 1) throw 978;
    assert ((data.get(3) as address) == seller.address) throw 978;
    assert (marketplace.assetProductIdV2(nftItem) == null) throw 978;
    assert (escrow.assetEscrowIdV2(nftItem) == null) throw 978;
    val itemCode = parseCellFromHex("b5ee9c720101010100230008420291d9e2ac169fc785ce00de0a81af27622b9b7d1764415c775e7e50c03ce98aa2");
    assert (itemCode.hash() == 0x30dcd7d5b6fcf5968c2791e1e31ad732f2672f2986e1d6970eb03cca22d23251) throw 979;
    val cfg = beginCell().storeUint(1, 256).storeAddress(collection).endCell();
    val stateData = beginCell().storeRef(cfg).storeUint(0, 1).endCell();
    val state: ContractState = { code: itemCode, data: stateData };
    val expected = AutoDeployAddress { workchain: 0, stateInit: state }.calculateAddress();
    assert (expected == nftItem) throw 979;
    println("S07_09_COMPATIBLE_STATEINIT_MATCH: true");
    listTestFixture(marketplace, escrow, seller.address, nftItem, collection, seller.address, 1);
    println("S07_09_COMPATIBLE_NFT_LISTED_AND_CUSTODIED: true");
}
