// S06 Product #7: read-only buyer and custody preflight. No purchase or transfer.
import "@acton/env"
import "@acton/io"
import "@acton/fmt"
import "@acton/emulation/network"
import "@acton/emulation/scripts"
import "@wrappers/MarketplaceV2.gen"

fun main() {
    val buyer = scripts.wallet("deployer");
    assert (buyer.address == parseAddress("0QDQEewIr69mGcq6uDIlAtibxW37gm7rJfKWru7o4_hSPbzu")) throw 601;
    val marketplace = MarketplaceV2 {
        address: parseAddress("kQB9Q03obJYKG84bfXFrpL6OtUcX41z54A3m4LFGf_0a14D_"),
    };
    val nftItem = parseAddress("EQAk73VdUMdm_H9RYLNVfjHaEAfDC-fVm2s4bc_X669XZOin");
    val escrow = parseAddress("kQAp5SqhqBj1LK3q9mHpBDsVzUnMyWBiH-nvtTB7q0vdP0mG");
    assert (marketplace.escrowV2() == escrow) throw 602;
    assert (marketplace.assetProductIdV2(nftItem)!! == 7) throw 603;
    assert (marketplace.productStatusV2(7)!! == 2) throw 604;
    assert (marketplace.orderIdForProductV2(7) == null) throw 605;
    val listing = marketplace.productV2(7);
    assert (listing != null) throw 606;
    assert (listing!!.id == 7 && listing!!.price == grams("0.01")) throw 606;
    assert (listing!!.seller != buyer.address && listing!!.escrowId == 7) throw 606;
    assert (marketplace.treasuryConfiguredV2() && marketplace.escrowConfiguredV2()) throw 607;
    val nft = net.runGetMethod<tuple>(nftItem, "get_nft_data");
    assert ((nft.get(3) as address) == escrow) throw 608;
    println("S06_PRODUCT_7_PREFLIGHT_PASSED: true");
    println("S06_PRODUCT_ID: 7");
    println("S06_BUYER: {}", buyer.address);
    println("S06_NFT_OWNER_ESCROW: {}", escrow);
    println("S06_PRICE: 0.01 TON; processing reserve: 0.2 TON (refund not guaranteed)");
    println("S06_READ_ONLY_NO_BROADCAST: true");
}
