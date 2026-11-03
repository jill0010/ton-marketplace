import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/RejectingNFTItem"
import "@contracts/types"
import "@wrappers/NFTEscrowV2.gen"
import "@wrappers/RejectingNFTItem.gen"

get fun `test V2 escrow confirms NFT deposit release callback and exact acknowledgement`() {
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
        }.toCell(),
    });

    val nftDeploy = nftItem.deploy(seller.address, { value: grams("0.1") });
    expect(nftDeploy).toHaveSuccessfulDeploy({ to: nftItem.address });

    val escrowDeploy = escrow.deploy(owner.address, { value: grams("0.1") });
    expect(escrowDeploy).toHaveSuccessfulDeploy({ to: escrow.address });

    val create = escrow.sendCreateEscrowV2(
        marketplace.address,
        7001,
        nftItem.address,
        seller.address,
        depositQueryId,
        { value: grams("0.05") },
    );
    expect(create).toHaveSuccessfulTx();

    // A second query ID must not create a second custody record for the same NFT Item.
    val duplicateCreate = escrow.sendCreateEscrowV2(
        marketplace.address,
        7002,
        nftItem.address,
        seller.address,
        72003,
        { value: grams("0.05") },
    );
    expect(duplicateCreate).toHaveFailedTx({
        from: marketplace.address,
        to: escrow.address,
        exitCode: ErrorsV2.AssetAlreadyEscrowed,
    });
    expect(escrow.assetEscrowIdV2(nftItem.address)).toEqual(1);

    // Deposit through a real TEP-62 transfer and authenticated ownership notification.
    val deposit = nftItem.sendNftTransfer(
        seller.address,
        depositQueryId,
        escrow.address,
        null,
        null,
        grams("0.01"),
        beginCell().endCell().beginParse(),
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

    // Once authenticated NFT excesses confirms delivery, the new owner can list it again.
    val relist = escrow.sendCreateEscrowV2(
        marketplace.address,
        7002,
        nftItem.address,
        buyer.address,
        72003,
        { value: grams("0.05") },
    );
    expect(relist).toHaveSuccessfulTx();
    expect(escrow.assetEscrowIdV2(nftItem.address)).toEqual(2);
}
