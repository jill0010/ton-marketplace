// Read-only deterministic address derivation for the official Peppermint Item.
// Must match deploy-testnet-nft-fixture.tolk; never signs or sends a message.
import "@acton/io"
import "@acton/fmt"
import "@acton/env"
import "@acton/emulation/network"

fun main() {
    val code = parseCellFromHex("b5ee9c720101010100230008420291d9e2ac169fc785ce00de0a81af27622b9b7d1764415c775e7e50c03ce98aa2");
    assert (code.hash() == 0x30dcd7d5b6fcf5968c2791e1e31ad732f2672f2986e1d6970eb03cca22d23251) throw 968;
    val collection = env<address>("S05_COLLECTION_ADDRESS");
    assert (collection != null) throw 969;
    val config = beginCell().storeUint(1, 256).storeAddress(collection!).endCell();
    val data = beginCell().storeRef(config).storeUint(0, 1).endCell();
    val stateInit: ContractState = { code: code, data: data };
    val destination = AutoDeployAddress { workchain: 0, stateInit: stateInit };
    println("S05_PEPPERMINT_INDEX_1_ADDRESS: {}", destination.calculateAddress());
    println("S05_READ_ONLY: true");
}
