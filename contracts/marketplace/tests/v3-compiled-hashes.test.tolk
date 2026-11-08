// Read-only deterministic hash export for an explicitly pinned deployment commit.
// Run this test against the same source revision and Acton toolchain used at deployment.
// This test does not create wallets, send messages, or access a live network.
import "@acton/build"
import "@acton/io"
import "@acton/emulation/testing"
import "@contracts/MarketplaceReserveV3"
import "@contracts/MockNFTItemV3"
import "@contracts/NFTEscrowV2"
import "@contracts/NFTEscrowV2Testnet"

import "@contracts/ReserveCoordinatorV3"
import "@contracts/ReserveVaultV3"
import "@contracts/SettlementAttestationVerifierV3"
import "@contracts/TestMarketplaceReserveV3"
import "@contracts/TestReserveCoordinator"

get fun `test output compiled V3 contract hashes (no transactions)`() {
    println(
        "V3 trusted compiled marketplace code hash: {}",
        build("TestMarketplaceReserveV3").hash(),
    );
    println("V3 trusted compiled escrow code hash: {}", build("NFTEscrowV2").hash());
    println(
        "V3 trusted compiled coordinator code hash: {}",
        build("TestReserveCoordinator").hash(),
    );

    println(
        "V3 production trusted compiled marketplace code hash: {}",
        build("MarketplaceReserveV3").hash(),
    );
    println(
        "V3 production trusted compiled escrow Testnet fixture code hash: {}",
        build("NFTEscrowV2Testnet").hash(),
    );
    println(
        "V3 production trusted compiled coordinator code hash: {}",
        build("ReserveCoordinatorV3").hash(),
    );
    println(
        "V3 production trusted compiled reserve vault code hash: {}",
        build("ReserveVaultV3").hash(),
    );
    println(
        "V3 production trusted compiled settlement verifier code hash: {}",
        build("SettlementAttestationVerifierV3").hash(),
    );
    println(
        "V3 Testnet synthetic NFT Item code hash: {}",
        build("MockNFTItemV3").hash(),
    );
}
