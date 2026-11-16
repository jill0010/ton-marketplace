import "@acton/env"
import "@acton/io"
import "@acton/emulation/network"
import "@contracts/types"
import "@wrappers/MarketplaceV2.gen"
import "@wrappers/NFTEscrowV2.gen"

fun main() {
    val item = env<address>("S07_04_RECOVERED_NFT_ADDRESS");
    val marketplaceAddress = env<address>("V3_PRODUCTION_TESTNET_MARKETPLACE_ADDRESS");
    val escrowAddress = env<address>("V3_PRODUCTION_TESTNET_ESCROW_ADDRESS");
    val seller = env<address>("V3_TESTNET_DEPLOYER_ADDRESS");
    val collection = env<address>("PLATFORM_TREASURY_ADDRESS");
    assert (item != null && marketplaceAddress != null && escrowAddress != null && seller != null && collection != null) throw 972;
    val marketplace = MarketplaceV2 { address: marketplaceAddress! };
    val escrow = NFTEscrowV2 { address: escrowAddress! };
    assert (marketplace.escrowConfiguredV2() && marketplace.escrowV2() == escrow.address) throw 973;
    assert (escrow.marketplace() == marketplace.address) throw 973;
    val nft = net.runGetMethod<tuple>(item!!, "get_nft_data");
    assert (nft.size() == 5 && (nft.get(0) as int) == -1) throw 974;
    assert ((nft.get(1) as int) == 43819564334) throw 974;
    assert ((nft.get(2) as address) == collection!!) throw 974;
    val owner = nft.get(3) as address;
    println("S07_04_NFT_OWNER: {}", owner);
    println("S07_04_EXPECTED_SELLER: {}", seller!!);
    println("S07_04_EXPECTED_ESCROW: {}", escrow.address);
    val product = marketplace.assetProductIdV2(item!!);
    println("S07_04_PRODUCT_ID: {}", product);
    if (product != null) {
        println("S07_04_PRODUCT_STATUS: {}", marketplace.productStatusV2(product!!));
        println("S07_04_ORDER_ID: {}", marketplace.orderIdForProductV2(product!!));
    }
    println("S07_04_OWNER_IS_SELLER: {}", owner == seller!!);
    println("S07_04_OWNER_IS_ESCROW: {}", owner == escrow.address);
    assert (owner == seller!! || owner == escrow.address) throw 975;
    println("S07_04_READ_ONLY: true");
}