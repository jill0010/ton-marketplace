import "@acton/fmt"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/tlb/maybe"
import "@acton/types/transaction"

import "@contracts/types"
import "@contracts/RejectingMarketplaceCallback"
import "@wrappers/MarketplaceV2.gen"
import "@wrappers/NFTEscrowV2.gen"
import "@wrappers/RejectingMarketplaceCallback.gen"

get fun `test Marketplace V2 accepts a real deployed allowlisted NFT Item TEP-62 transfer`() {
    testing.registerLibrary(
        parseCellFromHex("b5ee9c72010226010007f4000114ff00f4a413f4bcf2c80b0102012003020064f230f8276f10ed44d0d4f404d1d0fa40d4f404d4d14533237ff02732034414c85004cf1612ccf400ccc901c8ccf400c9ed540201480d040201200a05020120090602012008070067b74a7da89a1a9e809a263a1f481a9e809a9a226be0640dd2e60dae0a8e00041c1a1a9a9a263a1f481f401f401a60fa63fa63fa300097b7d05da89a1a9e809a263a1f481a9e809a9a226be0640dde5a1b7a1a9a9a261a1e809f401a63fa2dae0a608dd226b3abe0605a1f481f401a63fa28889c4450413c267017727083e67bcaa430005db8fcfed44d0d4f404d101d0d3fffa40d1226e9632708b02136de002d0fa40d4f404d4d15bd0d4f404d4d15b7f444480201200c0b0039b8ed7ed44d0d4f404d131d0fa40d4f404d4d16c31d0d30fd30ffa40d180067b8f82ed44d0d4f404d131d0fa40d4f404d4d110235f03d0d4f404d4d16c21d0d30701aa02d7180101d30701aa02d7180101d13080202ca1a0e020148160f020148111000714fa40fa00d4d4d4d43001f029206e935f076de010364540f0288b02511370f02732136d500502c8ccf400ccc959c85004cf1612ccf400ccc98020120131200cb08343e903e803e8034c1f4c7f4c7f44d4920c7ac016085dfffffffec092082e4e1c02e4930c01455ae456c052c40b04044ac406082024ea02f2c4870406c486082784ce02f2c64d7c11b7800a5407e08e80077db4080b23d00007e80b2c7f24040723333326002eb3435353440743d013e8034c7f4483080086082784ce02eec24fe08e8379490ae7cb434c8b43e903e803e8034c1f4c7f4c7f44c0cccd45dbe08f21400f3c5807e80b2c7f27e08d62804ed8249b080149a2f85ec249c0db78920840ee6b28028006999056a2998e0192a41052d82485ba44c78c39400e01514002002c8f40001fa02cb1fc90101c8ccccc900a401d0fa40fa00d31fd130268209c9c380a101b60820c2008e368210557cea20f825221034596d71708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0015a104915be20201f4191701f308b435353440743d013e8034c7f44c483080086082784ce02eec3e08d62e6c6497c1380d0064be0037889ba4d7c0db78343e903e803e8034c1f4c7f4c7f457c140b43e903e8034c7f440f434c3f4c3fe90345c20840144e3647e0960840e049f7848f2140373c587328006f2c7c9be808632c7c990c5122a9c601800a2708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0020c20026c200b05345c705b3b08e12544116a9845240b6085144a14554f026431393303233e21023f026016d008d08a0827270e028406d82083080238d20840dc3fb147e0948840d165b5c9c20043232c15401f3c594017e808572da84b2c7f2cfc89ba44ca51633c5c0788072407ec0286456f8a004f7d7b68bb7efe09dbc400b434c0c05c6c2497c1383e903e900c7e800c7d010c7e800c7e800c1cea6d0008b1c0245c2540b4c7d40cf8bb5134353d0134487434fffe903454c1b1c178c0889bbcb43480b43e90353d01353449e0841a4f4e542eb8c089e0840bf2c9a8aeb8c08d0d0970000a62d88dd1bdc1d5c231c16c22524231b03f629d74ac000b0925f0be0236e8e2c519aa140132370f027206e8e1954719026c85004cf1612ccf400ccc9525001c8ccf400c9ed54de512aa04319df258210371638aebae302236e8e2a363703c000f2e0d610364470f02841302370f027324313c85004cf1612ccf400ccc901c8ccf400c9ed54e13a24c000e3022422211c02fc8210487a8e81ba8e68323333355321c705f2e0dc03d33fd430f029206ef2d0df10234604c85004cf1612ccf400ccc9218e3213708210a37a098358056d8040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb00923330e20101c8ccf400c9ed54e00482105fcc3d14bae3025f091e1d0006f2c0d002c85153c705f2e0d806505301d33ffa40fa40f404fa003223fa4430c000f2e14d078209c9c380a127945375a0a1de22d70b01c300209206a19136e220c2fff2e0ce27941027365be30d0293135f03e30d4433c85004cf1612ccf400ccc901c8ccf400c9ed54201f007223fa4430c000f2e14d43308210d53276db016d71708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb00007e821005138d91c85008cf1658cf1671245146104a10395092708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0010340014375f053331c705f2e0d700ee35353737266ef2d0db5dc705f2e0dc04d33f3006d0d4d4d130d0f404fa00d31fd15b6ef2e0dd586d5005c85004cf1612ccf400ccc9238e3312708210a37a098358056d8040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0001926c22e201c8ccf400c9ed5400845f0450785f0501d33f307082108b77173505c8cbff5004cf1610248040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb00007a3b5f0833d33f30708210a8cb00adc804d014cf1643308040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0000be5b333335048210299a3e15baf2e0d5036e8e1466f02a206e9b3101c8ccf400c9ed54db31e13031926c21e2fa4030708210a43227e1f8256d8040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb00"),
    );

    val seller = testing.treasury("marketplaceV2OfficialItemSeller");
    val owner = testing.treasury("marketplaceV2OfficialItemOwner");
    val attacker = testing.treasury("marketplaceV2OfficialItemAttacker");
    val buyer = testing.treasury("marketplaceV2OfficialItemBuyer");
    val rejector = RejectingMarketplaceCallback.fromStorage(RejectingMarketplaceCallbackStorage {
        controller: owner.address,
        escrow: owner.address,
        rejectAction: true,
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
        purchaseStorage: MarketplaceV2PurchaseStorage {
            schemaVersion: 2,
            treasury: owner.address,
            treasuryConfigured: false,
            nextOrderId: 1,
            nextOperationId: 1,
            refundQueryToProduct: [],
            orders: MarketplaceV2OrderStorage {
                orders: [],
                productToOrder: [],
                paymentQueryToOrder: [],
                refundQueryToOrder: [],
            }.toCell(),
            payoutStorage: MarketplaceV2PayoutStorage {
                payouts: [],
                payoutQueryToOperation: [],
            }.toCell(),
        }.toCell(),
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
        marketplace.deploy(owner.address, { value: grams("0.2") }),
    ).toHaveSuccessfulDeploy({ to: marketplace.address });
    expect(
        escrow.deploy(owner.address, { value: grams("0.2") }),
    ).toHaveSuccessfulDeploy({ to: escrow.address });

    expect(
        rejector.deploy(owner.address, { value: grams("0.2") }),
    ).toHaveSuccessfulDeploy({ to: rejector.address });

    expect(
        marketplace.sendSetMarketplaceV2Escrow(
            owner.address,
            escrow.address,
            { value: grams("0.02") },
        ),
    ).toHaveSuccessfulTx();

    expect(
        marketplace.sendSetMarketplaceV2Treasury(
            owner.address,
            rejector.address,
            { value: grams("0.02") },
        ),
    ).toHaveSuccessfulTx();
    expect(marketplace.treasuryV2()).toEqual(rejector.address);
    expect(rejector.rejectAction()).toEqual(true);
    expect(marketplace.treasuryConfiguredV2()).toEqual(true);

    // Register the exact allowlisted Fragment Gift Item Code and approve its collection.
    val officialItemCode = parseCellFromHex(
        "b5ee9c72010101010023000842022498bd63f3e9cc2c20c79abe58899a4816ea156855b8d4fcd47cda4bae9e911a",
    );
    expect(
        escrow.sendSetCollectionStatusV2(
            owner.address,
            owner.address,
            2,
            { value: grams("0.05") },
        ),
    ).toHaveSuccessfulTx();
    expect(
        escrow.sendSetCollectionItemCodeV2(
            owner.address,
            owner.address,
            3,
            officialItemCode,
            { value: grams("0.05") },
        ),
    ).toHaveSuccessfulTx();
    expect(
        escrow.sendSetCollectionStatusV2(
            owner.address,
            owner.address,
            1,
            { value: grams("0.05") },
        ),
    ).toHaveSuccessfulTx();

    // Recreate the exact Fragment Gift Item StateInit used by the escrow's
    // collection/index address derivation. This deploys the allowlisted code,
    // rather than impersonating its future address in a network message.
    val itemIndex = 4242;
    val itemConfig = beginCell().storeUint(itemIndex, 256).storeAddress(owner.address).endCell();
    val itemData = beginCell().storeRef(itemConfig).storeUint(0, 1).endCell();
    val itemStateInit: ContractState = { code: officialItemCode, data: itemData };
    val nftItem = AutoDeployAddress {
        workchain: 0,
        stateInit: itemStateInit,
    }.calculateAddress();

    // Fragment collection deployment ABI: the collection sends the deploy
    // message and names the seller as the initial owner. This is the same
    // initialization path exercised by official-nft-emulation.test.tolk.
    val tokenInfo = beginCell()
        .storeUint(1, 8)
        .storeUint(65, 8)
        .storeUint(1, 8)
        .storeUint(66, 8)
        .endCell();
    val nftContent = beginCell().storeUint(1, 8).storeUint(120, 8).endCell();
    val auctionConfig = beginCell()
        .storeAddress(owner.address)
        .storeCoins(grams("1"))
        .storeCoins(grams("1"))
        .storeUint(1, 8)
        .storeUint(60, 32)
        .storeUint(3600, 32)
        .endCell();
    val royaltyParams = beginCell()
        .storeUint(0, 16)
        .storeUint(100, 16)
        .storeAddress(owner.address)
        .endCell();
    val deployBody = beginCell()
        .storeUint(0x299a3e15, 32)
        .storeAddress(seller.address)
        .storeCoins(grams("1"))
        .storeRef(tokenInfo)
        .storeRef(nftContent)
        .storeRef(auctionConfig)
        .storeRef(royaltyParams)
        .endCell();
    val deployItem = createMessage({
        bounce: false,
        value: grams("1.5"),
        dest: { workchain: 0, stateInit: itemStateInit },
        body: deployBody,
    });
    expect(net.send(owner.address, deployItem)).toHaveSuccessfulDeploy({ to: nftItem });

    // Verify the actual deployed official Item reports the seller as owner.
    val beforeTransfer = net.runGetMethodExt<tuple>(nftItem, "get_nft_data");
    expect(beforeTransfer.isSuccess()).toEqual(true);
    expect(beforeTransfer.unwrap().get(3) as address).toEqual(seller.address);

    // A different wallet cannot transfer the seller's NFT into custody.
    val forgedTransfer = createMessage({
        bounce: true,
        value: grams("0.2"),
        dest: nftItem,
        body: NftTransfer {
            queryId: 99,
            newOwner: escrow.address,
            responseDestination: owner.address,
            customPayload: null,
            forwardAmount: grams("0.05"),
            forwardPayload: beginCell().endCell().beginParse(),
        },
    });
    val forgedTransferResult = net.send(owner.address, forgedTransfer);
    val forgedItemTxResult = forgedTransferResult.findTransaction({ to: nftItem });
    expect(forgedItemTxResult).toBeNotNull();
    val forgedItemTx = forgedItemTxResult!!;
    val forgedItemDescription = forgedItemTx.description.load();
    assert (forgedItemDescription is TlbTransOrd) throw 402;
    expect(forgedItemDescription.aborted).toEqual(true);
    val afterForgedTransfer = net.runGetMethodExt<tuple>(nftItem, "get_nft_data");
    expect(afterForgedTransfer.isSuccess()).toEqual(true);
    expect(afterForgedTransfer.unwrap().get(3) as address).toEqual(seller.address);

    // Publish from the real seller wallet; Marketplace reserves the item and
    // Escrow creates the pending custody record before the NFT transfer.
    expect(
        marketplace.sendPublishProductV2(
            seller.address,
            nftItem,
            owner.address,
            itemIndex,
            3,
            grams("4"),
            { value: grams("0.2") },
        ),
    ).toHaveSuccessfulTx();

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

    // Assert the NFT Item's own getter confirms the ownership change; this
    // prevents a notification-only or forged-sender test from passing.
    val afterTransfer = net.runGetMethodExt<tuple>(nftItem, "get_nft_data");
    expect(afterTransfer.isSuccess()).toEqual(true);
    expect(afterTransfer.unwrap().get(3) as address).toEqual(escrow.address);

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

    // Payment is accepted only from a different wallet, for the exact listed
    // price, before the short deadline, with the explicit execution reserve.
    val now = testing.getNow();
    val selfPurchase = marketplace.sendBuyProductV2(
        seller.address,
        1,
        grams("4"),
        8001,
        now + 600,
        { value: grams("4.2") },
    );
    expect(selfPurchase).toHaveFailedTx({
        from: seller.address,
        to: marketplace.address,
        exitCode: ErrorsV2.InvalidPurchase,
    });

    val wrongPrice = marketplace.sendBuyProductV2(
        buyer.address,
        1,
        grams("3.9"),
        8002,
        now + 600,
        { value: grams("4.2") },
    );
    expect(wrongPrice).toHaveFailedTx({
        from: buyer.address,
        to: marketplace.address,
        exitCode: ErrorsV2.InvalidPurchase,
    });

    val underpayment = marketplace.sendBuyProductV2(
        buyer.address,
        1,
        grams("4"),
        8003,
        now + 600,
        { value: grams("4.1") },
    );
    expect(underpayment).toHaveFailedTx({
        from: buyer.address,
        to: marketplace.address,
        exitCode: ErrorsV2.InvalidPayment,
    });

    val overpayment = marketplace.sendBuyProductV2(
        buyer.address,
        1,
        grams("4"),
        8007,
        now + 600,
        { value: grams("4.3") },
    );
    expect(overpayment).toHaveFailedTx({
        from: buyer.address,
        to: marketplace.address,
        exitCode: ErrorsV2.InvalidPayment,
    });

    val listingQueryCollision = marketplace.sendBuyProductV2(
        buyer.address,
        1,
        grams("4"),
        1,
        now + 600,
        { value: grams("4.2") },
    );
    expect(listingQueryCollision).toHaveFailedTx({
        from: buyer.address,
        to: marketplace.address,
        exitCode: ErrorsV2.InvalidPurchase,
    });

    val reservedQueryCollision = marketplace.sendBuyProductV2(
        buyer.address,
        1,
        grams("4"),
        2,
        now + 600,
        { value: grams("4.2") },
    );
    expect(reservedQueryCollision).toHaveFailedTx({
        from: buyer.address,
        to: marketplace.address,
        exitCode: ErrorsV2.InvalidPurchase,
    });

    val expiredPurchase = marketplace.sendBuyProductV2(
        buyer.address,
        1,
        grams("4"),
        8004,
        now - 1,
        { value: grams("4.2") },
    );
    expect(expiredPurchase).toHaveFailedTx({
        from: buyer.address,
        to: marketplace.address,
        exitCode: ErrorsV2.InvalidPurchase,
    });

    val buy = marketplace.sendBuyProductV2(
        buyer.address,
        1,
        grams("4"),
        8005,
        now + 600,
        { value: grams("4.2") },
    );
    expect(buy).toHaveSuccessfulTx();

    // The complete on-chain chain must move the actual official NFT Item to
    // the buyer, confirm delivery through Escrow, and dispatch both payout legs.
    val afterPurchase = net.runGetMethodExt<tuple>(nftItem, "get_nft_data");
    expect(afterPurchase.isSuccess()).toEqual(true);
    expect(afterPurchase.unwrap().get(3) as address).toEqual(buyer.address);

    val deliveredOrder = marketplace.orderV2(1);
    assert (deliveredOrder != null) throw ErrorsV2.InvalidDelivery;
    // Seller payout succeeds, while the test-only treasury deliberately
    // fails its action phase so only the platform leg is marked Bounced.
    expect(deliveredOrder!!.status).toEqual(4);
    expect(deliveredOrder.deliveryStatus).toEqual(2);
    expect(deliveredOrder.sellerPayoutStatus).toEqual(2);
    expect(deliveredOrder.platformPayoutStatus).toEqual(3);
    val deliveredExtra = deliveredOrder.extra.load();
    val deliveredSettlement = deliveredExtra.settlement.load();
    expect(deliveredSettlement.gross).toEqual(grams("4"));
    expect(deliveredSettlement.platformFee).toEqual(grams("0.12"));
    expect(deliveredSettlement.sellerProceeds).toEqual(grams("3.88"));
    expect(
        deliveredSettlement.platformFee + deliveredSettlement.sellerProceeds,
    ).toEqual(deliveredSettlement.gross);
    expect(deliveredSettlement.feeBps).toEqual(300);

    val deliveredOperations = deliveredExtra.operations.load();
    expect(rejector.rejectAction()).toEqual(true);
    expect(
        rejector.sendSetRejectCallbackV2(
            owner.address,
            false,
            { value: grams("0.02") },
        ),
    ).toHaveSuccessfulTx();
    expect(rejector.rejectAction()).toEqual(false);

    val retryPlatformPayout = marketplace.sendRetryPayoutV2(
        buyer.address,
        deliveredOperations.platformPayoutOperationId,
        { value: grams("0.05") },
    );
    expect(retryPlatformPayout).toHaveSuccessfulTx();

    val settledOrder = marketplace.orderV2(1);
    assert (settledOrder != null) throw ErrorsV2.InvalidPayout;
    expect(settledOrder!!.status).toEqual(5);
    expect(settledOrder.sellerPayoutStatus).toEqual(2);
    expect(settledOrder.platformPayoutStatus).toEqual(2);

    expect(marketplace.productV2(1)!!.status).toEqual(3);
    expect(escrow.escrowRecordV2(1)!!.status).toEqual(3);
    expect(escrow.assetEscrowIdV2(nftItem) == null).toEqual(true);
    expect(escrow.releaseCallbackV2(1) == null).toEqual(true);

    val duplicateBuy = marketplace.sendBuyProductV2(
        buyer.address,
        1,
        grams("4"),
        8006,
        now + 600,
        { value: grams("4.2") },
    );
    expect(duplicateBuy).toHaveFailedTx({
        from: buyer.address,
        to: marketplace.address,
        exitCode: ErrorsV2.InvalidPurchase,
    });
}
