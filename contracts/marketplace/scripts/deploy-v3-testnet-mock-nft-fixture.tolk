import "@acton/build"
import "@acton/emulation/network"
import "@acton/io"
import "@contracts/MockNFTItemV3"

fun deployV3TestnetMockNftFixture(collection: address, seller: address, itemIndex: uint256): address {
    assert (collection != seller) throw 951;
    val code = build("MockNFTItemV3");
    val config = beginCell().storeUint(itemIndex, 256).storeAddress(collection).endCell();
    val data = beginCell().storeRef(config).storeUint(0, 1).endCell();
    val stateInit: ContractState = { code, data };
    val destination = AutoDeployAddress { workchain: 0, stateInit };
    val nftItem = destination.calculateAddress();

    val tokenInfo = beginCell()
        .storeUint(1, 8)
        .storeUint(65, 8)
        .storeUint(1, 8)
        .storeUint(66, 8)
        .endCell();
    val nftContent = beginCell().storeUint(1, 8).storeUint(120, 8).endCell();
    val auctionConfig = beginCell()
        .storeAddress(collection)
        .storeCoins(grams("1"))
        .storeCoins(grams("1"))
        .storeUint(1, 8)
        .storeUint(60, 32)
        .storeUint(3600, 32)
        .endCell();
    val royaltyParams = beginCell()
        .storeUint(0, 16)
        .storeUint(100, 16)
        .storeAddress(collection)
        .endCell();

    val deployBody = DeployMockNFTItemV3 {
        owner: seller,
        amount: grams("1"),
        tokenInfo,
        content: nftContent,
        auctionConfig,
        royaltyParams,
    }.toCell();
    val result = net.send(
        collection,
        createMessage({
            bounce: false,
            value: grams("1.5"),
            dest: destination,
            body: deployBody,
        }),
    );
    assert (result.waitForFirstTransaction() != null) throw 952;
    val item = net.runGetMethod<tuple>(nftItem, "get_nft_data");
    assert (item.size() == 5) throw 953;
    assert ((item.get(0) as int) == -1) throw 953;
    assert ((item.get(1) as int) == itemIndex as int) throw 953;
    assert ((item.get(2) as address) == collection) throw 953;
    assert ((item.get(3) as address) == seller) throw 953;
    println("V3 Testnet synthetic NFT Item deployed: {}", nftItem);
    println("V3 Testnet fixture code hash: {}", code.hash());
    return nftItem;
}
