import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/RejectingNFTItem"
import "@contracts/types"
import "@wrappers/MarketplaceV2.gen"
import "@wrappers/NFTEscrowV2.gen"
import "@wrappers/RejectingNFTItem.gen"

get fun `test Marketplace V2 rejects NFT Items not derived from an approved official Fragment code`() {
    val seller = testing.treasury("marketplaceV2ListingSeller");
    val owner = testing.treasury("marketplaceV2ListingOwner");
    val attacker = testing.treasury("marketplaceV2ListingAttacker");

    val nftItem = RejectingNFTItem.fromStorage({
        owner: seller.address,
        controller: seller.address,
        rejectOwner: attacker.address,
        rejectReturn: false,
    });

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
        collectionStorage: NFTEscrowV2CollectionStorage {
            collections: [],
            collectionItemCodes: [],
        }.toCell(),
        nextEscrowId: 1,
        queryToEscrow: [],
        callbacks: NFTEscrowV2CallbackStorage {
            depositCallbacks: [],
            pendingReleases: [],
            releaseCallbacks: [],
        }.toCell(),
    });

    expect(
        nftItem.deploy(seller.address, { value: grams("0.1") }),
    ).toHaveSuccessfulDeploy({ to: nftItem.address });
    expect(
        marketplace.deploy(owner.address, { value: grams("0.2") }),
    ).toHaveSuccessfulDeploy({ to: marketplace.address });
    expect(
        escrow.deploy(owner.address, { value: grams("0.2") }),
    ).toHaveSuccessfulDeploy({ to: escrow.address });

    // Only the Marketplace owner may bind the isolated V2 Escrow.
    val forgedConfig = marketplace.sendSetMarketplaceV2Escrow(
        attacker.address,
        escrow.address,
        { value: grams("0.02") },
    );
    expect(forgedConfig).toHaveFailedTx({
        from: attacker.address,
        to: marketplace.address,
        exitCode: ErrorsV2.NotOwner,
    });

    val configure = marketplace.sendSetMarketplaceV2Escrow(
        owner.address,
        escrow.address,
        { value: grams("0.02") },
    );
    expect(configure).toHaveSuccessfulTx();
    expect(marketplace.escrowV2()).toEqual(escrow.address);
    expect(marketplace.escrowConfiguredV2()).toEqual(true);

    // Once bound, the V2 Escrow cannot be rotated by the owner.
    val rotateEscrow = marketplace.sendSetMarketplaceV2Escrow(
        owner.address,
        attacker.address,
        { value: grams("0.02") },
    );
    expect(rotateEscrow).toHaveFailedTx({
        from: owner.address,
        to: marketplace.address,
        exitCode: ErrorsV2.InvalidRelease,
    });
    expect(marketplace.escrowV2()).toEqual(escrow.address);

    // Register a recognized Fragment Gift Item Code. The deployed RejectingNFTItem
    // fixture is deliberately not derived from this code and must be rejected.
    val collectionPaused = escrow.sendSetCollectionStatusV2(
        owner.address,
        owner.address,
        2,
        { value: grams("0.05") },
    );
    expect(collectionPaused).toHaveSuccessfulTx();

    val officialItemCode = parseCellFromHex(
        "b5ee9c72010101010023000842022498bd63f3e9cc2c20c79abe58899a4816ea156855b8d4fcd47cda4bae9e911a",
    );
    val setItemCode = escrow.sendSetCollectionItemCodeV2(
        owner.address,
        owner.address,
        3,
        officialItemCode,
        { value: grams("0.05") },
    );
    expect(setItemCode).toHaveSuccessfulTx();

    val collectionActive = escrow.sendSetCollectionStatusV2(
        owner.address,
        owner.address,
        1,
        { value: grams("0.05") },
    );
    expect(collectionActive).toHaveSuccessfulTx();

    // A malicious NFT Item with an unrelated code/address cannot enter custody.
    val publish = marketplace.sendPublishProductV2(
        seller.address,
        nftItem.address,
        owner.address,
        0,
        3,
        grams("2"),
        { value: grams("0.2") },
    );
    expect(publish).toHaveSuccessfulTx();
    expect(publish).toHaveBouncedTx({ from: escrow.address, to: marketplace.address });

    val rejectedProduct = marketplace.productV2(1);
    assert (rejectedProduct != null) throw ErrorsV2.InvalidRelease;
    expect(rejectedProduct!!.seller).toEqual(seller.address);
    expect(rejectedProduct.price).toEqual(grams("2"));
    expect(rejectedProduct.status).toEqual(5);
    expect(rejectedProduct.queryId).toEqual(1);
    expect(marketplace.assetProductIdV2(nftItem.address) == null).toEqual(true);

    // An attacker cannot activate the listing by forging the exact callback body.
    val forgedCallback = createMessage({
        bounce: true,
        value: grams("0.05"),
        dest: marketplace.address,
        body: EscrowDepositedV2 {
            escrowId: 1,
            productId: 1,
            nftItem: nftItem.address,
            seller: seller.address,
            queryId: 1,
        },
    });
    val forgedCallbackResult = net.send(attacker.address, forgedCallback);
    expect(forgedCallbackResult).toHaveFailedTx({
        from: attacker.address,
        to: marketplace.address,
        exitCode: ErrorsV2.InvalidReleaseConfirmation,
    });
    expect(marketplace.productV2(1)!!.status).toEqual(5);
    expect(escrow.escrowRecordV2(1) == null).toEqual(true);

    // After the exact failed escrow request is bounced, the reservation is released.
    // A second attempt is accepted into Marketplace pending state, then rejected again by Escrow.
    val retryPublish = marketplace.sendPublishProductV2(
        attacker.address,
        nftItem.address,
        owner.address,
        0,
        3,
        grams("3"),
        { value: grams("0.2") },
    );
    expect(retryPublish).toHaveSuccessfulTx();
    expect(retryPublish).toHaveBouncedTx({ from: escrow.address, to: marketplace.address });
    expect(marketplace.productV2(2)!!.status).toEqual(5);
    expect(marketplace.assetProductIdV2(nftItem.address) == null).toEqual(true);


    // Positive provenance case: derive the NFT Item address from the exact
    // approved Fragment Item Code, index, and collection. Escrow accepts it.
    val validItemIndex = 42;
    val itemConfig = beginCell()
        .storeUint(validItemIndex, 256)
        .storeAddress(owner.address)
        .endCell();
    val itemData = beginCell().storeRef(itemConfig).storeUint(0, 1).endCell();
    val validItemStateInit: ContractState = {
        code: officialItemCode,
        data: itemData,
    };
    val validNftItem = AutoDeployAddress {
        workchain: 0,
        stateInit: validItemStateInit,
    }.calculateAddress();

    val validPublish = marketplace.sendPublishProductV2(
        seller.address,
        validNftItem,
        owner.address,
        validItemIndex,
        3,
        grams("4"),
        { value: grams("0.2") },
    );
    expect(validPublish).toHaveSuccessfulTx();
    val validProduct = marketplace.productV2(3);
    assert (validProduct != null) throw ErrorsV2.InvalidRelease;
    expect(validProduct!!.status).toEqual(1);
    expect(validProduct.collection).toEqual(owner.address);
    expect(validProduct.itemIndex).toEqual(validItemIndex);
    expect(validProduct.kind).toEqual(3);

    val validEscrowRecord = escrow.escrowRecordV2(1);
    assert (validEscrowRecord != null) throw ErrorsV2.InvalidRelease;
    expect(validEscrowRecord!!.nftItem).toEqual(validNftItem);
    expect(validEscrowRecord.collection).toEqual(owner.address);
    expect(validEscrowRecord.itemIndex).toEqual(validItemIndex);
    expect(validEscrowRecord.kind).toEqual(3);

    // The same official code and collection cannot authorize a mismatched index.
    val wrongIndex = escrow.sendCreateEscrowV2(
        marketplace.address,
        999,
        validNftItem,
        owner.address,
        seller.address,
        999,
        validItemIndex + 1,
        3,
        { value: grams("0.05") },
    );
    expect(wrongIndex).toHaveFailedTx({
        from: marketplace.address,
        to: escrow.address,
        exitCode: ErrorsV2.InvalidNftItem,
    });

    val wrongKind = escrow.sendCreateEscrowV2(
        marketplace.address,
        1000,
        validNftItem,
        owner.address,
        seller.address,
        1000,
        validItemIndex,
        2,
        { value: grams("0.05") },
    );
    expect(wrongKind).toHaveFailedTx({
        from: marketplace.address,
        to: escrow.address,
        exitCode: ErrorsV2.InvalidProductKind,
    });

    val unapprovedCollection = escrow.sendCreateEscrowV2(
        marketplace.address,
        1001,
        validNftItem,
        attacker.address,
        seller.address,
        1001,
        validItemIndex,
        3,
        { value: grams("0.05") },
    );
    expect(unapprovedCollection).toHaveFailedTx({
        from: marketplace.address,
        to: escrow.address,
        exitCode: ErrorsV2.CollectionNotApproved,
    });

    val unsupportedItemCode = escrow.sendSetCollectionItemCodeV2(
        owner.address,
        owner.address,
        3,
        beginCell().storeUint(0, 32).endCell(),
        { value: grams("0.05") },
    );
    expect(unsupportedItemCode).toHaveFailedTx({
        from: owner.address,
        to: escrow.address,
        exitCode: ErrorsV2.InvalidCollectionItemCode,
    });

    val pauseCollection = escrow.sendSetCollectionStatusV2(
        owner.address,
        owner.address,
        2,
        { value: grams("0.05") },
    );
    expect(pauseCollection).toHaveSuccessfulTx();
    val pausedCreate = escrow.sendCreateEscrowV2(
        marketplace.address,
        1002,
        validNftItem,
        owner.address,
        seller.address,
        1002,
        validItemIndex,
        3,
        { value: grams("0.05") },
    );
    expect(pausedCreate).toHaveFailedTx({
        from: marketplace.address,
        to: escrow.address,
        exitCode: ErrorsV2.CollectionNotApproved,
    });

}
