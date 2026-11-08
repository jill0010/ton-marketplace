import "@acton/env"
import "@acton/io"
import "@acton/emulation/network"
import "@acton/emulation/scripts"
import "@contracts/types"
import "@wrappers/MarketplaceV2.gen"

fun main() {
    val deployer = scripts.wallet("deployer");
    val buyer = scripts.wallet("treasury");
    val marketplaceAddress = env<address>("V3_PRODUCTION_TESTNET_MARKETPLACE_ADDRESS");
    val coordinatorAddress = env<address>("V3_PRODUCTION_TESTNET_COORDINATOR_ADDRESS");
    val nftItem = env<address>("V3_TESTNET_FIXTURE_NFT_ADDRESS");
    assert (marketplaceAddress != null && coordinatorAddress != null && nftItem != null) throw 931;
    val marketplace = MarketplaceV2 { address: marketplaceAddress! };
    assert (marketplace.ownerV2() == deployer.address) throw 932;
    // A fresh fixture may be product 2+ after previous deployments.
    // Bind the settlement check to the exact NFT address, never order 1.
    val productId = marketplace.assetProductIdV2(nftItem!!);
    assert (productId != null) throw 933;
    val orderId = marketplace.orderIdForProductV2(productId!!);
    assert (orderId != null) throw 933;
    val orderCell = marketplace.orderCellV2(orderId!!);
    assert (orderCell != null) throw 933;
    val order = MarketplaceV2Order.fromCell(orderCell!!);
    val extra = order.extra.load();
    val parties = extra.parties.load();
    val asset = extra.asset.load();
    val settlement = extra.settlement.load();
    assert (parties.buyer == buyer.address && parties.seller == deployer.address) throw 934;
    assert (parties.treasury == marketplace.treasuryV2()) throw 934;
    assert (asset.nftItem == nftItem!! && asset.itemIndex > 0) throw 934;
    assert (settlement.gross == grams("0.01")) throw 934;
    assert (settlement.processingReserve == grams("0.2")) throw 934;
    assert (settlement.sellerProceeds + settlement.platformFee == settlement.gross) throw 934;
    assert (order.deliveryStatus == 2 && order.status == 5) throw 935;
    assert (order.sellerPayoutStatus == 2 && order.platformPayoutStatus == 2) throw 935;
    val nft = net.runGetMethod<tuple>(nftItem!!, "get_nft_data");
    assert ((nft.get(3) as address) == buyer.address) throw 936;

    val marketplaceReserveStatus = net.runGetMethod<uint8>(
        marketplace.address,
        "marketplaceReserveStatusV3",
        [orderId!!],
    );
    val coordinatorStatus = net.runGetMethod<uint8>(
        coordinatorAddress!!,
        "reserveCoordinatorStatusV3",
        [orderId!!],
    );
    val vault = net.runGetMethod<address?>(
        coordinatorAddress!!,
        "reserveCoordinatorVaultV3",
        [orderId!!],
    )!!;
    val marketplaceVault = net.runGetMethod<address?>(
        marketplace.address,
        "marketplaceReserveVaultV3",
        [orderId!!],
    );
    assert (marketplaceReserveStatus == 2 && coordinatorStatus == 2) throw 937;
    assert (marketplaceVault != null && marketplaceVault!! == vault) throw 937;
    assert (net.runGetMethod<uint8>(vault, "reserveVaultStatusV3") == 3) throw 938;
    assert (net.runGetMethod<coins>(vault, "reserveVaultPrincipalV3") == grams("0.2")) throw 938;
    assert (net.runGetMethod<coins>(vault, "reserveVaultPaidV3") == grams("0.2")) throw 938;
    assert (net.runGetMethod<coins>(vault, "reserveVaultInFlightV3") == 0) throw 938;
    assert (net.runGetMethod<coins>(vault, "reserveVaultAvailableV3") == 0) throw 938;

    println("PRODUCTION V3 TESTNET ON-CHAIN STATE CHECK PASSED; INDEPENDENT TRANSFER FINALITY NOT ATTESTED.");
    println("Verified product ID: {}; order ID: {}", productId!!, orderId!!);
    println("Marketplace V3: {}", marketplace.address);
    println("NFT Escrow V2: {}", marketplace.escrowV2());
    println("Reserve Coordinator V3: {}", coordinatorAddress!!);
    println("Per-order Reserve Vault V3: {}", vault);
    println("Buyer NFT ownership: verified");
    println("Seller/platform payout status: contract reports dispatched; recipient credit requires independent trace verification");
    println("Buyer 0.2 TON reserve: vault reports paid; independent recipient receipt and validator quorum evidence must be audited separately");
    println("Vault status: paid; in-flight: 0; available: 0");
    println("Network: Testnet only. Mainnet remains blocked.");
}
