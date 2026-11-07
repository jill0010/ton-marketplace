import "@acton/env"
import "@acton/io"
import "@acton/emulation/network"
import "@acton/emulation/scripts"
import "@contracts/types"
import "@wrappers/MarketplaceV2.gen"

fun main() {
    assert (env<bool>("V3_TESTNET_PURCHASE_ENABLED") ?? false) throw 911;
    val buyer = scripts.wallet("treasury");
    val marketplaceAddress = env<address>("V3_PRODUCTION_TESTNET_MARKETPLACE_ADDRESS");
    val nftItem = env<address>("V3_TESTNET_FIXTURE_NFT_ADDRESS");
    val deadline = env<int>("V3_TESTNET_BUY_DEADLINE") ?? 0;
    assert (marketplaceAddress != null && nftItem != null) throw 912;
    assert (deadline > 0 && deadline <= 4294967295) throw 912;
    val marketplace = MarketplaceV2 { address: marketplaceAddress! };
    // Product IDs are monotonic and may not be 1 after previous failed
    // fixture runs. Resolve the exact listing by its unique NFT Item address.
    val productIdResult = marketplace.assetProductIdV2(nftItem!!);
    assert (productIdResult != null) throw 913;
    val productId = productIdResult!!;
    val productStatus = marketplace.productStatusV2(productId);
    assert (productStatus != null && productStatus!! == 2) throw 913;
    assert (marketplace.orderIdForProductV2(productId) == null) throw 914;
    // Prevent expensive or non-bouncing invalid purchases before wallet submission.
    val listing = marketplace.productV2(productId);
    assert (listing != null) throw 915;
    assert (listing!!.id == productId && listing!!.price == grams("0.01")) throw 915;
    assert (listing!!.seller != buyer.address && listing!!.escrowId > 0) throw 915;
    assert (marketplace.treasuryConfiguredV2() && marketplace.escrowConfiguredV2()) throw 915;
    assert (net.runGetMethod<bool>(marketplace.address, "marketplaceReserveCoordinatorConfiguredV3")) throw 915;
    // Use a per-deployment monotonic payment query ID instead of reusing 8005.
    // The existing Marketplace address may retain state across repeated Testnet runs.
    val paymentQueryId = marketplace.nextQueryIdV2() + 10000;
    assert (paymentQueryId > marketplace.nextQueryIdV2() + 3) throw 915;
    assert (!net.runGetMethod<bool>(marketplace.address, "paymentQueryUsedV3", [paymentQueryId])) throw 915;
    val nft = net.runGetMethod<tuple>(nftItem!!, "get_nft_data");
    assert ((nft.get(3) as address) == marketplace.escrowV2()) throw 913;
    val result = marketplace.sendBuyProductV2(
        buyer.address,
        productId,
        grams("0.01"),
        paymentQueryId,
        deadline as uint32,
        { bounce: BounceMode.RichBounce, value: grams("0.21") },
    );
    // Wait for the complete wallet -> Marketplace -> reserve/escrow trace.
    // Waiting only for the buyer wallet transaction can let the following
    // read-only verifier run before the order has been persisted.
    result.waitForTrace();
    // A completed trace can contain an aborted Marketplace transaction. Never
    // claim success until the on-chain product->order index is persisted.
    val persistedOrderId = marketplace.orderIdForProductV2(productId);
    println("V3 Testnet payment query ID: {}", paymentQueryId);
    println("V3 Testnet post-purchase persisted order ID: {}", persistedOrderId);
    if (persistedOrderId == null) {
        println("V3_TESTNET_PURCHASE_REJECTED: Full trace completed but Marketplace did not create an order. Do not pay again; inspect the trace.");
        throw 916;
    }
    println("V3 Testnet purchase submitted once. Full trace settled. Product ID: {}; gross: 0.01 TON; reserve: 0.2 TON.", productId);
    println("Buyer: {}", buyer.address);
    println("NFT Item: {}", nftItem!!);
    println("Do not repeat this payment; run read-only delivery and reserve checks.");
}
