import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/types"
import "@wrappers/MarketplaceV2.gen"
import "@wrappers/NFTEscrowV2.gen"

get fun `test Marketplace V2 accepts a real deployed allowlisted NFT Item TEP-62 transfer`() {
    val seller = testing.treasury("marketplaceV2OfficialItemSeller");
    val owner = testing.treasury("marketplaceV2OfficialItemOwner");

    val marketplace = MarketplaceV2.fromStorage(MarketplaceV2Storage {
        owner: owner.address,
        escrow: owner.address,
        escrowConfigured: false,
        nextProductId: 1,
        nextQueryId: 1,
        products: [],
        assetListings: [],
        queryToProduct: [],
    });

    val escrow = NFTEscrowV2.fromStorage(NFTEscrowV2Storage {
        owner: owner.address,
        marketplace: marketplace.address,
        records: [],
        assetToEscrow: [],
        nextEscrowId: 1,
        queryToEscrow: [],
        callbacks: NFTEscrowV2CallbackStorage {
            depositCallbacks: [],
            pendingReleases: [],
            releaseCallbacks: [],
            collectionStorage: NFTEscrowV2CollectionStorage {
                collections: [],
                collectionItemCodes: [],
            }.toCell(),
        }.toCell(),
    });

    expect(marketplace.deploy(owner.address, { value: grams("0.2") }))
        .toHaveSuccessfulDeploy({ to: marketplace.address });
    expect(escrow.deploy(owner.address, { value: grams("0.2") }))
        .toHaveSuccessfulDeploy({ to: escrow.address });

    expect(marketplace.sendSetMarketplaceV2Escrow(
        owner.address,
        escrow.address,
        { value: grams("0.02") },
    )).toHaveSuccessfulTx();

    // Register the exact allowlisted Fragment Gift Item Code and approve its collection.
    val officialItemCode = parseCellFromHex(
        "b5ee9c72010101010023000842022498bd63f3e9cc2c20c79abe58899a4816ea156855b8d4fcd47cda4bae9e911a",
    );
    expect(escrow.sendSetCollectionStatusV2(
        owner.address,
        owner.address,
        2,
        { value: grams("0.05") },
    )).toHaveSuccessfulTx();
    expect(escrow.sendSetCollectionItemCodeV2(
        owner.address,
        owner.address,
        3,
        officialItemCode,
        { value: grams("0.05") },
    )).toHaveSuccessfulTx();
    expect(escrow.sendSetCollectionStatusV2(
        owner.address,
        owner.address,
        1,
        { value: grams("0.05") },
    )).toHaveSuccessfulTx();

    // Recreate the exact Fragment Gift Item StateInit used by the escrow's
    // collection/index address derivation. This deploys the allowlisted code,
    // rather than impersonating its future address in a network message.
    val itemIndex = 4242;
    val itemConfig = beginCell()
        .storeUint(itemIndex, 256)
        .storeAddress(owner.address)
        .endCell();
    val itemData = beginCell().storeRef(itemConfig).storeUint(0, 1).endCell();
    val itemStateInit: ContractState = { code: officialItemCode, data: itemData };
    val nftItem = AutoDeployAddress {
        workchain: 0,
        stateInit: itemStateInit,
    }.calculateAddress();

    val deployItem = createMessage({
        bounce: false,
        value: grams("0.3"),
        dest: {
            workchain: 0,
            stateInit: itemStateInit,
        },
    });
    expect(net.send(seller.address, deployItem))
        .toHaveSuccessfulDeploy({ to: nftItem });

    // Publish from the real seller wallet; Marketplace reserves the item and
    // Escrow creates the pending custody record before the NFT transfer.
    expect(marketplace.sendPublishProductV2(
        seller.address,
        nftItem,
        owner.address,
        itemIndex,
        3,
        grams("4"),
        { value: grams("0.2") },
    )).toHaveSuccessfulTx();

    val pendingProduct = marketplace.productV2(1);
    assert (pendingProduct != null) throw ErrorsV2.InvalidRelease;
    expect(pendingProduct!!.status).toEqual(1);
    val pendingRecord = escrow.escrowRecordV2(1);
    assert (pendingRecord != null) throw ErrorsV2.InvalidRelease;
    expect(pendingRecord!!.status).toEqual(0);

    // Execute a standard TEP-62 transfer from the seller to the escrow. The
    // allowlisted NFT Item contract itself must update ownership and emit the
    // ownership_assigned notification carrying this exact listing payload.
    val listingPayload = beginCell()
        .storeUint(1, 1)
        .storeRef(beginCell().storeUint(0x53564950, 32).storeUint(1, 64).endCell())
        .endCell();
    val transfer = createMessage({
        bounce: true,
        value: grams("0.2"),
        dest: nftItem,
        body: NftTransfer {
            queryId: 1,
            newOwner: escrow.address,
            responseDestination: seller.address,
            customPayload: null,
            forwardAmount: grams("0.05"),
            forwardPayload: listingPayload.beginParse(),
        },
    });
    val transferResult = net.send(seller.address, transfer);
    expect(transferResult).toHaveSuccessfulTx();

    // The official Item's emitted notification must drive the complete
    // Escrow -> Marketplace callback -> exact ACK chain.
    val depositedRecord = escrow.escrowRecordV2(1);
    assert (depositedRecord != null) throw ErrorsV2.InvalidRelease;
    expect(depositedRecord!!.status).toEqual(1);
    expect(escrow.assetEscrowIdV2(nftItem)).toEqual(1);

    val activeProduct = marketplace.productV2(1);
    assert (activeProduct != null) throw ErrorsV2.InvalidRelease;
    expect(activeProduct!!.status).toEqual(2);
    expect(activeProduct.escrowId).toEqual(1);
    expect(escrow.depositCallbackV2(1) == null).toEqual(true);
}
