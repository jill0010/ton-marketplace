// S06 one-time TESTNET purchase for already escrowed Product #7.
// Never rerun after a timeout: inspect the on-chain product/order index first.
import "@acton/env"
import "@acton/io"
import "@acton/fmt"
import "@acton/emulation/network"
import "@acton/emulation/scripts"
import "@wrappers/MarketplaceV2.gen"

fun main() {
    assert (env<bool>("S06_TESTNET_PRODUCT_7_PURCHASE_ENABLED") ?? false) throw 621;
    val buyer = scripts.wallet("deployer");
    assert (buyer.address == parseAddress("0QDQEewIr69mGcq6uDIlAtibxW37gm7rJfKWru7o4_hSPbzu")) throw 622;
    val deadline = env<int>("S06_TESTNET_PURCHASE_DEADLINE") ?? 0;
    assert (deadline > 0 && deadline <= 4294967295) throw 623;

    val marketplace = MarketplaceV2 {
        address: parseAddress("kQB9Q03obJYKG84bfXFrpL6OtUcX41z54A3m4LFGf_0a14D_"),
    };
    val item = parseAddress("EQAk73VdUMdm_H9RYLNVfjHaEAfDC-fVm2s4bc_X669XZOin");
    val escrow = parseAddress("kQAp5SqhqBj1LK3q9mHpBDsVzUnMyWBiH-nvtTB7q0vdP0mG");

    // On-chain preconditions must be checked immediately before broadcasting.
    assert (marketplace.escrowV2() == escrow) throw 624;
    assert (marketplace.assetProductIdV2(item)!! == 7) throw 625;
    assert (marketplace.productStatusV2(7)!! == 2) throw 626;
    assert (marketplace.orderIdForProductV2(7) == null) throw 627;
    val listing = marketplace.productV2(7);
    assert (listing != null) throw 628;
    assert (listing!!.id == 7 && listing!!.price == grams("0.01")) throw 628;
    assert (listing!!.escrowId == 7 && listing!!.seller != buyer.address) throw 628;
    assert (marketplace.treasuryConfiguredV2() && marketplace.escrowConfiguredV2()) throw 629;
    val nft = net.runGetMethod<tuple>(item, "get_nft_data");
    assert ((nft.get(3) as address) == escrow) throw 630;

    val lastQueryId = marketplace.nextQueryIdV2();
    val paymentQueryId = lastQueryId + 10000;
    assert (paymentQueryId > lastQueryId + 3) throw 631;

    println("S06_BROADCAST_START: product 7; buyer {}; query {}; total 0.21 test TON", buyer.address, paymentQueryId);
    // Exactly one wallet submission; never automatically retry a transaction.
    val result = marketplace.sendBuyProductV2(
        buyer.address,
        7,
        grams("0.01"),
        paymentQueryId,
        deadline as uint32,
        { bounce: true, value: grams("0.21") },
    );
    result.waitForTrace();
    val orderId = marketplace.orderIdForProductV2(7);
    println("S06_POST_PURCHASE_ORDER_ID: {}", orderId);
    if (orderId == null) {
        println("S06_UNCONFIRMED_STOP: Do not rerun payment. Inspect Marketplace and buyer wallet transactions.");
        throw 632;
    }
    println("S06_PRODUCT_7_PURCHASE_CONFIRMED: true");
    println("S06_NO_REPEAT_PURCHASE: true");
}
