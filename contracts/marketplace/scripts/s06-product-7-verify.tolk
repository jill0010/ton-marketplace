// S06 Product #7 read-only delivery and settlement verification.
import "@acton/io"
import "@acton/fmt"
import "@acton/emulation/network"
import "@contracts/types"
import "@wrappers/MarketplaceV2.gen"

fun main() {
    val marketplace = MarketplaceV2 {
        address: parseAddress("kQB9Q03obJYKG84bfXFrpL6OtUcX41z54A3m4LFGf_0a14D_"),
    };
    val buyer = parseAddress("0QDQEewIr69mGcq6uDIlAtibxW37gm7rJfKWru7o4_hSPbzu");
    val item = parseAddress("EQAk73VdUMdm_H9RYLNVfjHaEAfDC-fVm2s4bc_X669XZOin");
    val orderId = marketplace.orderIdForProductV2(7);
    assert (orderId != null) throw 641;
    val snapshot = marketplace.orderCellV2(orderId!!);
    assert (snapshot != null) throw 642;
    val order = MarketplaceV2Order.fromCell(snapshot!!);
    val extra = order.extra.load();
    val parties = extra.parties.load();
    val asset = extra.asset.load();
    val settlement = extra.settlement.load();
    assert (order.productId == 7 && order.id == orderId!!) throw 643;
    assert (parties.buyer == buyer && asset.nftItem == item) throw 644;
    assert (settlement.gross == grams("0.01")) throw 645;
    assert (settlement.processingReserve == grams("0.2")) throw 645;
    assert (settlement.sellerProceeds + settlement.platformFee == settlement.gross) throw 645;
    assert (order.deliveryStatus == 2 && order.status == 5) throw 646;
    assert (order.sellerPayoutStatus == 2 && order.platformPayoutStatus == 2) throw 647;
    val nft = net.runGetMethod<tuple>(item, "get_nft_data");
    assert ((nft.get(3) as address) == buyer) throw 648;
    println("S06_PRODUCT_7_DELIVERY_VERIFIED: true");
    println("S06_ORDER_ID: {}", orderId!!);
    println("S06_SELLER_PAYOUT_DISPATCHED_NANOTON: {}", settlement.sellerProceeds);
    println("S06_PLATFORM_PAYOUT_DISPATCHED_NANOTON: {}", settlement.platformFee);
    println("S06_PAYOUT_RECEIPTS_NOT_YET_INDEPENDENTLY_VERIFIED: true");
    println("S06_RESERVE_0_2_TON_REFUND_NOT_GUARANTEED: true");
    println("S06_READ_ONLY_NO_BROADCAST: true");
}
