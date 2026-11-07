import "@acton/env"
import "@acton/build"
import "@acton/io"
import "@acton/emulation/network"
import "@acton/testing/expect"
import "@contracts/types"
import "@wrappers/MarketplaceV2.gen"
import "@wrappers/NFTEscrowV2Testnet.gen"

fun listV3TestnetMockNftFixture(
    marketplace: MarketplaceV2,
    escrow: NFTEscrowV2Testnet,
    seller: address,
    nftItem: address,
    collection: address,
    administrator: address,
    itemIndex: uint256,
) {
    assert (collection != seller) throw 961;
    assert (marketplace.ownerV2() == administrator && escrow.owner() == administrator) throw 962;
    assert (marketplace.escrowV2() == escrow.address) throw 962;
    assert (escrow.marketplace() == marketplace.address) throw 962;
    val before = net.runGetMethod<tuple>(nftItem, "get_nft_data");
    assert ((before.get(0) as int) == -1) throw 963;
    assert ((before.get(1) as int) == itemIndex as int) throw 963;
    assert ((before.get(2) as address) == collection) throw 963;
    assert ((before.get(3) as address) == seller) throw 963;
    assert (marketplace.assetProductIdV2(nftItem) == null) throw 964;

    val code = build("MockNFTItemV3");
    val paused = escrow.sendSetCollectionStatusV2(
        administrator,
        collection,
        2,
        { value: grams("0.05") },
    );
    assert (paused.waitForFirstTransaction() != null) throw 965;
    val configured = escrow.sendSetCollectionItemCodeV2(
        administrator,
        collection,
        3,
        code,
        { value: grams("0.05") },
    );
    assert (configured.waitForFirstTransaction() != null) throw 965;
    val enabled = escrow.sendSetCollectionStatusV2(
        administrator,
        collection,
        1,
        { value: grams("0.05") },
    );
    assert (enabled.waitForFirstTransaction() != null) throw 965;

    val productId = marketplace.nextProductIdV2();
    val queryId = marketplace.nextQueryIdV2();
    val published = marketplace.sendPublishProductV2(
        seller,
        productId,
        queryId,
        nftItem,
        collection,
        itemIndex,
        3,
        grams("0.01"),
        { value: grams("0.2") },
    );
    assert (published.waitForFirstTransaction() != null) throw 966;
    // PublishProductV2 creates the escrow record first, but NFT custody is
    // not acknowledged until the explicit TEP-62 transfer below. At this point
    // the product must still be pending (1); after custody, status becomes 2.
    val productStatus = marketplace.productStatusV2(productId)!!;
    val escrowId = escrow.escrowIdForQueryV2(queryId);
    assert (productStatus == 1 && escrowId > 0) throw 967;

    val payload = beginCell()
        .storeUint(1, 1)
        .storeRef(beginCell().storeUint(0x53564950, 32).storeUint(queryId, 64).endCell())
        .endCell();
    val transfer = createMessage({
        bounce: true,
        value: grams("0.2"),
        dest: nftItem,
        body: NftTransfer {
            queryId,
            newOwner: escrow.address,
            responseDestination: seller,
            customPayload: null,
            forwardAmount: grams("0.05"),
            forwardPayload: payload.beginParse(),
        },
    });
    val deposited = net.send(seller, transfer);
    assert (deposited.waitForFirstTransaction() != null) throw 968;
    if (env<bool>("FIXTURE_EMULATION") ?? false) {
        expect(deposited).toHaveSuccessfulTx({ from: seller, to: nftItem });
    }
    val after = net.runGetMethod<tuple>(nftItem, "get_nft_data");
    assert ((after.get(3) as address) == escrow.address) throw 969;
    assert (marketplace.productStatusV2(productId)!! == 2) throw 969;
    assert (marketplace.productEscrowIdV2(productId)!! == escrowId) throw 969;
    println("V3 Testnet synthetic TEP-62 fixture listed and NFT custody verified.");
    println("NFT Item: {}", nftItem);
    println("Product ID: {}", productId);
    println("Escrow ID: {}", escrowId);
}
