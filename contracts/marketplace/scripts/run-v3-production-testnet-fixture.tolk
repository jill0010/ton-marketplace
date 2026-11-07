import "@acton/env"
import "@acton/emulation/scripts"
import "@contracts/types"
import "@wrappers/MarketplaceV2.gen"
import "@wrappers/NFTEscrowV2.gen"
import "testnet-nft-fixture-deployer"
import "list-testnet-nft-fixture"

fun main() {
    assert (env<bool>("V3_TESTNET_FIXTURE_ENABLED") ?? false) throw 901;
    val deployer = scripts.wallet("deployer");
    val buyer = scripts.wallet("treasury");
    val marketplaceAddress = env<address>("V3_PRODUCTION_TESTNET_MARKETPLACE_ADDRESS");
    val escrowAddress = env<address>("V3_PRODUCTION_TESTNET_ESCROW_ADDRESS");
    val itemIndex = env<uint256>("V3_TESTNET_FIXTURE_ITEM_INDEX") ?? 1000;
    assert (marketplaceAddress != null && escrowAddress != null) throw 902;
    val marketplace = MarketplaceV2 { address: marketplaceAddress! };
    val escrow = NFTEscrowV2 { address: escrowAddress! };
    assert (marketplace.ownerV2() == deployer.address) throw 903;
    assert (escrow.owner() == deployer.address) throw 903;
    assert (marketplace.escrowConfiguredV2() && marketplace.escrowV2() == escrow.address) throw 903;
    assert (escrow.marketplace() == marketplace.address) throw 903;
    assert (marketplace.treasuryV2() == buyer.address) throw 904;
    assert (buyer.address != deployer.address) throw 904;

    // The buyer/treasury wallet funds a fresh synthetic collection fixture;
    // the deployer wallet owns the Item and is the fixture seller.
    val nftItem = deployTestnetNftFixture(buyer.address, deployer.address, itemIndex);
    listTestFixture(
        marketplace,
        escrow,
        deployer.address,
        nftItem,
        buyer.address,
        deployer.address,
        itemIndex,
    );
    println("V3_TESTNET_FIXTURE_NFT_ADDRESS: {}", nftItem);
    println("V3_TESTNET_FIXTURE_COLLECTION_ADDRESS: {}", buyer.address);
    println("V3_TESTNET_FIXTURE_ITEM_INDEX: {}", itemIndex);
    println("V3 production Marketplace V3 and NFT Escrow V2 fixture listing/custody verified.");
}
