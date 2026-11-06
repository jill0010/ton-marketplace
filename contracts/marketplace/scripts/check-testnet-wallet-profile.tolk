import "@acton/env"
import "@acton/io"
import "@acton/emulation/scripts"

fun main() {
    val seller = scripts.wallet("seller");
    val expected = env<address>("EXPECTED_SELLER_ADDRESS") ?? seller.address;
    assert (seller.address == expected) throw 401;
    println("Wallet profile address verified: {}", seller.address);
    println("Read-only profile check: no messages sent.");
}
