import "@acton/env"
import "@acton/fmt"
import "@acton/io"
import "@acton/emulation/network"
import "@contracts/types"
import "@wrappers/MarketplaceV2.gen"

fun buyTestFixture(marketplace: MarketplaceV2, buyer: address, nftItem: address, deadline: uint32) {
    assert (marketplace.productStatusV2(1)!! == 2) throw 401;
    assert (marketplace.assetProductIdV2(nftItem)!! == 1) throw 401;
    assert (marketplace.orderIdForProductV2(1) == null) throw 402;
    val nft = net.runGetMethod<tuple>(nftItem, "get_nft_data");
    assert ((nft.get(3) as address) == marketplace.escrowV2()) throw 401;
    val result = marketplace.sendBuyProductV2(
        buyer,
        1,
        grams("0.01"),
        8005,
        deadline,
        { value: grams("0.21") },
    );
    assert (result.waitForFirstTransaction() != null) throw 403;
    println("Test purchase submitted once. Product ID: 1; attached: 0.21 TON.");
    println("Run the read-only delivery check; do not blindly repeat payment.");
}

fun verifyTestFixture(
    marketplace: MarketplaceV2,
    buyer: address,
    seller: address,
    nftItem: address,
) {
    val orderId = marketplace.orderIdForProductV2(1);
    assert (orderId != null) throw 410;
    val snapshot = marketplace.orderCellV2(orderId!!);
    assert (snapshot != null) throw 410;
    val order = MarketplaceV2Order.fromCell(snapshot!!);
    val extra = order.extra.load();
    val parties = extra.parties.load();
    val asset = extra.asset.load();
    val settlement = extra.settlement.load();
    assert (order.id == orderId!! && order.productId == 1) throw 411;
    assert (parties.buyer == buyer && parties.seller == seller) throw 411;
    assert (parties.treasury == marketplace.treasuryV2()) throw 411;
    assert (asset.nftItem == nftItem && asset.itemIndex == 1) throw 411;
    assert (settlement.gross == grams("0.01")) throw 411;
    assert (settlement.processingReserve == grams("0.2")) throw 411;
    assert (settlement.sellerProceeds + settlement.platformFee == settlement.gross) throw 411;
    assert (order.deliveryStatus == 2 && order.status == 5) throw 412;
    assert (order.sellerPayoutStatus == 2 && order.platformPayoutStatus == 2) throw 412;
    val nft = net.runGetMethod<tuple>(nftItem, "get_nft_data");
    assert ((nft.get(3) as address) == buyer) throw 413;
    println("Test purchase delivery verified. Order ID: {}", order.id);
    println("NFT buyer ownership verified: {}", nftItem);
    println("Seller payout dispatched (nanoTON): {}", settlement.sellerProceeds);
    println("Platform payout dispatched (nanoTON): {}", settlement.platformFee);
    println("Payout receipt traces still require independent verification.");
    println("Processing reserve 0.2 TON remains unrefunded; no reserve refund is implemented here.");
}

fun testMarketplace(): MarketplaceV2 {
    return MarketplaceV2 {
        address: parseAddress("kQCvvuBddeebgdI08jUkTGzfulLRg2B8hqXWZrlHigKUsdNZ"),
    };
}

fun testBuyer(): address {
    return parseAddress("kQDQEewIr69mGcq6uDIlAtibxW37gm7rJfKWru7o4_hSPeEr");
}

fun testSeller(): address {
    return parseAddress("kQASRB4XGtN81Pwaef6fWnSJyRwwJEvbbPn-ksz0KQI-bAtx");
}

fun testNftItem(): address {
    return parseAddress("kQCq13VYJqQ0Oov-a2-MKE57MWIuEtiQaoF_lYNCAEnAofhm");
}
