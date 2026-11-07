import "@acton/env"
import "@acton/io"
import "@acton/emulation/scripts"

fun main() {
    val expectedDeployer = env<address>("V3_TESTNET_DEPLOYER_ADDRESS");
    val expectedTreasury = env<address>("PLATFORM_TREASURY_ADDRESS");
    assert (expectedDeployer != null && expectedTreasury != null) throw 941;
    val deployer = scripts.wallet("deployer");
    val treasury = scripts.wallet("treasury");
    assert (deployer.address == expectedDeployer!) throw 942;
    assert (treasury.address == expectedTreasury!) throw 943;
    assert (deployer.address != treasury.address) throw 944;
    println("V3 Testnet deployer and treasury wallet profiles verified.");
    println("Deployer: {}", deployer.address);
    println("Treasury / buyer: {}", treasury.address);
    println("Read-only wallet profile check; no transaction sent.");
}
