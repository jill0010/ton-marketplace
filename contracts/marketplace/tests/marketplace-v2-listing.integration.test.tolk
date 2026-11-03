import "@acton/fmt"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/RejectingNFTItem"
import "@contracts/types"
import "@wrappers/MarketplaceV2.gen"
import "@wrappers/NFTEscrowV2.gen"
import "@wrappers/RejectingNFTItem.gen"

get fun `test Marketplace V2 rejects NFT Items not derived from an approved official Fragment code`() {
    testing.registerLibrary(
        parseCellFromHex("b5ee9c72010226010007f4000114ff00f4a413f4bcf2c80b0102012003020064f230f8276f10ed44d0d4f404d1d0fa40d4f404d4d14533237ff02732034414c85004cf1612ccf400ccc901c8ccf400c9ed540201480d040201200a05020120090602012008070067b74a7da89a1a9e809a263a1f481a9e809a9a226be0640dd2e60dae0a8e00041c1a1a9a9a263a1f481f401f401a60fa63fa63fa300097b7d05da89a1a9e809a263a1f481a9e809a9a226be0640dde5a1b7a1a9a9a261a1e809f401a63fa2dae0a608dd226b3abe0605a1f481f401a63fa28889c4450413c267017727083e67bcaa430005db8fcfed44d0d4f404d101d0d3fffa40d1226e9632708b02136de002d0fa40d4f404d4d15bd0d4f404d4d15b7f444480201200c0b0039b8ed7ed44d0d4f404d131d0fa40d4f404d4d16c31d0d30fd30ffa40d180067b8f82ed44d0d4f404d131d0fa40d4f404d4d110235f03d0d4f404d4d16c21d0d30701aa02d7180101d30701aa02d7180101d13080202ca1a0e020148160f020148111000714fa40fa00d4d4d4d43001f029206e935f076de010364540f0288b02511370f02732136d500502c8ccf400ccc959c85004cf1612ccf400ccc98020120131200cb08343e903e803e8034c1f4c7f4c7f44d4920c7ac016085dfffffffec092082e4e1c02e4930c01455ae456c052c40b04044ac406082024ea02f2c4870406c486082784ce02f2c64d7c11b7800a5407e08e80077db4080b23d00007e80b2c7f24040723333326002eb3435353440743d013e8034c7f4483080086082784ce02eec24fe08e8379490ae7cb434c8b43e903e803e8034c1f4c7f4c7f44c0cccd45dbe08f21400f3c5807e80b2c7f27e08d62804ed8249b080149a2f85ec249c0db78920840ee6b28028006999056a2998e0192a41052d82485ba44c78c39400e01514002002c8f40001fa02cb1fc90101c8ccccc900a401d0fa40fa00d31fd130268209c9c380a101b60820c2008e368210557cea20f825221034596d71708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0015a104915be20201f4191701f308b435353440743d013e8034c7f44c483080086082784ce02eec3e08d62e6c6497c1380d0064be0037889ba4d7c0db78343e903e803e8034c1f4c7f4c7f457c140b43e903e8034c7f440f434c3f4c3fe90345c20840144e3647e0960840e049f7848f2140373c587328006f2c7c9be808632c7c990c5122a9c601800a2708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0020c20026c200b05345c705b3b08e12544116a9845240b6085144a14554f026431393303233e21023f026016d008d08a0827270e028406d82083080238d20840dc3fb147e0948840d165b5c9c20043232c15401f3c594017e808572da84b2c7f2cfc89ba44ca51633c5c0788072407ec0286456f8a004f7d7b68bb7efe09dbc400b434c0c05c6c2497c1383e903e900c7e800c7d010c7e800c7e800c1cea6d0008b1c0245c2540b4c7d40cf8bb5134353d0134487434fffe903454c1b1c178c0889bbcb43480b43e90353d01353449e0841a4f4e542eb8c089e0840bf2c9a8aeb8c08d0d0970000a62d88dd1bdc1d5c231c16c22524231b03f629d74ac000b0925f0be0236e8e2c519aa140132370f027206e8e1954719026c85004cf1612ccf400ccc9525001c8ccf400c9ed54de512aa04319df258210371638aebae302236e8e2a363703c000f2e0d610364470f02841302370f027324313c85004cf1612ccf400ccc901c8ccf400c9ed54e13a24c000e3022422211c02fc8210487a8e81ba8e68323333355321c705f2e0dc03d33fd430f029206ef2d0df10234604c85004cf1612ccf400ccc9218e3213708210a37a098358056d8040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb00923330e20101c8ccf400c9ed54e00482105fcc3d14bae3025f091e1d0006f2c0d002c85153c705f2e0d806505301d33ffa40fa40f404fa003223fa4430c000f2e14d078209c9c380a127945375a0a1de22d70b01c300209206a19136e220c2fff2e0ce27941027365be30d0293135f03e30d4433c85004cf1612ccf400ccc901c8ccf400c9ed54201f007223fa4430c000f2e14d43308210d53276db016d71708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb00007e821005138d91c85008cf1658cf1671245146104a10395092708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0010340014375f053331c705f2e0d700ee35353737266ef2d0db5dc705f2e0dc04d33f3006d0d4d4d130d0f404fa00d31fd15b6ef2e0dd586d5005c85004cf1612ccf400ccc9238e3312708210a37a098358056d8040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0001926c22e201c8ccf400c9ed5400845f0450785f0501d33f307082108b77173505c8cbff5004cf1610248040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb00007a3b5f0833d33f30708210a8cb00adc804d014cf1643308040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0000be5b333335048210299a3e15baf2e0d5036e8e1466f02a206e9b3101c8ccf400c9ed54db31e13031926c21e2fa4030708210a43227e1f8256d8040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb00"),
    );

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
        refundQueryToProduct: [],
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
            releaseStorage: NFTEscrowV2ReleaseCallbackStorage {
                pendingReleases: [],
                releaseCallbacks: [],
                releaseFailureCallbacks: [],
            }.toCell(),
            refundStorage: NFTEscrowV2RefundCallbackStorage {
                pendingRefunds: [],
                refundCallbacks: [],
            }.toCell(),
            collectionStorage: NFTEscrowV2CollectionStorage {
                collections: [],
                collectionItemCodes: [],
            }.toCell(),
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
    val validItemStateInit: ContractState = { code: officialItemCode, data: itemData };
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
    val validProductExtra = validProduct.extra.load();
    expect(validProductExtra.collection).toEqual(owner.address);
    expect(validProductExtra.itemIndex).toEqual(validItemIndex);
    expect(validProductExtra.kind).toEqual(3);

    val validEscrowRecord = escrow.escrowRecordV2(1);
    assert (validEscrowRecord != null) throw ErrorsV2.InvalidRelease;
    expect(validEscrowRecord!!.nftItem).toEqual(validNftItem);
    val validEscrowExtra = validEscrowRecord.extra.load();
    expect(validEscrowExtra.collection).toEqual(owner.address);
    expect(validEscrowExtra.itemIndex).toEqual(validItemIndex);
    expect(validEscrowExtra.kind).toEqual(3);

    // A notification from the exact official NFT Item is still insufficient
    // unless it carries the listing-specific marker and the escrow query ID.
    val wrongMarkerPayload = beginCell()
        .storeUint(1, 1)
        .storeRef(beginCell().storeUint(0x11111111, 32).storeUint(3, 64).endCell())
        .endCell();
    val wrongMarkerNotification = createMessage({
        bounce: true,
        value: grams("0.05"),
        dest: escrow.address,
        body: NftOwnershipAssigned {
            queryId: 3,
            prevOwner: seller.address,
            forwardPayload: wrongMarkerPayload.beginParse(),
        },
    });
    val wrongMarkerResult = net.send(validNftItem, wrongMarkerNotification);
    expect(wrongMarkerResult).toHaveFailedTx({
        from: validNftItem,
        to: escrow.address,
        exitCode: ErrorsV2.InvalidRelease,
    });
    expect(escrow.escrowRecordV2(1)!!.status).toEqual(0);

    val wrongQueryPayload = beginCell()
        .storeUint(1, 1)
        .storeRef(beginCell().storeUint(0x53564950, 32).storeUint(4, 64).endCell())
        .endCell();
    val wrongQueryNotification = createMessage({
        bounce: true,
        value: grams("0.05"),
        dest: escrow.address,
        body: NftOwnershipAssigned {
            queryId: 3,
            prevOwner: seller.address,
            forwardPayload: wrongQueryPayload.beginParse(),
        },
    });
    val wrongQueryResult = net.send(validNftItem, wrongQueryNotification);
    expect(wrongQueryResult).toHaveFailedTx({
        from: validNftItem,
        to: escrow.address,
        exitCode: ErrorsV2.InvalidRelease,
    });
    expect(escrow.escrowRecordV2(1)!!.status).toEqual(0);

    val validDepositPayload = beginCell()
        .storeUint(1, 1)
        .storeRef(beginCell().storeUint(0x53564950, 32).storeUint(3, 64).endCell())
        .endCell();
    val validDepositNotification = createMessage({
        bounce: true,
        value: grams("0.05"),
        dest: escrow.address,
        body: NftOwnershipAssigned {
            queryId: 3,
            prevOwner: seller.address,
            forwardPayload: validDepositPayload.beginParse(),
        },
    });
    val validDepositResult = net.send(validNftItem, validDepositNotification);
    expect(validDepositResult).toHaveSuccessfulTx();
    expect(escrow.escrowRecordV2(1)!!.status).toEqual(1);
    expect(escrow.depositCallbackV2(1) == null).toEqual(true);

    // Replaying the exact ownership notification must not create a second
    // transition or overwrite the durable callback after the record is deposited.
    val duplicateDepositResult = net.send(validNftItem, validDepositNotification);
    expect(duplicateDepositResult).toHaveFailedTx({
        from: validNftItem,
        to: escrow.address,
        exitCode: ErrorsV2.InvalidRelease,
    });
    expect(escrow.escrowRecordV2(1)!!.status).toEqual(1);
    expect(escrow.depositCallbackV2(1) == null).toEqual(true);

    // The referenced payload cell must not contain trailing bits or refs.
    val trailingPayload = beginCell()
        .storeUint(1, 1)
        .storeRef(
            beginCell().storeUint(0x53564950, 32).storeUint(3, 64).storeUint(1, 1).endCell(),
        )
        .endCell();
    val trailingNotification = createMessage({
        bounce: true,
        value: grams("0.05"),
        dest: escrow.address,
        body: NftOwnershipAssigned {
            queryId: 3,
            prevOwner: seller.address,
            forwardPayload: trailingPayload.beginParse(),
        },
    });
    val trailingResult = net.send(validNftItem, trailingNotification);
    expect(trailingResult).toHaveFailedTx({
        from: validNftItem,
        to: escrow.address,
        exitCode: ErrorsV2.InvalidRelease,
    });
    expect(escrow.escrowRecordV2(1)!!.status).toEqual(1);
    expect(escrow.depositCallbackV2(1) == null).toEqual(true);

    // Exact duplicate CreateEscrowV2 is idempotent; changed identity is rejected.
    val exactReplay = escrow.sendCreateEscrowV2(
        marketplace.address,
        3,
        validNftItem,
        owner.address,
        seller.address,
        3,
        validItemIndex,
        3,
        { value: grams("0.05") },
    );
    expect(exactReplay).toHaveSuccessfulTx();
    // Idempotent replay must preserve the already-deposited state.
    expect(escrow.escrowRecordV2(1)!!.status).toEqual(1);

    val changedIndexReplay = escrow.sendCreateEscrowV2(
        marketplace.address,
        3,
        nftItem.address,
        owner.address,
        seller.address,
        3,
        validItemIndex + 1,
        3,
        { value: grams("0.05") },
    );
    expect(changedIndexReplay).toHaveFailedTx({
        from: marketplace.address,
        to: escrow.address,
        exitCode: ErrorsV2.InvalidRelease,
    });

    // The same official code and collection cannot authorize a mismatched index.
    val wrongIndex = escrow.sendCreateEscrowV2(
        marketplace.address,
        999,
        nftItem.address,
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
        nftItem.address,
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
        nftItem.address,
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
        nftItem.address,
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

    val revokeCollection = escrow.sendSetCollectionStatusV2(
        owner.address,
        owner.address,
        3,
        { value: grams("0.05") },
    );
    expect(revokeCollection).toHaveSuccessfulTx();

    val revokedCreate = escrow.sendCreateEscrowV2(
        marketplace.address,
        1003,
        nftItem.address,
        owner.address,
        seller.address,
        1003,
        validItemIndex,
        3,
        { value: grams("0.05") },
    );
    expect(revokedCreate).toHaveFailedTx({
        from: marketplace.address,
        to: escrow.address,
        exitCode: ErrorsV2.CollectionNotApproved,
    });

    val forgedPause = escrow.sendSetCollectionStatusV2(
        attacker.address,
        owner.address,
        2,
        { value: grams("0.05") },
    );
    expect(forgedPause).toHaveFailedTx({
        from: attacker.address,
        to: escrow.address,
        exitCode: ErrorsV2.NotOwner,
    });
}
