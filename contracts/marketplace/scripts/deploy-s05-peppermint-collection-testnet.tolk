// S05 testnet-only: deploy a fresh collection, then mint a synthetic Peppermint item.
// Never use on mainnet. Supply the audited Peppermint library-reference item BOC.
// Do not reuse the legacy wallet-as-collection NFT.
import "@acton/build"
import "@acton/env"
import "@acton/fmt"
import "@acton/io"
import "@acton/emulation/network"
import "@acton/emulation/scripts"
import "@contracts/S05PeppermintCollection"
import "@contracts/types"

fun main() {
    assert (env<bool>("S05_COLLECTION_TESTNET_APPROVED") ?? false) throw 821;
    val expected = env<address>("S05_TESTNET_DEPLOYER_ADDRESS");
    assert (expected != null) throw 821;
    val deployer = scripts.wallet("deployer");
    assert (deployer.address == expected!) throw 821;
    val seller = env<address>("S05_TESTNET_SELLER_ADDRESS");
    assert (seller != null && seller! != deployer.address) throw 822;
    val itemBoc = env<string>("S05_PEPPERMINT_ITEM_CODE_BOC_HEX");
    assert (itemBoc != null) throw 823;
    val itemCode = parseCellFromHex(itemBoc!);
    assert (
        itemCode.hash() ==
        0x30dcd7d5b6fcf5968c2791e1e31ad732f2672f2986e1d6970eb03cca22d23251
    ) throw 824;

    val state: ContractState = {
        code: build("S05PeppermintCollection"),
        data: S05PeppermintCollectionStorage {
            owner: deployer.address,
            itemIndex: 1,
            itemCode,
            minted: false,
        }.toCell(),
    };
    val collectionDest = AutoDeployAddress { workchain: 0, stateInit: state };
    val collection = collectionDest.calculateAddress();
    assert (collection != deployer.address) throw 825;
    val collectionDeploy = net.send(deployer.address, createMessage({
        bounce: false,
        value: grams("2.5"),
        dest: collectionDest,
    }));
    assert (collectionDeploy.waitForFirstTransaction() != null) throw 826;

    val tokenInfo = beginCell().storeUint(1, 8).storeUint(65, 8).storeUint(1, 8).storeUint(66, 8).endCell();
    val nftContent = beginCell().storeUint(1, 8).storeUint(120, 8).endCell();
    val auctionConfig = beginCell()
        .storeAddress(deployer.address).storeCoins(grams("1")).storeCoins(grams("1"))
        .storeUint(1, 8).storeUint(60, 32).storeUint(3600, 32).endCell();
    val royaltyParams = beginCell()
        .storeUint(0, 16).storeUint(100, 16).storeAddress(deployer.address).endCell();
    val itemInitBody = beginCell()
        .storeUint(0x299a3e15, 32).storeAddress(seller!)
        .storeCoins(grams("1")).storeRef(tokenInfo).storeRef(nftContent)
        .storeRef(auctionConfig).storeRef(royaltyParams).endCell();
    val mintBody = beginCell()
        .storeUint(0x53050001, 32).storeUint(1, 64).storeRef(itemInitBody).endCell();
    val mint = net.send(deployer.address, createMessage({
        bounce: true,
        value: grams("1.7"),
        dest: collection,
        body: mintBody,
    }));
    assert (mint.waitForFirstTransaction() != null) throw 827;

    val itemConfig = beginCell().storeUint(1, 256).storeAddress(collection).endCell();
    val itemData = beginCell().storeRef(itemConfig).storeUint(0, 1).endCell();
    val itemState: ContractState = { code: itemCode, data: itemData };
    val itemDest = AutoDeployAddress { workchain: 0, stateInit: itemState };
    val item = itemDest.calculateAddress();
    val nft = net.runGetMethod<tuple>(item, "get_nft_data");
    assert (nft.size() == 5) throw 828;
    assert ((nft.get(0) as int) == -1) throw 828;
    assert ((nft.get(1) as int) == 1) throw 828;
    assert ((nft.get(2) as address) == collection) throw 828;
    assert ((nft.get(3) as address) == seller!) throw 828;
    println("S05_COLLECTION_ADDRESS: {}", collection);
    println("S05_NFT_ITEM_ADDRESS: {}", item);
    println("S05_SELLER_ADDRESS: {}", seller!);
    println("S05_SYNTHETIC_TESTNET_FIXTURE_ONLY: true");
}
