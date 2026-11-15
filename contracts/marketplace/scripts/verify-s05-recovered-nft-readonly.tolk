// Read-only S05 recovery. Verify the existing NFT's TEP-62 owner and marketplace state.
// Never signs or broadcasts a transaction.
import "@acton/env"
import "@acton/io"
import "@acton/emulation/network"
import "@acton/emulation/scripts"
import "@wrappers/MarketplaceV2.gen"
import "@wrappers/NFTEscrowV2.gen"

fun main() {
    val nft = env<address>("S05_RECOVERY_NFT_ADDRESS");
    val marketplaceAddress = env<address>("V3_PRODUCTION_TESTNET_MARKETPLACE_ADDRESS");
    val escrowAddress = env<address>("V3_PRODUCTION_TESTNET_ESCROW_ADDRESS");
    assert (nft != null && marketplaceAddress != null && escrowAddress != null) throw 971;
    val seller = scripts.wallet("deployer").address;
    val collection = scripts.wallet("treasury").address;
    val marketplace = MarketplaceV2 { address: marketplaceAddress! };
    val escrow = NFTEscrowV2 { address: escrowAddress! };
    assert (marketplace.escrowV2() == escrow.address && escrow.marketplace() == marketplace.address) throw 972;
    val item = net.runGetMethod<tuple>(nft!!, "get_nft_data");
    assert (item.size() == 5) throw 973;
    assert ((item.get(0) as int) == -1) throw 973;
    assert ((item.get(1) as int) == 43703734360) throw 973;
    assert ((item.get(2) as address) == collection) throw 973;
    val owner = item.get(3) as address;
    assert (owner == seller || owner == escrow.address) throw 974;
    val productId = marketplace.assetProductIdV2(nft!!);
    println("S05 NFT: {}", nft!!);
    println("S05 NFT owner: {}", owner);
    println("S05 expected seller: {}", seller);
    println("S05 production Escrow: {}", escrow.address);
    println("S05 indexed product: {}", productId);
    println("S05 NFT owner and marketplace bindings verified (read only).");
}
