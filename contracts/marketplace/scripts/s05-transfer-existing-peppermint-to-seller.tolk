// S05 single existing Peppermint NFT: deployer -> seller on TON TESTNET only.
// No deployment, listing, purchase or mainnet operations.
import "@acton/env"
import "@acton/fmt"
import "@acton/io"
import "@acton/emulation/network"
import "@acton/emulation/scripts"
import "@contracts/types"

fun main() {
    assert (env<bool>("S05_CONFIRM_OWNER_TRANSFER") ?? false) throw 981;
    val deployer = scripts.wallet("deployer");
    val nft = parseAddress("kQCq13VYJqQ0Oov-a2-MKE57MWIuEtiQaoF_lYNCAEnAofhm");
    val seller = parseAddress("kQASRB4XGtN81Pwaef6fWnSJyRwwJEvbbPn-ksz0KQI-bAtx");
    val collection = parseAddress("kQDQEewIr69mGcq6uDIlAtibxW37gm7rJfKWru7o4_hSPeEr");
    assert (deployer.address == collection) throw 982;
    val before = net.runGetMethod<tuple>(nft, "get_nft_data");
    assert (before.size() == 5) throw 983;
    assert ((before.get(0) as int) == -1) throw 983;
    assert ((before.get(1) as int) == 1) throw 983;
    assert ((before.get(2) as address) == collection) throw 983;
    val owner = before.get(3) as address;
    if (owner == seller) {
        println("S05_TRANSFER_ALREADY_COMPLETE: true");
        println("S05_SELLER_OWNS_NFT: true");
        return;
    }
    assert (owner == deployer.address) throw 984;
    // S05 safety stop: the actual Peppermint fixture with collection == owner
    // reproducibly aborts standard NFT transfer with VM exit 213.
    // Never spend testnet funds retrying this known-bad state.
    assert (collection != owner) throw 987;
    val body = NftTransfer {
        queryId: 50501,
        newOwner: seller,
        responseDestination: deployer.address,
        customPayload: null,
        forwardAmount: grams("0.01"),
        forwardPayload: beginCell().endCell().beginParse(),
    };
    val message = createMessage({
        bounce: true,
        value: grams("0.1"),
        dest: nft,
        body: body,
    });
    val sent = net.send(deployer.address, message);
    assert (sent.waitForFirstTransaction() != null) throw 985;
    val after = net.runGetMethod<tuple>(nft, "get_nft_data");
    println("S05_NFT_OWNER_AFTER: {}", after.get(3) as address);
    assert ((after.get(3) as address) == seller) throw 986;
    println("S05_SELLER_OWNS_NFT: true");
    println("S05_NEXT_ACTION: V3 production escrow listing verification");
}
