// S05 existing Peppermint Item #1 only. No deployment, purchase or mainnet.
import "@acton/env"
import "@acton/io"
import "@acton/fmt"
import "@acton/emulation/scripts"
import "@wrappers/MarketplaceV2.gen"
import "@wrappers/NFTEscrowV2.gen"
import "list-testnet-nft-fixture"

fun main() {
    assert (env<bool>("S05_PEPPERMINT_LISTING_APPROVED") ?? false) throw 981;
    val seller = scripts.wallet("seller");
    val administrator = scripts.wallet("deployer");
    val marketplace = MarketplaceV2 {
        address: parseAddress("kQB9Q03obJYKG84bfXFrpL6OtUcX41z54A3m4LFGf_0a14D_"),
    };
    val escrow = NFTEscrowV2 {
        address: parseAddress("kQAp5SqhqBj1LK3q9mHpBDsVzUnMyWBiH-nvtTB7q0vdP0mG"),
    };
    assert (seller.address == parseAddress("0QASRB4XGtN81Pwaef6fWnSJyRwwJEvbbPn-ksz0KQI-bFa0")) throw 982;
    assert (administrator.address == parseAddress("0QDQEewIr69mGcq6uDIlAtibxW37gm7rJfKWru7o4_hSPbzu")) throw 982;
    listTestFixture(
        marketplace,
        escrow,
        seller.address,
        parseAddress("EQAk73VdUMdm_H9RYLNVfjHaEAfDC-fVm2s4bc_X669XZOin"),
        parseAddress("EQABD-C8AWc8PnlrsZYg-aDWrB3MhsB0etXI91KO6lZs3KO4"),
        administrator.address,
        1,
    );
    println("S05_PEPPERMINT_LISTING_ATTEMPT_COMPLETED: true");
}
