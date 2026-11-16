import "@acton/env"
import "@acton/io"
import "@acton/emulation/network"
import "@acton/emulation/scripts"
import "@contracts/types"

fun main() {
    assert (env<bool>("V3_TESTNET_FIXTURE_ENABLED") ?? false) throw 901;
    val treasury = scripts.wallet("treasury");
    val seller = scripts.wallet("deployer");
    val nftItem = env<address>("V3_TESTNET_FIXTURE_NFT_ADDRESS")!!;
    val expectedCollection = treasury.address;
    val before = net.runGetMethod<tuple>(nftItem, "get_nft_data");
    assert ((before.get(0) as int) == -1) throw 971;
    assert ((before.get(1) as int) == 3) throw 971;
    assert ((before.get(2) as address) == expectedCollection) throw 971;
    val owner = before.get(3) as address;
    if (owner == seller.address) {
        println("S07_09_RECOVERY: already owned by intended seller");
        return;
    }
    assert (owner == treasury.address) throw 972;
    assert (env<bool>("V3_TESTNET_FIXTURE_OWNER_RECOVERY_APPROVED") ?? false) throw 973;
    val transfer = createMessage({
        bounce: true,
        value: grams("0.2"),
        dest: nftItem,
        body: NftTransfer {
            queryId: 3,
            newOwner: seller.address,
            responseDestination: treasury.address,
            customPayload: null,
            forwardAmount: grams("0"),
            forwardPayload: beginCell().endCell().beginParse(),
        },
    });
    val submitted = net.send(treasury.address, transfer);
    submitted.waitForTrace();
    val after = net.runGetMethod<tuple>(nftItem, "get_nft_data");
    assert ((after.get(3) as address) == seller.address) throw 974;
    println("S07_09_RECOVERY: NFT ownership restored to seller");
    println("S07_09_RECOVERY_NFT: {}", nftItem);
}
