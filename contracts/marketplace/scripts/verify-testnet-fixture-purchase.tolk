import "testnet-fixture-purchase"

fun main() {
    verifyTestFixture(testMarketplace(), testBuyer(), testSeller(), testNftItem());
}
