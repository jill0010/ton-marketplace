import "@acton/env"
import "@acton/io"
import "@acton/build"
import "@acton/emulation/network"
import "@wrappers/MarketplaceV2.gen"
import "@wrappers/NFTEscrowV2.gen"

fun main() {
    assert (env<bool>("V3_TESTNET_FIXTURE_ENABLED") ?? false) throw 901;
    val nftItem = env<address>("V3_TESTNET_FIXTURE_NFT_ADDRESS")!!;
    val marketplace = MarketplaceV2 { address: env<address>("V3_PRODUCTION_TESTNET_MARKETPLACE_ADDRESS")!! };
    val escrow = NFTEscrowV2 { address: env<address>("V3_PRODUCTION_TESTNET_ESCROW_ADDRESS")!! };
    val seller = env<address>("V3_TESTNET_DEPLOYER_ADDRESS")!!;
    val collection = env<address>("PLATFORM_TREASURY_ADDRESS")!!;
    val nft = net.runGetMethod<tuple>(nftItem, "get_nft_data");
    val code = build("MockNFTItemV3");
    val config = beginCell().storeUint(3, 256).storeAddress(collection).endCell();
    val data = beginCell().storeRef(config).storeUint(0, 1).endCell();
    val stateInit: ContractState = { code, data };
    val expected = AutoDeployAddress { workchain: 0, stateInit }.calculateAddress();
    val product = marketplace.productV2(1);
    println("S07_09_READ_ONLY_NFT_INITIALIZED: {}", nft.get(0));
    println("S07_09_READ_ONLY_NFT_INDEX: {}", nft.get(1));
    println("S07_09_READ_ONLY_NFT_COLLECTION: {}", nft.get(2));
    println("S07_09_READ_ONLY_NFT_OWNER: {}", nft.get(3));
    println("S07_09_READ_ONLY_EXPECTED_NFT: {}", expected);
    println("S07_09_READ_ONLY_NFT_ADDRESS_MATCH: {}", expected == nftItem);
    println("S07_09_READ_ONLY_NFT_SELLER_MATCH: {}", (nft.get(3) as address) == seller);
    println("S07_09_READ_ONLY_ITEM_CODE_HASH: {}", code.hash());
    println("S07_09_READ_ONLY_MARKETPLACE_ESCROW: {}", marketplace.escrowV2());
    println("S07_09_READ_ONLY_ESCROW_MARKETPLACE: {}", escrow.marketplace());
    println("S07_09_READ_ONLY_ASSET_PRODUCT: {}", marketplace.assetProductIdV2(nftItem));
    println("S07_09_READ_ONLY_ASSET_ESCROW: {}", escrow.assetEscrowIdV2(nftItem));
    println("S07_09_READ_ONLY_FAILED_PRODUCT_STATUS: {}", marketplace.productStatusV2(1));
    println("S07_09_READ_ONLY_FAILED_PRODUCT_ESCROW_ID: {}", marketplace.productEscrowIdV2(1));
    println("S07_09_READ_ONLY_FAILED_PRODUCT_QUERY_ID: {}", marketplace.productQueryIdV2(1));
    println("S07_09_READ_ONLY_NEXT_PRODUCT_ID: {}", marketplace.nextProductIdV2());
    println("S07_09_READ_ONLY_NEXT_QUERY_ID: {}", marketplace.nextQueryIdV2());
    println("S07_09_READ_ONLY_ESCROW_QUERY_ID: {}", escrow.escrowIdForQueryV2(43855669637));
    assert (nft.get(0) as int == -1) throw 980;
    assert (nft.get(1) as int == 3) throw 980;
    assert (nft.get(2) as address == collection) throw 980;
    assert (nft.get(3) as address == seller) throw 980;
    assert (expected == nftItem) throw 980;
    assert (marketplace.assetProductIdV2(nftItem) == null) throw 981;
    assert (escrow.assetEscrowIdV2(nftItem) == null) throw 981;
    assert (marketplace.productStatusV2(1) == 5) throw 981;
    println("S07_09_READ_ONLY_RECOVERY_PREFLIGHT: PASS");
}
