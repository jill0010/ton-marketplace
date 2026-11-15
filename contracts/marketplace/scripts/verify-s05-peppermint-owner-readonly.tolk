// S05 read-only ownership gate. No signer, no transfer, no deployment.
import "@acton/env"
import "@acton/io"
import "@acton/emulation/network"

fun main() {
    val nft = env<address>("S05_NFT_ADDRESS");
    val expectedSeller = env<address>("S05_EXPECTED_SELLER");
    val expectedCollection = env<address>("S05_EXPECTED_COLLECTION");
    assert (nft != null && expectedSeller != null && expectedCollection != null) throw 971;
    val data = net.runGetMethod<tuple>(nft!!, "get_nft_data");
    assert (data.size() == 5) throw 972;
    val initialized = (data.get(0) as int) == -1;
    val index = data.get(1) as int;
    val collection = data.get(2) as address;
    val owner = data.get(3) as address;
    println("S05_NFT_INITIALIZED: {}", initialized);
    println("S05_NFT_INDEX: {}", index);
    println("S05_NFT_COLLECTION: {}", collection);
    println("S05_NFT_OWNER: {}", owner);
    println("S05_EXPECTED_SELLER: {}", expectedSeller!!);
    println("S05_EXPECTED_COLLECTION: {}", expectedCollection!!);
    println("S05_COLLECTION_MATCH: {}", collection == expectedCollection!!);
    println("S05_SELLER_MATCH: {}", owner == expectedSeller!!);
    assert (initialized && index == 1) throw 973;
    assert (collection == expectedCollection!!) throw 974;
    assert (owner == expectedSeller!!) throw 975;
    println("S05_OWNER_GATE_PASSED: true");
}
