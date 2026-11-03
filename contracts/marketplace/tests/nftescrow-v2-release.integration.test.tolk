import "@acton/fmt"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/RejectingNFTItem"
import "@contracts/types"
import "@wrappers/NFTEscrowV2.gen"
import "@wrappers/RejectingNFTItem.gen"

get fun `test V2 escrow confirms NFT deposit release callback and exact acknowledgement`() {
    testing.registerLibrary(
        parseCellFromHex("b5ee9c72010226010007f4000114ff00f4a413f4bcf2c80b0102012003020064f230f8276f10ed44d0d4f404d1d0fa40d4f404d4d14533237ff02732034414c85004cf1612ccf400ccc901c8ccf400c9ed540201480d040201200a05020120090602012008070067b74a7da89a1a9e809a263a1f481a9e809a9a226be0640dd2e60dae0a8e00041c1a1a9a9a263a1f481f401f401a60fa63fa63fa300097b7d05da89a1a9e809a263a1f481a9e809a9a226be0640dde5a1b7a1a9a9a261a1e809f401a63fa2dae0a608dd226b3abe0605a1f481f401a63fa28889c4450413c267017727083e67bcaa430005db8fcfed44d0d4f404d101d0d3fffa40d1226e9632708b02136de002d0fa40d4f404d4d15bd0d4f404d4d15b7f444480201200c0b0039b8ed7ed44d0d4f404d131d0fa40d4f404d4d16c31d0d30fd30ffa40d180067b8f82ed44d0d4f404d131d0fa40d4f404d4d110235f03d0d4f404d4d16c21d0d30701aa02d7180101d30701aa02d7180101d13080202ca1a0e020148160f020148111000714fa40fa00d4d4d4d43001f029206e935f076de010364540f0288b02511370f02732136d500502c8ccf400ccc959c85004cf1612ccf400ccc98020120131200cb08343e903e803e8034c1f4c7f4c7f44d4920c7ac016085dfffffffec092082e4e1c02e4930c01455ae456c052c40b04044ac406082024ea02f2c4870406c486082784ce02f2c64d7c11b7800a5407e08e80077db4080b23d00007e80b2c7f24040723333326002eb3435353440743d013e8034c7f4483080086082784ce02eec24fe08e8379490ae7cb434c8b43e903e803e8034c1f4c7f4c7f44c0cccd45dbe08f21400f3c5807e80b2c7f27e08d62804ed8249b080149a2f85ec249c0db78920840ee6b28028006999056a2998e0192a41052d82485ba44c78c39400e01514002002c8f40001fa02cb1fc90101c8ccccc900a401d0fa40fa00d31fd130268209c9c380a101b60820c2008e368210557cea20f825221034596d71708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0015a104915be20201f4191701f308b435353440743d013e8034c7f44c483080086082784ce02eec3e08d62e6c6497c1380d0064be0037889ba4d7c0db78343e903e803e8034c1f4c7f4c7f457c140b43e903e8034c7f440f434c3f4c3fe90345c20840144e3647e0960840e049f7848f2140373c587328006f2c7c9be808632c7c990c5122a9c601800a2708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0020c20026c200b05345c705b3b08e12544116a9845240b6085144a14554f026431393303233e21023f026016d008d08a0827270e028406d82083080238d20840dc3fb147e0948840d165b5c9c20043232c15401f3c594017e808572da84b2c7f2cfc89ba44ca51633c5c0788072407ec0286456f8a004f7d7b68bb7efe09dbc400b434c0c05c6c2497c1383e903e900c7e800c7d010c7e800c7e800c1cea6d0008b1c0245c2540b4c7d40cf8bb5134353d0134487434fffe903454c1b1c178c0889bbcb43480b43e90353d01353449e0841a4f4e542eb8c089e0840bf2c9a8aeb8c08d0d0970000a62d88dd1bdc1d5c231c16c22524231b03f629d74ac000b0925f0be0236e8e2c519aa140132370f027206e8e1954719026c85004cf1612ccf400ccc9525001c8ccf400c9ed54de512aa04319df258210371638aebae302236e8e2a363703c000f2e0d610364470f02841302370f027324313c85004cf1612ccf400ccc901c8ccf400c9ed54e13a24c000e3022422211c02fc8210487a8e81ba8e68323333355321c705f2e0dc03d33fd430f029206ef2d0df10234604c85004cf1612ccf400ccc9218e3213708210a37a098358056d8040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb00923330e20101c8ccf400c9ed54e00482105fcc3d14bae3025f091e1d0006f2c0d002c85153c705f2e0d806505301d33ffa40fa40f404fa003223fa4430c000f2e14d078209c9c380a127945375a0a1de22d70b01c300209206a19136e220c2fff2e0ce27941027365be30d0293135f03e30d4433c85004cf1612ccf400ccc901c8ccf400c9ed54201f007223fa4430c000f2e14d43308210d53276db016d71708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb00007e821005138d91c85008cf1658cf1671245146104a10395092708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0010340014375f053331c705f2e0d700ee35353737266ef2d0db5dc705f2e0dc04d33f3006d0d4d4d130d0f404fa00d31fd15b6ef2e0dd586d5005c85004cf1612ccf400ccc9238e3312708210a37a098358056d8040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0001926c22e201c8ccf400c9ed5400845f0450785f0501d33f307082108b77173505c8cbff5004cf1610248040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb00007a3b5f0833d33f30708210a8cb00adc804d014cf1643308040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0000be5b333335048210299a3e15baf2e0d5036e8e1466f02a206e9b3101c8ccf400c9ed54db31e13031926c21e2fa4030708210a43227e1f8256d8040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb00"),
    );

    val seller = testing.treasury("v2ReleaseSeller");
    val marketplace = testing.treasury("v2ReleaseMarketplace");
    val owner = testing.treasury("v2ReleaseOwner");
    val buyer = testing.treasury("v2ReleaseBuyer");
    val attacker = testing.treasury("v2ReleaseAttacker");

    val depositQueryId = 72001;
    val releaseQueryId = 72002;
    val nftItem = RejectingNFTItem.fromStorage({
        owner: seller.address,
        controller: seller.address,
        rejectOwner: buyer.address,
        rejectReturn: true,
    });
    val refundNftItem = RejectingNFTItem.fromStorage({
        owner: seller.address,
        controller: seller.address,
        rejectOwner: seller.address,
        rejectReturn: true,
    });

    var seededRecords: map<uint64, Cell<NFTEscrowV2Record>> = [];
    seededRecords.set(
        1,
        NFTEscrowV2Record {
            escrowId: 1,
            nftItem: nftItem.address,
            seller: seller.address,
            productId: 7001,
            status: 0,
            queryId: depositQueryId,
            extra: NFTEscrowV2RecordExtra {
                collection: owner.address,
                itemIndex: 0,
                kind: 3,
            }.toCell(),
        }.toCell(),
    );
    val refundDepositQueryId = 72010;
    seededRecords.set(
        2,
        NFTEscrowV2Record {
            escrowId: 2,
            nftItem: refundNftItem.address,
            seller: seller.address,
            productId: 7002,
            status: 0,
            queryId: refundDepositQueryId,
            extra: NFTEscrowV2RecordExtra {
                collection: owner.address,
                itemIndex: 1,
                kind: 3,
            }.toCell(),
        }.toCell(),
    );
    var seededAssets: map<address, uint64> = [];
    seededAssets.set(nftItem.address, 1);
    seededAssets.set(refundNftItem.address, 2);
    var seededQueries: map<uint64, uint64> = [];
    seededQueries.set(depositQueryId, 1);
    seededQueries.set(refundDepositQueryId, 2);

    val escrow = NFTEscrowV2.fromStorage(NFTEscrowV2Storage {
        owner: owner.address,
        marketplace: marketplace.address,
        records: seededRecords,
        assetToEscrow: seededAssets,
        nextEscrowId: 2,
        queryToEscrow: seededQueries,
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

    val nftDeploy = nftItem.deploy(seller.address, { value: grams("0.1") });
    expect(nftDeploy).toHaveSuccessfulDeploy({ to: nftItem.address });
    val refundNftDeploy = refundNftItem.deploy(seller.address, { value: grams("0.1") });
    expect(refundNftDeploy).toHaveSuccessfulDeploy({ to: refundNftItem.address });

    val escrowDeploy = escrow.deploy(owner.address, { value: grams("0.1") });
    expect(escrowDeploy).toHaveSuccessfulDeploy({ to: escrow.address });

    // The test seeds a pending escrow record so this suite isolates the
    // deposit notification, release, RichBounce recovery, and callback ACK lifecycle.
    // Official collection provenance is tested independently by the V2 policy suite.

    // Deposit through a real TEP-62 transfer and authenticated ownership notification.
    val deposit = nftItem.sendNftTransfer(
        seller.address,
        depositQueryId,
        escrow.address,
        null,
        null,
        grams("0.01"),
        beginCell()
            .storeUint(1, 1)
            .storeRef(
                beginCell().storeUint(0x53564950, 32).storeUint(depositQueryId, 64).endCell(),
            )
            .endCell()
            .beginParse(),
        { value: grams("0.1") },
    );
    expect(deposit).toHaveSuccessfulTx();
    expect(nftItem.owner()).toEqual(escrow.address);

    val deposited = escrow.escrowRecordV2(1);
    assert (deposited != null) throw ErrorsV2.InvalidRelease;
    expect(deposited!!.status).toEqual(1);

    val depositCallback = escrow.depositCallbackV2(1);
    assert (depositCallback != null) throw ErrorsV2.InvalidReleaseConfirmation;
    expect(depositCallback!!.queryId).toEqual(depositQueryId);

    val depositAck = escrow.sendEscrowDepositAckV2(
        marketplace.address,
        1,
        7001,
        nftItem.address,
        seller.address,
        depositQueryId,
        { value: grams("0.05") },
    );
    expect(depositAck).toHaveSuccessfulTx();
    expect(escrow.depositCallbackV2(1) == null).toEqual(true);

    // Only the configured Marketplace can request delivery.
    val forged = escrow.sendReleaseEscrowV2(
        attacker.address,
        8000,
        7001,
        1,
        releaseQueryId,
        buyer.address,
        { value: grams("0.1") },
    );
    expect(forged).toHaveFailedTx({
        from: attacker.address,
        to: escrow.address,
        exitCode: ErrorsV2.InvalidRelease,
    });

    // Reject destinations that would leave the NFT trapped while Escrow
    // incorrectly records delivery as complete.
    val releaseToEscrow = escrow.sendReleaseEscrowV2(
        marketplace.address,
        7998,
        7001,
        1,
        releaseQueryId,
        escrow.address,
        { value: grams("0.1") },
    );
    expect(releaseToEscrow).toHaveFailedTx({
        from: marketplace.address,
        to: escrow.address,
        exitCode: ErrorsV2.InvalidRelease,
    });

    val releaseToNftItem = escrow.sendReleaseEscrowV2(
        marketplace.address,
        7999,
        7001,
        1,
        releaseQueryId,
        nftItem.address,
        { value: grams("0.1") },
    );
    expect(releaseToNftItem).toHaveFailedTx({
        from: marketplace.address,
        to: escrow.address,
        exitCode: ErrorsV2.InvalidRelease,
    });

    val releaseToSeller = escrow.sendReleaseEscrowV2(
        marketplace.address,
        7997,
        7001,
        1,
        releaseQueryId,
        seller.address,
        { value: grams("0.1") },
    );
    expect(releaseToSeller).toHaveFailedTx({
        from: marketplace.address,
        to: escrow.address,
        exitCode: ErrorsV2.InvalidRelease,
    });

    val afterInvalidDestinations = escrow.escrowRecordV2(1);
    assert (afterInvalidDestinations != null) throw ErrorsV2.InvalidRelease;
    expect(afterInvalidDestinations!!.status).toEqual(1);
    expect(escrow.assetEscrowIdV2(nftItem.address)).toEqual(1);
    expect(nftItem.owner()).toEqual(escrow.address);

    // Force the NFT Item to reject delivery to this buyer. This is a real
    // compute-phase failure and must bounce back to the Escrow using RichBounce.
    val rejectedRelease = escrow.sendReleaseEscrowV2(
        marketplace.address,
        8000,
        7001,
        1,
        releaseQueryId,
        buyer.address,
        { value: grams("0.1") },
    );
    expect(rejectedRelease).toHaveBouncedTx({
        from: nftItem.address,
        to: escrow.address,
    });
    expect(nftItem.owner()).toEqual(escrow.address);

    val afterRejectedRelease = escrow.escrowRecordV2(1);
    assert (afterRejectedRelease != null) throw ErrorsV2.InvalidRelease;
    expect(afterRejectedRelease!!.status).toEqual(1);
    expect(escrow.assetEscrowIdV2(nftItem.address)).toEqual(1);

    // A correlated NFT Item bounce must notify MarketplaceV2 through a
    // durable failure callback; custody recovery alone is not enough for orders.
    val releaseFailure = escrow.releaseFailureCallbackV2(1);
    assert (releaseFailure != null) throw ErrorsV2.InvalidReleaseConfirmation;
    expect(releaseFailure!!.orderId).toEqual(8000);
    expect(releaseFailure.productId).toEqual(7001);
    expect(releaseFailure.escrowId).toEqual(1);
    expect(releaseFailure.queryId).toEqual(releaseQueryId);
    expect(releaseFailure.nftItem).toEqual(nftItem.address);
    expect(releaseFailure.buyer).toEqual(buyer.address);

    // A bounced callback delivery leaves the durable failure snapshot intact.
    val bouncedFailureCallback = createMessage({
        bounce: false,
        value: grams("0.03"),
        dest: escrow.address,
        body: EscrowReleaseFailedV2 {
            orderId: 8000,
            productId: 7001,
            escrowId: 1,
            queryId: releaseQueryId,
            nftItem: nftItem.address,
            buyer: buyer.address,
        },
    }).bounced();
    val failureCallbackBounceResult = net.send(marketplace.address, bouncedFailureCallback);
    expect(failureCallbackBounceResult).toHaveSuccessfulTx({
        from: marketplace.address,
        to: escrow.address,
        bounced: true,
    });
    expect(escrow.releaseFailureCallbackV2(1) != null).toEqual(true);

    // Only the Escrow owner may retry the durable failure callback.
    val forgedFailureRetry = escrow.sendRetryReleaseFailureCallbackV2(
        attacker.address,
        1,
        { value: grams("0.05") },
    );
    expect(forgedFailureRetry).toHaveFailedTx({
        from: attacker.address,
        to: escrow.address,
        exitCode: ErrorsV2.NotOwner,
    });

    val retryFailureCallback = escrow.sendRetryReleaseFailureCallbackV2(
        owner.address,
        1,
        { value: grams("0.05") },
    );
    expect(retryFailureCallback).toHaveSuccessfulTx();
    expect(escrow.releaseFailureCallbackV2(1) != null).toEqual(true);

    // A forged ACK cannot clear the durable failure callback.
    val forgedFailureAck = escrow.sendEscrowReleaseFailureAckV2(
        attacker.address,
        8000,
        7001,
        1,
        releaseQueryId,
        nftItem.address,
        buyer.address,
        { value: grams("0.05") },
    );
    expect(forgedFailureAck).toHaveFailedTx({
        from: attacker.address,
        to: escrow.address,
        exitCode: ErrorsV2.InvalidReleaseConfirmation,
    });
    expect(escrow.releaseFailureCallbackV2(1) != null).toEqual(true);

    // Even the configured Marketplace cannot ACK a different order snapshot.
    val wrongFailureAck = escrow.sendEscrowReleaseFailureAckV2(
        marketplace.address,
        8001,
        7001,
        1,
        releaseQueryId,
        nftItem.address,
        buyer.address,
        { value: grams("0.05") },
    );
    expect(wrongFailureAck).toHaveFailedTx({
        from: marketplace.address,
        to: escrow.address,
        exitCode: ErrorsV2.InvalidReleaseConfirmation,
    });
    expect(escrow.releaseFailureCallbackV2(1) != null).toEqual(true);

    val validFailureAck = escrow.sendEscrowReleaseFailureAckV2(
        marketplace.address,
        8000,
        7001,
        1,
        releaseQueryId,
        nftItem.address,
        buyer.address,
        { value: grams("0.05") },
    );
    expect(validFailureAck).toHaveSuccessfulTx();
    expect(escrow.releaseFailureCallbackV2(1) == null).toEqual(true);

    // Malformed RichBounce envelope and truncated original TEP-62 body are ignored.
    // Neither may fail the bounce transaction or alter the reserved custody state.
    val truncatedEnvelopeMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: escrow.address,
        body: beginCell().storeUint(0xfffffffe, 32).endCell(),
    }).bounced();
    val truncatedEnvelopeResult = net.send(nftItem.address, truncatedEnvelopeMessage);
    expect(truncatedEnvelopeResult).toHaveSuccessfulTx({
        from: nftItem.address,
        to: escrow.address,
        bounced: true,
    });

    val truncatedTransferRichBounce = RichBounceBody {
        originalBody: beginCell().storeUint(0x5fcc3d14, 32).endCell(),
        originalInfo: RichBounceOriginalMsgInfo {
            valueCoins: grams("0.05"),
            valueExtra: [],
            createdLt: 0,
            createdAt: 0,
        }.toCell(),
        bouncedByPhase: 1,
        exitCode: 402,
        computePhase: null,
    };
    val truncatedTransferMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: escrow.address,
        body: truncatedTransferRichBounce,
    }).bounced();
    val truncatedTransferResult = net.send(nftItem.address, truncatedTransferMessage);
    expect(truncatedTransferResult).toHaveSuccessfulTx({
        from: nftItem.address,
        to: escrow.address,
        bounced: true,
    });

    val afterMalformedBounces = escrow.escrowRecordV2(1);
    assert (afterMalformedBounces != null) throw ErrorsV2.InvalidRelease;
    expect(afterMalformedBounces!!.status).toEqual(1);
    expect(escrow.assetEscrowIdV2(nftItem.address)).toEqual(1);
    expect(nftItem.owner()).toEqual(escrow.address);

    // The test controller permits delivery again. A retry with the same query ID
    // proves the failed attempt did not leave a stale query reservation.
    val allowDelivery = createMessage({
        bounce: false,
        value: grams("0.02"),
        dest: nftItem.address,
        body: SetRejectReturn { rejectReturn: false },
    });
    val allowDeliveryResult = net.send(seller.address, allowDelivery);
    expect(allowDeliveryResult).toHaveSuccessfulTx({
        from: seller.address,
        to: nftItem.address,
    });

    // Marketplace requests delivery. The NFT Item itself performs the ownership change.
    val release = escrow.sendReleaseEscrowV2(
        marketplace.address,
        8000,
        7001,
        1,
        releaseQueryId,
        buyer.address,
        { value: grams("0.1") },
    );
    expect(release).toHaveSuccessfulTx();
    expect(nftItem.owner()).toEqual(buyer.address);

    val released = escrow.escrowRecordV2(1);
    assert (released != null) throw ErrorsV2.InvalidRelease;
    expect(released!!.status).toEqual(3);

    // Callback is durable until an exact Marketplace ACK.
    val callback = escrow.releaseCallbackV2(1);
    assert (callback != null) throw ErrorsV2.InvalidReleaseConfirmation;
    expect(callback!!.orderId).toEqual(8000);
    expect(callback.productId).toEqual(7001);
    expect(callback.queryId).toEqual(releaseQueryId);
    expect(callback.buyer).toEqual(buyer.address);

    // Simulate a failed Marketplace callback delivery. A bounce from the
    // configured Marketplace must not clear the durable release callback.
    val bouncedCallback = createMessage({
        bounce: false,
        value: grams("0.03"),
        dest: escrow.address,
        body: EscrowReleasedV2 {
            orderId: 8000,
            productId: 7001,
            escrowId: 1,
            queryId: releaseQueryId,
            nftItem: nftItem.address,
            buyer: buyer.address,
        },
    }).bounced();
    val callbackBounceResult = net.send(marketplace.address, bouncedCallback);
    expect(callbackBounceResult).toHaveSuccessfulTx({
        from: marketplace.address,
        to: escrow.address,
        bounced: true,
    });

    val callbackAfterBounce = escrow.releaseCallbackV2(1);
    assert (callbackAfterBounce != null) throw ErrorsV2.InvalidReleaseConfirmation;
    expect(callbackAfterBounce!!.orderId).toEqual(8000);
    expect(callbackAfterBounce.queryId).toEqual(releaseQueryId);
    expect(callbackAfterBounce.buyer).toEqual(buyer.address);

    // Only the Escrow owner may retry a durable callback.
    val forgedRetry = escrow.sendRetryReleaseCallbackV2(
        attacker.address,
        1,
        { value: grams("0.05") },
    );
    expect(forgedRetry).toHaveFailedTx({
        from: attacker.address,
        to: escrow.address,
        exitCode: ErrorsV2.NotOwner,
    });

    val retryCallback = escrow.sendRetryReleaseCallbackV2(
        owner.address,
        1,
        { value: grams("0.05") },
    );
    expect(retryCallback).toHaveSuccessfulTx();
    // Dispatching a retry does not clear the callback; only exact ACK does.
    expect(escrow.releaseCallbackV2(1) != null).toEqual(true);

    val wrongAck = escrow.sendEscrowReleaseAckV2(
        attacker.address,
        8000,
        7001,
        1,
        releaseQueryId,
        nftItem.address,
        buyer.address,
        { value: grams("0.05") },
    );
    expect(wrongAck).toHaveFailedTx({
        from: attacker.address,
        to: escrow.address,
        exitCode: ErrorsV2.InvalidReleaseConfirmation,
    });

    val validAck = escrow.sendEscrowReleaseAckV2(
        marketplace.address,
        8000,
        7001,
        1,
        releaseQueryId,
        nftItem.address,
        buyer.address,
        { value: grams("0.05") },
    );
    expect(validAck).toHaveSuccessfulTx();

    val cleared = escrow.releaseCallbackV2(1);
    expect(cleared == null).toEqual(true);
    expect(escrow.assetEscrowIdV2(nftItem.address) == null).toEqual(true);

    // Once authenticated NFT excesses confirms delivery, the custody reservation is cleared.
    // This test fixture is intentionally not a Fragment NFT Item, so it must still fail
    // the official code-derived address check rather than being relisted.
    val relistCollectionPaused = escrow.sendSetCollectionStatusV2(
        owner.address,
        owner.address,
        2,
        { value: grams("0.05") },
    );
    expect(relistCollectionPaused).toHaveSuccessfulTx();
    val relistItemCode = parseCellFromHex(
        "b5ee9c72010101010023000842022498bd63f3e9cc2c20c79abe58899a4816ea156855b8d4fcd47cda4bae9e911a",
    );
    val relistCodeConfig = escrow.sendSetCollectionItemCodeV2(
        owner.address,
        owner.address,
        3,
        relistItemCode,
        { value: grams("0.05") },
    );
    expect(relistCodeConfig).toHaveSuccessfulTx();
    val relistCollectionActive = escrow.sendSetCollectionStatusV2(
        owner.address,
        owner.address,
        1,
        { value: grams("0.05") },
    );
    expect(relistCollectionActive).toHaveSuccessfulTx();

    val relist = escrow.sendCreateEscrowV2(
        marketplace.address,
        7002,
        nftItem.address,
        owner.address,
        buyer.address,
        72003,
        0,
        3,
        { value: grams("0.05") },
    );
    expect(relist).toHaveFailedTx({
        from: marketplace.address,
        to: escrow.address,
        exitCode: ErrorsV2.InvalidNftItem,
    });
    expect(escrow.assetEscrowIdV2(nftItem.address) == null).toEqual(true);

    // Deposit a second NFT fixture to exercise seller refund independently.
    val refundDeposit = refundNftItem.sendNftTransfer(
        seller.address,
        refundDepositQueryId,
        escrow.address,
        null,
        null,
        grams("0.01"),
        beginCell()
            .storeUint(1, 1)
            .storeRef(
                beginCell().storeUint(0x53564950, 32).storeUint(refundDepositQueryId, 64).endCell(),
            )
            .endCell()
            .beginParse(),
        { value: grams("0.1") },
    );
    expect(refundDeposit).toHaveSuccessfulTx();
    expect(refundNftItem.owner()).toEqual(escrow.address);
    val refundDepositAck = escrow.sendEscrowDepositAckV2(
        marketplace.address,
        2,
        7002,
        refundNftItem.address,
        seller.address,
        refundDepositQueryId,
        { value: grams("0.05") },
    );
    expect(refundDepositAck).toHaveSuccessfulTx();

    // Only the configured Marketplace may request a seller refund.
    val forgedRefund = escrow.sendRefundEscrowV2(
        attacker.address,
        2,
        7002,
        72011,
        seller.address,
        { value: grams("0.1") },
    );
    expect(forgedRefund).toHaveFailedTx({
        from: attacker.address,
        to: escrow.address,
        exitCode: ErrorsV2.InvalidRefund,
    });

    // A rejected transfer back to the seller must bounce and restore Deposited.
    val refundQueryId = 72011;
    val rejectedRefund = escrow.sendRefundEscrowV2(
        marketplace.address,
        2,
        7002,
        refundQueryId,
        seller.address,
        { value: grams("0.1") },
    );
    expect(rejectedRefund).toHaveBouncedTx({
        from: refundNftItem.address,
        to: escrow.address,
    });
    expect(refundNftItem.owner()).toEqual(escrow.address);
    val afterRejectedRefund = escrow.escrowRecordV2(2);
    assert (afterRejectedRefund != null) throw ErrorsV2.InvalidRefund;
    expect(afterRejectedRefund!!.status).toEqual(1);
    expect(escrow.assetEscrowIdV2(refundNftItem.address)).toEqual(2);
    expect(escrow.refundCallbackV2(2) == null).toEqual(true);

    // Allow the seller transfer and retry with the same query ID.
    val allowSellerRefund = refundNftItem.sendAny(
        seller.address,
        SetRejectReturn { rejectReturn: false }.toCell(),
        { value: grams("0.02") },
    );
    expect(allowSellerRefund).toHaveSuccessfulTx();
    val refund = escrow.sendRefundEscrowV2(
        marketplace.address,
        2,
        7002,
        refundQueryId,
        seller.address,
        { value: grams("0.1") },
    );
    expect(refund).toHaveSuccessfulTx();
    expect(refundNftItem.owner()).toEqual(seller.address);
    val refunded = escrow.escrowRecordV2(2);
    assert (refunded != null) throw ErrorsV2.InvalidRefund;
    expect(refunded!!.status).toEqual(5);
    expect(escrow.assetEscrowIdV2(refundNftItem.address) == null).toEqual(true);

    val refundCallback = escrow.refundCallbackV2(2);
    assert (refundCallback != null) throw ErrorsV2.InvalidRefund;
    expect(refundCallback!!.queryId).toEqual(refundQueryId);
    expect(refundCallback!!.seller).toEqual(seller.address);

    // A bounced Marketplace callback is durable and owner-retryable until exact ACK.
    val refundCallbackBounce = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: escrow.address,
        body: EscrowRefundedV2 {
            escrowId: 2,
            productId: 7002,
            queryId: refundQueryId,
            nftItem: refundNftItem.address,
            seller: seller.address,
        },
    }).bounced();
    val refundCallbackBounceResult = net.send(marketplace.address, refundCallbackBounce);
    expect(refundCallbackBounceResult).toHaveSuccessfulTx({
        from: marketplace.address,
        to: escrow.address,
        bounced: true,
    });
    expect(escrow.refundCallbackV2(2) != null).toEqual(true);

    val forgedRefundRetry = escrow.sendRetryRefundCallbackV2(
        attacker.address,
        2,
        { value: grams("0.05") },
    );
    expect(forgedRefundRetry).toHaveFailedTx({
        from: attacker.address,
        to: escrow.address,
        exitCode: ErrorsV2.NotOwner,
    });
    val retryRefundCallback = escrow.sendRetryRefundCallbackV2(
        owner.address,
        2,
        { value: grams("0.05") },
    );
    expect(retryRefundCallback).toHaveSuccessfulTx();
    expect(escrow.refundCallbackV2(2) != null).toEqual(true);

    val wrongRefundAck = escrow.sendEscrowRefundAckV2(
        marketplace.address,
        2,
        7002,
        refundQueryId,
        refundNftItem.address,
        attacker.address,
        { value: grams("0.05") },
    );
    expect(wrongRefundAck).toHaveFailedTx({
        from: marketplace.address,
        to: escrow.address,
        exitCode: ErrorsV2.InvalidRefund,
    });
    val validRefundAck = escrow.sendEscrowRefundAckV2(
        marketplace.address,
        2,
        7002,
        refundQueryId,
        refundNftItem.address,
        seller.address,
        { value: grams("0.05") },
    );
    expect(validRefundAck).toHaveSuccessfulTx();
    expect(escrow.refundCallbackV2(2) == null).toEqual(true);
}
