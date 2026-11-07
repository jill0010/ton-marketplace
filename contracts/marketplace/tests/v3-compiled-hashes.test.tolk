// Read-only deterministic hash export for an explicitly pinned deployment commit.
// Run this test against the same source revision and Acton toolchain used at deployment.
// This test does not create wallets, send messages, or access a live network.
import "@acton/build"
import "@acton/io"
import "@acton/emulation/testing"
import "@contracts/NFTEscrowV2"
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
}
