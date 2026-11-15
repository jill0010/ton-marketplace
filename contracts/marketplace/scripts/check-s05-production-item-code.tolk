// S05 read-only preflight: compare the existing fixture Item code against
// the immutable production NFTEscrowV2 allowlist. No wallet or transaction.
import "@acton/build"
import "@acton/io"

fun main() {
    val code = build("MockNFTItemV3");
    val hash = code.hash();
    val allowedA: uint256 = 0x8b711e6809672c0335dc61d1da1dcc4059c973248af707bd586245085ea70b32;
    val allowedB: uint256 = 0x30dcd7d5b6fcf5968c2791e1e31ad732f2672f2986e1d6970eb03cca22d23251;
    val trusted = hash == allowedA || hash == allowedB;
    println("S05_FIXTURE_CODE_HASH: {}", hash);
    println("S05_PRODUCTION_ESCROW_CODE_HASH_ALLOWED: {}", trusted);
    println("S05_DIAGNOSTIC_READ_ONLY: true");
    // Exit nonzero if the current fixture cannot possibly pass production Escrow.
    assert (trusted) throw 968;
}
