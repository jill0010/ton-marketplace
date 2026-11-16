import "@acton/build"
import "@acton/env"
import "@acton/io"
import "@acton/emulation/network"
import "@contracts/MockNFTItemV3"
import "@wrappers/MarketplaceV2.gen"

fun main() {
    val collection = env<address>("PLATFORM_TREASURY_ADDRESS");
    val marketplaceAddress = env<address>("V3_PRODUCTION_TESTNET_MARKETPLACE_ADDRESS");
    assert (collection != null && marketplaceAddress != null) throw 981;
    val itemIndex: uint256 = 3;
    val code = build("MockNFTItemV3");
    val config = beginCell().storeUint(itemIndex, 256).storeAddress(collection!!).endCell();
    val data = beginCell().storeRef(config).storeUint(0, 1).endCell();
    val stateInit: ContractState = { code: code, data: data };
    val destination = AutoDeployAddress { workchain: 0, stateInit };
    val nftItem = destination.calculateAddress();
    println("S07_09_FIXTURE_INDEX: {}", itemIndex);
    println("S07_09_EXPECTED_NFT_ADDRESS: {}", nftItem);
    val marketplace = MarketplaceV2 { address: marketplaceAddress!! };
    val productId = marketplace.assetProductIdV2(nftItem);
    println("S07_09_PRODUCT_ID: {}", productId);
    if (productId != null) {
        println("S07_09_PRODUCT_STATUS: {}", marketplace.productStatusV2(productId!!));
        println("S07_09_ORDER_ID: {}", marketplace.orderIdForProductV2(productId!!));
    }
    val nft = net.runGetMethod<tuple>(nftItem, "get_nft_data");
    println("S07_09_NFT_INITIALIZED: {}", nft.get(0));
    println("S07_09_NFT_INDEX: {}", nft.get(1));
    println("S07_09_NFT_COLLECTION: {}", nft.get(2));
    println("S07_09_NFT_OWNER: {}", nft.get(3));
}
