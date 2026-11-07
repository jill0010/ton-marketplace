import "@acton/env"
import "@acton/emulation/scripts"
import "@contracts/types"
import "@wrappers/MarketplaceV2.gen"

fun main() {
    assert (env<bool>("V3_TESTNET_PURCHASE_ENABLED") ?? false) throw 911;
    val buyer = scripts.wallet("treasury");
    val marketplaceAddress = env<address>("V3_PRODUCTION_TESTNET_MARKETPLACE_ADDRESS");
    val nftItem = env<address>("V3_TESTNET_FIXTURE_NFT_ADDRESS");
    val deadline = env<int>("V3_TESTNET_BUY_DEADLINE") ?? 0;
    assert (marketplaceAddress != null && nftItem != null) throw 912;
    assert (deadline > 0 && deadline <= 4294967295) throw 912;
    val marketplace = MarketplaceV2 { address: marketplaceAddress! };
    assert (marketplace.productStatusV2(1)!! == 2) throw 913;
    assert (marketplace.assetProductIdV2(nftItem!!)!! == 1) throw 913;
    assert (marketplace.orderIdForProductV2(1) == null) throw 914;
    val nft = net.runGetMethod<tuple>(nftItem!!, "get_nft_data");
    assert ((nft.get(3) as address) == marketplace.escrowV2()) throw 913;
    val result = marketplace.sendBuyProductV2(
        buyer.address,
        1,
        grams("0.01"),
        8005,
        deadline as uint32,
        { value: grams("0.21") },
    );
    assert (result.waitForFirstTransaction() != null) throw 915;
    println("V3 Testnet purchase submitted once. Product ID: 1; gross: 0.01 TON; reserve: 0.2 TON.");
    println("Buyer: {}", buyer.address);
    println("NFT Item: {}", nftItem!!);
    println("Do not repeat this payment; run read-only delivery and reserve checks.");
}
