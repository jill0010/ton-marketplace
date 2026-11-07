import "@acton/env"
import "@acton/emulation/scripts"
import "@contracts/types"
import "@wrappers/MarketplaceV2.gen"

fun main() {
    val deployer = scripts.wallet("deployer");
    val buyer = scripts.wallet("treasury");
    val marketplaceAddress = env<address>("V3_PRODUCTION_TESTNET_MARKETPLACE_ADDRESS");
    val coordinatorAddress = env<address>("V3_PRODUCTION_TESTNET_COORDINATOR_ADDRESS");
    val nftItem = env<address>("V3_TESTNET_FIXTURE_NFT_ADDRESS");
    assert (marketplaceAddress != null && coordinatorAddress != null && nftItem != null) throw 921;
    val marketplace = MarketplaceV2 { address: marketplaceAddress! };
    val orderId = marketplace.orderIdForProductV2(1);
    assert (orderId != null && orderId!! == 1) throw 922;
    val order = MarketplaceV2Order.fromCell(marketplace.orderCellV2(1)!!);
    val extra = order.extra.load();
    val parties = extra.parties.load();
    val asset = extra.asset.load();
    val settlement = extra.settlement.load();
    assert (parties.buyer == buyer.address && parties.seller == deployer.address) throw 923;
    assert (parties.treasury == marketplace.treasuryV2()) throw 923;
    assert (asset.nftItem == nftItem!! && asset.itemIndex > 0) throw 923;
    assert (settlement.gross == grams("0.01")) throw 923;
    assert (settlement.processingReserve == grams("0.2")) throw 923;
    assert (settlement.sellerProceeds + settlement.platformFee == settlement.gross) throw 923;
    assert (order.deliveryStatus == 2 && order.status == 5) throw 924;
    assert (order.sellerPayoutStatus == 2 && order.platformPayoutStatus == 2) throw 924;
    val nft = net.runGetMethod<tuple>(nftItem!!, "get_nft_data");
    assert ((nft.get(3) as address) == buyer.address) throw 925;

    val marketplaceReserveStatus = net.runGetMethod<uint8>(
        marketplace.address,
        "marketplaceReserveStatusV3",
        [1],
    );
    val marketplaceVault = net.runGetMethod<address?>(
        marketplace.address,
        "marketplaceReserveVaultV3",
        [1],
    )!!;
    val coordinatorStatus = net.runGetMethod<uint8>(
        coordinatorAddress!!,
        "reserveCoordinatorStatusV3",
        [1],
    );
    val coordinatorVault = net.runGetMethod<address?>(
        coordinatorAddress!!,
        "reserveCoordinatorVaultV3",
        [1],
    )!!;
    assert (marketplaceReserveStatus == 2 && coordinatorStatus == 2) throw 926;
    assert (marketplaceVault == coordinatorVault) throw 926;
    assert (net.runGetMethod<uint8>(coordinatorVault, "reserveVaultStatusV3") == 2) throw 927;
    assert (net.runGetMethod<coins>(coordinatorVault, "reserveVaultPrincipalV3") == grams("0.2")) throw 927;
    assert (net.runGetMethod<coins>(coordinatorVault, "reserveVaultInFlightV3") == grams("0.2")) throw 927;
    assert (net.runGetMethod<coins>(coordinatorVault, "reserveVaultAvailableV3") == 0) throw 927;

    println("V3_TESTNET_VAULT_ADDRESS: {}", coordinatorVault);
    println("V3 Testnet purchase, NFT buyer ownership, payout dispatch and isolated 0.2 TON reserve verified.");
    println("Reserve is in-flight pending actual buyer receipt attestation; this is not yet final settlement.");
}
