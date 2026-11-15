// Read-only reconstruction of the NFT address from failed S05 run 43703734360.
// Never signs or broadcasts a transaction.
import "@acton/build"
import "@acton/env"
import "@acton/io"
import "@acton/emulation/scripts"
import "@acton/emulation/network"

fun main() {
    val itemIndex: uint256 = 43703734360;
    val collection = scripts.wallet("treasury").address;
    val seller = scripts.wallet("deployer").address;
    assert (collection != seller) throw 951;
    val code = build("MockNFTItemV3");
    val config = beginCell().storeUint(itemIndex, 256).storeAddress(collection).endCell();
    val data = beginCell().storeRef(config).storeUint(0, 1).endCell();
    val stateInit: ContractState = { code: code, data: data };
    val destination = AutoDeployAddress { workchain: 0, stateInit };
    println("S05_RECOVERY_NFT_ADDRESS: {}", destination.calculateAddress());
    println("S05_RECOVERY_ITEM_INDEX: {}", itemIndex);
    println("S05_RECOVERY_COLLECTION: {}", collection);
    println("S05_RECOVERY_SELLER: {}", seller);
    println("S05 recovery is read-only; no transaction sent.");
}
