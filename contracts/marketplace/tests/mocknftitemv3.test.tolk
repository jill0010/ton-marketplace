import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@contracts/MockNFTItemV3"
import "@contracts/types"

get fun `test Testnet fixture NFT deploys with Fragment-compatible StateInit and supports TEP-62 ownership transfer`() {
    val collection = testing.treasury("mockNftV3Collection");
    val seller = testing.treasury("mockNftV3Seller");
    val buyer = testing.treasury("mockNftV3Buyer");
    val itemIndex = 1001;
    val code = build("MockNFTItemV3");
    val config = beginCell().storeUint(itemIndex, 256).storeAddress(collection.address).endCell();
    val data = beginCell().storeRef(config).storeUint(0, 1).endCell();
    val stateInit: ContractState = { code: code, data: data };
    val destination = AutoDeployAddress {
        workchain: 0,
        stateInit,
    };
    val nftItem = destination.calculateAddress();

    val tokenInfo = beginCell().storeUint(1, 8).storeUint(65, 8).endCell();
    val content = beginCell().storeUint(1, 8).storeUint(120, 8).endCell();
    val auctionConfig = beginCell()
        .storeAddress(collection.address)
        .storeCoins(grams("1"))
        .endCell();
    val royaltyParams = beginCell()
        .storeUint(0, 16)
        .storeUint(100, 16)
        .storeAddress(collection.address)
        .endCell();
    val deploy = net.send(
        collection.address,
        createMessage({
            bounce: false,
            value: grams("1.5"),
            dest: destination,
            body: DeployMockNFTItemV3 {
                owner: seller.address,
                amount: grams("1"),
                tokenInfo,
                content,
                auctionConfig,
                royaltyParams,
            }.toCell(),
        }),
    );
    expect(deploy).toHaveSuccessfulTx({ to: nftItem });
    expect(net.runGetMethod<address>(nftItem, "owner")).toEqual(seller.address);
    val before = net.runGetMethod<tuple>(nftItem, "get_nft_data");
    expect(before.get(0) as int).toEqual(-1);
    expect(before.get(1) as int).toEqual(itemIndex as int);
    expect(before.get(2) as address).toEqual(collection.address);
    expect(before.get(3) as address).toEqual(seller.address);

    val forwardPayload = beginCell()
        .storeUint(1, 1)
        .storeRef(beginCell().storeUint(0x53564950, 32).endCell())
        .endCell();
    val transfer = net.send(
        seller.address,
        createMessage({
            bounce: true,
            value: grams("0.1"),
            dest: nftItem,
            body: NftTransfer {
                queryId: 1001,
                newOwner: buyer.address,
                responseDestination: seller.address,
                customPayload: null,
                forwardAmount: grams("0.01"),
                forwardPayload: forwardPayload.beginParse(),
            }.toCell(),
        }),
    );
    expect(transfer).toHaveSuccessfulTx({ from: seller.address, to: nftItem });
    expect(net.runGetMethod<address>(nftItem, "owner")).toEqual(buyer.address);
    val after = net.runGetMethod<tuple>(nftItem, "get_nft_data");
    expect(after.get(3) as address).toEqual(buyer.address);
    expect(transfer).toHaveSuccessfulTx<NftOwnershipAssigned>({ from: nftItem, to: buyer.address });
    expect(transfer).toHaveSuccessfulTx<NftExcesses>({ from: nftItem, to: seller.address });
}

get fun `test Testnet fixture NFT rejects a transfer from a non-owner`() {
    val collection = testing.treasury("mockNftV3CollectionReject");
    val seller = testing.treasury("mockNftV3SellerReject");
    val attacker = testing.treasury("mockNftV3Attacker");
    val code = build("MockNFTItemV3");
    val config = beginCell().storeUint(1002, 256).storeAddress(collection.address).endCell();
    val data = beginCell().storeRef(config).storeUint(0, 1).endCell();
    val stateInit: ContractState = { code: code, data: data };
    val destination = AutoDeployAddress {
        workchain: 0,
        stateInit,
    };
    val nftItem = destination.calculateAddress();
    val empty = beginCell().endCell();
    val deploy = net.send(
        collection.address,
        createMessage({
            bounce: false,
            value: grams("1.5"),
            dest: destination,
            body: DeployMockNFTItemV3 {
                owner: seller.address,
                amount: grams("1"),
                tokenInfo: empty,
                content: empty,
                auctionConfig: empty,
                royaltyParams: empty,
            }.toCell(),
        }),
    );
    expect(deploy).toHaveSuccessfulTx({ to: nftItem });
    val transfer = net.send(
        attacker.address,
        createMessage({
            bounce: true,
            value: grams("0.05"),
            dest: nftItem,
            body: NftTransfer {
                queryId: 1002,
                newOwner: attacker.address,
                responseDestination: attacker.address,
                customPayload: null,
                forwardAmount: grams("0"),
                forwardPayload: empty.beginParse(),
            }.toCell(),
        }),
    );
    expect(transfer).toHaveFailedTx({ to: nftItem, exitCode: Errors.NotOwner });
    expect(net.runGetMethod<address>(nftItem, "owner")).toEqual(seller.address);
}
