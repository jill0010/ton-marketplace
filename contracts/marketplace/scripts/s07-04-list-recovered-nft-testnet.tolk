import "@acton/env"
import "@acton/io"
import "@acton/emulation/scripts"
import "@acton/emulation/network"
import "@contracts/types"
import "@wrappers/MarketplaceV2.gen"
import "@wrappers/NFTEscrowV2.gen"
import "list-v3-testnet-mock-nft-fixture"

fun main() {
    assert (env<bool>("S07_04_CONFIRM_RECOVERED_NFT_LISTING") ?? false) throw 981;
    val nftItem = env<address>("S07_04_RECOVERED_NFT_ADDRESS");
    val marketAddress = env<address>("V3_PRODUCTION_TESTNET_MARKETPLACE_ADDRESS");
    val escrowAddress = env<address>("V3_PRODUCTION_TESTNET_ESCROW_ADDRESS");
    val collection = env<address>("PLATFORM_TREASURY_ADDRESS");
    assert (nftItem != null && marketAddress != null && escrowAddress != null && collection != null) throw 982;
    val seller = scripts.wallet("deployer");
    val buyer = scripts.wallet("treasury");
    assert (buyer.address == collection!!) throw 983;
    val market = MarketplaceV2 { address: marketAddress! };
    val escrow = NFTEscrowV2 { address: escrowAddress! };
    assert (market.ownerV2() == seller.address && escrow.owner() == seller.address) throw 983;
    assert (market.escrowConfiguredV2() && market.escrowV2() == escrow.address) throw 983;
    assert (escrow.marketplace() == market.address) throw 983;
    val before = net.runGetMethod<tuple>(nftItem!!, "get_nft_data");
    assert ((before.get(0) as int) == -1) throw 984;
    assert ((before.get(1) as int) == 43819564334) throw 984;
    assert ((before.get(2) as address) == collection!!) throw 984;
    assert ((before.get(3) as address) == seller.address) throw 984;
    assert (market.assetProductIdV2(nftItem!!) == null) throw 985;
    println("S07_04_RECOVERED_NFT: {}", nftItem!!);
    println("S07_04_LISTING_START: exact existing testnet NFT, no mint and no purchase");
    listV3TestnetMockNftFixture(
        market, escrow, seller.address, nftItem!!, collection!!, seller.address, 43819564334,
    );
    println("S07_04_LISTING_COMPLETE: true");
}
