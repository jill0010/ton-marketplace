import "@acton/env"
import "@acton/io"
import "@acton/build"
import "@acton/emulation/scripts"
import "@acton/emulation/network"
import "@wrappers/MarketplaceV2.gen"
import "@wrappers/NFTEscrowV2.gen"
import "list-v3-testnet-mock-nft-fixture"

fun main() {
    assert (env<bool>("V3_TESTNET_FIXTURE_ENABLED") ?? false) throw 901;
    assert (env<bool>("S07_09_EXISTING_LISTING_APPROVED") ?? false) throw 975;
    val deployer = scripts.wallet("deployer");
    val treasury = scripts.wallet("treasury");
    val nftItem = env<address>("V3_TESTNET_FIXTURE_NFT_ADDRESS")!!;
    val marketplaceAddress = env<address>("V3_PRODUCTION_TESTNET_MARKETPLACE_ADDRESS")!!;
    val escrowAddress = env<address>("V3_PRODUCTION_TESTNET_ESCROW_ADDRESS")!!;
    assert (deployer.address == env<address>("V3_TESTNET_DEPLOYER_ADDRESS")!!) throw 976;
    assert (treasury.address == env<address>("PLATFORM_TREASURY_ADDRESS")!!) throw 976;
    assert (deployer.address != treasury.address) throw 976;
    val marketplace = MarketplaceV2 { address: marketplaceAddress };
    val escrow = NFTEscrowV2 { address: escrowAddress };
    assert (marketplace.ownerV2() == deployer.address) throw 977;
    assert (escrow.owner() == deployer.address) throw 977;
    assert (marketplace.escrowConfiguredV2() && marketplace.escrowV2() == escrow.address) throw 977;
    assert (escrow.marketplace() == marketplace.address) throw 977;
    assert (marketplace.treasuryV2() == treasury.address) throw 977;
    assert (marketplace.assetProductIdV2(nftItem) == null) throw 978;
    // Escrow V2 only accepts these immutable Item code hashes; fail before any wallet transaction.
    val fixtureCodeHash = build("MockNFTItemV3").hash();
    println("S07_09_FIXTURE_CODE_HASH: {}", fixtureCodeHash);
    assert (
        fixtureCodeHash == 0x8b711e6809672c0335dc61d1da1dcc4059c973248af707bd586245085ea70b32 ||
        fixtureCodeHash == 0x30dcd7d5b6fcf5968c2791e1e31ad732f2672f2986e1d6970eb03cca22d23251
    ) throw 979;
    listV3TestnetMockNftFixture(
        marketplace,
        escrow,
        deployer.address,
        nftItem,
        treasury.address,
        deployer.address,
        3,
    );
    println("S07_09_EXISTING_NFT_LISTED_AND_CUSTODIED: true");
    println("S07_09_EXISTING_NFT: {}", nftItem);
}
