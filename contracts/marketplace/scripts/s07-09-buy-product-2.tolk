import "@acton/env"
import "@acton/io"
import "@acton/emulation/network"
import "@acton/emulation/scripts"
import "@wrappers/MarketplaceV2.gen"

fun main() {
    assert (env<bool>("S07_09_PRODUCT_2_PURCHASE_APPROVED") ?? false) throw 911;
    val buyer = scripts.wallet("treasury");
    val seller = scripts.wallet("deployer");
    val marketplace = MarketplaceV2 { address: env<address>("V3_PRODUCTION_TESTNET_MARKETPLACE_ADDRESS")!! };
    val escrow = env<address>("V3_PRODUCTION_TESTNET_ESCROW_ADDRESS")!!;
    val nftItem = env<address>("S07_09_COMPATIBLE_NFT_ADDRESS")!!;
    val deadline = env<int>("V3_TESTNET_BUY_DEADLINE") ?? 0;
    assert (buyer.address == env<address>("PLATFORM_TREASURY_ADDRESS")!!) throw 912;
    assert (seller.address == env<address>("V3_TESTNET_DEPLOYER_ADDRESS")!!) throw 912;
    assert (deadline > 0 && deadline <= 4294967295) throw 912;
    assert (marketplace.escrowConfiguredV2() && marketplace.escrowV2() == escrow) throw 913;
    assert (marketplace.treasuryConfiguredV2() && marketplace.treasuryV2() == buyer.address) throw 913;
    assert (net.runGetMethod<bool>(marketplace.address, "marketplaceReserveCoordinatorConfiguredV3")) throw 913;
    assert (marketplace.assetProductIdV2(nftItem)!! == 2) throw 914;
    assert (marketplace.productStatusV2(2)!! == 2) throw 914;
    assert (marketplace.orderIdForProductV2(2) == null) throw 914;
    val listing = marketplace.productV2(2)!!;
    assert (listing.seller == seller.address && listing.price == grams("0.01") && listing.escrowId == 1) throw 915;
    val nft = net.runGetMethod<tuple>(nftItem, "get_nft_data");
    assert ((nft.get(3) as address) == escrow) throw 915;
    val queryId = marketplace.nextQueryIdV2() + 10000;
    assert (!net.runGetMethod<bool>(marketplace.address, "paymentQueryUsedV3", [queryId])) throw 916;
    println("S07_09_PRODUCT_2_PREFLIGHT: PASS");
    val result = marketplace.sendBuyProductV2(
        buyer.address, 2, grams("0.01"), queryId, deadline as uint32,
        { bounce: true, value: grams("0.21") },
    );
    result.waitForTrace();
    val orderId = marketplace.orderIdForProductV2(2);
    println("S07_09_PRODUCT_2_PAYMENT_QUERY: {}", queryId);
    println("S07_09_PRODUCT_2_ORDER_ID: {}", orderId);
    if (orderId == null) {
        println("S07_09_PRODUCT_2_PAYMENT_UNCONFIRMED: inspect trace; NEVER automatically repeat.");
        throw 917;
    }
    println("S07_09_PRODUCT_2_PURCHASE_SUBMITTED_ONCE: true");
}
