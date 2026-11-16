import "@acton/env"
import "@acton/io"
import "@acton/build"
import "@acton/emulation/network"
import "@contracts/types"
import "@wrappers/MarketplaceV2.gen"
import "@wrappers/NFTEscrowV2.gen"

fun main() {
    val nft = env<address>("S07_04_RECOVERED_NFT_ADDRESS")!!;
    val escrowAddress = env<address>("V3_PRODUCTION_TESTNET_ESCROW_ADDRESS")!!;
    val marketAddress = env<address>("V3_PRODUCTION_TESTNET_MARKETPLACE_ADDRESS")!!;
    val collection = env<address>("PLATFORM_TREASURY_ADDRESS")!!;
    val index: uint256 = 43819564334;
    val itemCode = build("MockNFTItemV3");
    val codeHash = itemCode.hash();
    val whitelisted =
        codeHash == 0x8b711e6809672c0335dc61d1da1dcc4059c973248af707bd586245085ea70b32 ||
        codeHash == 0x30dcd7d5b6fcf5968c2791e1e31ad732f2672f2986e1d6970eb03cca22d23251;
    val config = beginCell().storeUint(index, 256).storeAddress(collection).endCell();
    val itemData = beginCell().storeRef(config).storeUint(0, 1).endCell();
    val stateInit: ContractState = { code: itemCode, data: itemData };
    val predicted = AutoDeployAddress { workchain: 0, stateInit }.calculateAddress();
    val nftData = net.runGetMethod<tuple>(nft, "get_nft_data");
    val actualIndex = nftData.get(1) as int;
    val actualCollection = nftData.get(2) as address;
    val actualOwner = nftData.get(3) as address;
    val escrow = NFTEscrowV2 { address: escrowAddress };
    val market = MarketplaceV2 { address: marketAddress };
    println("S07_04_LOCAL_MOCK_CODE_HASH: {}", codeHash);
    println("S07_04_CODE_HASH_IN_ESCROW_ALLOWLIST: {}", whitelisted);
    println("S07_04_EXPECTED_ITEM_ADDRESS: {}", predicted);
    println("S07_04_ACTUAL_ITEM_ADDRESS: {}", nft);
    println("S07_04_ITEM_ADDRESS_MATCH: {}", predicted == nft);
    println("S07_04_COLLECTION_MATCH: {}", actualCollection == collection);
    println("S07_04_INDEX_MATCH: {}", actualIndex == index as int);
    println("S07_04_NFT_OWNER: {}", actualOwner);
    println("S07_04_MARKET_ASSET_PRODUCT: {}", market.assetProductIdV2(nft));
    println("S07_04_ESCROW_ASSET_RECORD: {}", escrow.assetEscrowIdV2(nft));
    println("S07_04_ESCROW_MARKETPLACE_MATCH: {}", escrow.marketplace() == market.address);
    println("S07_04_READ_ONLY: true");
    assert (nftData.get(0) as int == -1) throw 976;
    assert (actualCollection == collection && actualIndex == index as int) throw 976;
}
