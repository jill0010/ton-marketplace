import "@acton/build"
import "@acton/env"
import "@acton/io"
import "@contracts/MockNFTItemV3"

fun main() {
    // Only derives the deterministic address. This script never sends any message.
    val collection = env<address>("PLATFORM_TREASURY_ADDRESS");
    val itemIndex = env<int>("V3_TESTNET_FIXTURE_ITEM_INDEX");
    assert (collection != null && itemIndex != null) throw 971;
    val code = build("MockNFTItemV3");
    val config = beginCell()
        .storeUint(itemIndex!! as uint256, 256)
        .storeAddress(collection!!)
        .endCell();
    val data = beginCell().storeRef(config).storeUint(0, 1).endCell();
    val stateInit: ContractState = { code: code, data: data };
    val destination = AutoDeployAddress { workchain: 0, stateInit };
    println("S07_04_RECOVERY_NFT_ADDRESS: {}", destination.calculateAddress());
    println("S07_04_RECOVERY_ITEM_INDEX: {}", itemIndex!!);
    println("S07_04_RECOVERY_CODE_HASH: {}", code.hash());
    println("S07_04_NO_TRANSACTION_SENT: true");
}
