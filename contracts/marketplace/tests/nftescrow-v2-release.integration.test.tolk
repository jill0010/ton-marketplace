import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/MockNFTItem"
import "@contracts/types"
import "@wrappers/MockNFTItem.gen"
import "@wrappers/NFTEscrowV2.gen"

get fun `test V2 escrow confirms NFT deposit release callback and exact acknowledgement`() {
    val seller = testing.treasury("v2ReleaseSeller");
    val marketplace = testing.treasury("v2ReleaseMarketplace");
    val owner = testing.treasury("v2ReleaseOwner");
    val buyer = testing.treasury("v2ReleaseBuyer");
    val attacker = testing.treasury("v2ReleaseAttacker");

    val depositQueryId = 72001;
    val releaseQueryId = 72002;
    val nftItem = MockNFTItem.fromStorage({
        owner: seller.address,
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
        8001,
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

    // Marketplace requests delivery. The NFT Item itself performs the ownership change.
    val release = escrow.sendReleaseEscrowV2(
        marketplace.address,
        8001,
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
    expect(callback!!.orderId).toEqual(8001);
    expect(callback.productId).toEqual(7001);
    expect(callback.queryId).toEqual(releaseQueryId);
    expect(callback.buyer).toEqual(buyer.address);

    val wrongAck = escrow.sendEscrowReleaseAckV2(
        attacker.address,
        8001,
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
        8001,
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
