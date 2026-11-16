// S07-07: offline compiled code identity only. No wallet, network or transactions.
import "@acton/build"
import "@acton/io"

fun main() {
    println("S07_07_PRODUCTION_ESCROW_CODE_HASH: {}", build("NFTEscrowV2").hash());
    println("S07_07_FIXTURE_ESCROW_CODE_HASH: {}", build("NFTEscrowV2Testnet").hash());
}
