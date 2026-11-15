// S05: list the already-deployed NFT from run 43703734360.
// No NFT deployment, purchase, reserve or settlement.
import "@acton/env"
import "@acton/io"
import "@acton/emulation/scripts"
import "@acton/emulation/network"
import "@wrappers/MarketplaceV2.gen"
import "@wrappers/NFTEscrowV2.gen"
import "list-v3-testnet-mock-nft-fixture"

fun main() {
    assert (env<bool>("S05_RECOVER_EXISTING_NFT_APPROVED") ?? false) throw 981;
    val nft = env<address>("S05_RECOVERY_NFT_ADDRESS");
    val marketAddress = env<address>("V3_PRODUCTION_TESTNET_MARKETPLACE_ADDRESS");
    val escrowAddress = env<address>("V3_PRODUCTION_TESTNET_ESCROW_ADDRESS");
    assert (nft != null && marketAddress != null && escrowAddress != null) throw 982;
    val deployer = scripts.wallet("deployer");
    val treasury = scripts.wallet("treasury");
    val marketplace = MarketplaceV2 { address: marketAddress! };
    val escrow = NFTEscrowV2 { address: escrowAddress! };
    assert (marketplace.ownerV2() == deployer.address) throw 983;
    assert (escrow.owner() == deployer.address) throw 983;
    assert (marketplace.escrowV2() == escrow.address) throw 983;
    assert (escrow.marketplace() == marketplace.address) throw 983;
    assert (marketplace.assetProductIdV2(nft!!) == null) throw 984;
    val data = net.runGetMethod<tuple>(nft!!, "get_nft_data");
    assert (data.size() == 5) throw 985;
    assert ((data.get(0) as int) == -1) throw 985;
    assert ((data.get(1) as int) == 43703734360) throw 985;
    assert ((data.get(2) as address) == treasury.address) throw 985;
    assert ((data.get(3) as address) == deployer.address) throw 985;
    println("S05 existing NFT verified: {}", nft!!);
    listV3TestnetMockNftFixture(
        marketplace, escrow, deployer.address, nft!!, treasury.address,
        deployer.address, 43703734360,
    );
    println("S05_RECOVERED_NFT_CUSTODY_VERIFIED: {}", nft!!);
    println("No new NFT was deployed; no purchase or settlement was executed.");
}
