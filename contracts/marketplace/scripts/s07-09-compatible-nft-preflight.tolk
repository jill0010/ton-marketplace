import "@acton/env"
import "@acton/io"
import "@acton/emulation/network"
import "@wrappers/MarketplaceV2.gen"
import "@wrappers/NFTEscrowV2.gen"

fun main() {
    val nftItem = env<address>("S07_09_COMPATIBLE_NFT_ADDRESS")!!;
    val seller = env<address>("V3_TESTNET_DEPLOYER_ADDRESS")!!;
    val marketplace = MarketplaceV2 { address: env<address>("V3_PRODUCTION_TESTNET_MARKETPLACE_ADDRESS")!! };
    val escrow = NFTEscrowV2 { address: env<address>("V3_PRODUCTION_TESTNET_ESCROW_ADDRESS")!! };
    val nft = net.runGetMethod<tuple>(nftItem, "get_nft_data");
    val initialized = nft.get(0) as int;
    val itemIndex = nft.get(1) as int;
    val collection = nft.get(2) as address;
    val owner = nft.get(3) as address;
    println("S07_09_COMPATIBLE_NFT: {}", nftItem);
    println("S07_09_COMPATIBLE_INITIALIZED: {}", initialized);
    println("S07_09_COMPATIBLE_INDEX: {}", itemIndex);
    println("S07_09_COMPATIBLE_COLLECTION: {}", collection);
    println("S07_09_COMPATIBLE_OWNER: {}", owner);
    println("S07_09_COMPATIBLE_SELLER_MATCH: {}", owner == seller);
    println("S07_09_COMPATIBLE_MARKETPLACE_ESCROW: {}", marketplace.escrowV2());
    println("S07_09_COMPATIBLE_ESCROW_MARKETPLACE: {}", escrow.marketplace());
    println("S07_09_COMPATIBLE_ASSET_PRODUCT: {}", marketplace.assetProductIdV2(nftItem));
    println("S07_09_COMPATIBLE_ASSET_ESCROW: {}", escrow.assetEscrowIdV2(nftItem));
    println("S07_09_COMPATIBLE_NEXT_PRODUCT: {}", marketplace.nextProductIdV2());
    println("S07_09_COMPATIBLE_NEXT_QUERY: {}", marketplace.nextQueryIdV2());
    assert (initialized == -1 && itemIndex >= 0) throw 982;
    assert (owner == seller) throw 982;
    assert (marketplace.escrowConfiguredV2() && marketplace.escrowV2() == escrow.address) throw 983;
    assert (escrow.marketplace() == marketplace.address) throw 983;
    assert (marketplace.assetProductIdV2(nftItem) == null) throw 984;
    assert (escrow.assetEscrowIdV2(nftItem) == null) throw 984;
    println("S07_09_COMPATIBLE_NFT_READ_ONLY_PREFLIGHT: PASS");
}
