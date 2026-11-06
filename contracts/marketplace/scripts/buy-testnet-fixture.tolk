import "@acton/env"
import "@acton/emulation/scripts"
import "testnet-fixture-purchase"

fun main() {
    assert (env<bool>("TESTNET_PURCHASE_ENABLED") ?? false) throw 401;
    val buyer = scripts.wallet("deployer");
    assert (buyer.address == testBuyer()) throw 401;
    buyTestFixture(
        testMarketplace(),
        buyer.address,
        testNftItem(),
        env<uint32>("TESTNET_BUY_DEADLINE") ?? 0,
    );
}
