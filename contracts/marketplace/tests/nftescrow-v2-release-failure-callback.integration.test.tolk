import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/tlb/maybe"
import "@acton/types/transaction"

import "@contracts/RejectingMarketplaceCallback"
import "@contracts/RejectingNFTItem"
import "@contracts/types"
import "@wrappers/NFTEscrowV2.gen"
import "@wrappers/RejectingMarketplaceCallback.gen"
import "@wrappers/RejectingNFTItem.gen"

get fun `test V2 release failure callback action-phase failure really bounces and owner retry is acknowledged`() {
    val seller = testing.treasury("v2ActionBounceSeller");
    val owner = testing.treasury("v2ActionBounceOwner");
    val controller = testing.treasury("v2ActionBounceController");
    val buyer = testing.treasury("v2ActionBounceBuyer");

    val depositQueryId = 73001;
    val releaseQueryId = 73002;
    val nftItem = RejectingNFTItem.fromStorage({
        owner: seller.address,
        controller: seller.address,
        rejectOwner: buyer.address,
        rejectReturn: true,
    });
    val marketplace = RejectingMarketplaceCallback.fromStorage({
        controller: controller.address,
        escrow: controller.address,
        extra: RejectingMarketplaceCallbackExtra {
            marketplace: controller.address,
            testNftItem: nftItem.address,
        }.toCell(),
        rejectAction: true,
    });
    var seededRecords: map<uint64, Cell<NFTEscrowV2Record>> = [];
    seededRecords.set(
        1,
        NFTEscrowV2Record {
            escrowId: 1,
            nftItem: nftItem.address,
            seller: seller.address,
            productId: 7301,
            status: 0,
            queryId: depositQueryId,
            extra: NFTEscrowV2RecordExtra {
                collection: controller.address,
                itemIndex: 0,
                kind: 3,
            }.toCell(),
        }.toCell(),
    );
    var seededAssets: map<address, uint64> = [];
    seededAssets.set(nftItem.address, 1);
    var seededQueries: map<uint64, uint64> = [];
    seededQueries.set(depositQueryId, 1);

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

    expect(
        nftItem.deploy(seller.address, { value: grams("0.1") }),
    ).toHaveSuccessfulDeploy({ to: nftItem.address });
    expect(
        escrow.deploy(owner.address, { value: grams("0.1") }),
    ).toHaveSuccessfulDeploy({ to: escrow.address });
    expect(
        marketplace.deploy(controller.address, { value: grams("0.1") }),
    ).toHaveSuccessfulDeploy({ to: marketplace.address });

    expect(
        marketplace.sendSetTestEscrowAddressV2(
            controller.address,
            escrow.address,
            { value: grams("0.02") },
        ),
    ).toHaveSuccessfulTx();

    // Seed a pending record to isolate callback Action-phase bounce/retry.
    // The V2 collection policy is covered by the dedicated provenance test.

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
    expect(escrow.escrowRecordV2(1)!!.status).toEqual(1);

    // The fixture receives EscrowDepositedV2 and sends the exact deposit ACK.
    expect(escrow.depositCallbackV2(1) == null).toEqual(true);

    val startRelease = marketplace.sendStartTestReleaseV2(
        controller.address,
        8301,
        7301,
        1,
        releaseQueryId,
        buyer.address,
        { value: grams("0.1") },
    );
    // The NFT Item rejects the buyer transfer and bounces to Escrow. Escrow
    // restores Deposited and sends a durable failure callback to Marketplace.
    expect(startRelease).toHaveBouncedTx({
        from: nftItem.address,
        to: escrow.address,
    });
    expect(nftItem.owner()).toEqual(escrow.address);
    expect(escrow.escrowRecordV2(1)!!.status).toEqual(1);
    expect(escrow.assetEscrowIdV2(nftItem.address)).toEqual(1);

    // Marketplace receives the failure callback but its action phase fails.
    val failedReceiverTxResult = startRelease.findTransaction({
        from: escrow.address,
        to: marketplace.address,
    });
    expect(failedReceiverTxResult).toBeNotNull();
    val failedReceiverTx = failedReceiverTxResult!!;
    val failedReceiverDescription = failedReceiverTx.description.load();
    assert (failedReceiverDescription is TlbTransOrd) throw 73011;
    assert (failedReceiverDescription.action is TlbJust) throw 73012;
    val failedAction = failedReceiverDescription.action.value.load();
    expect(failedAction.noFunds).toEqual(true);

    // The actual Marketplace -> Escrow bounce must leave the failure callback durable.
    expect(startRelease).toHaveBouncedTx({
        from: marketplace.address,
        to: escrow.address,
    });
    val durableFailureCallback = escrow.releaseFailureCallbackV2(1);
    assert (durableFailureCallback != null) throw 73015;
    expect(durableFailureCallback!!.orderId).toEqual(8301);
    expect(durableFailureCallback.productId).toEqual(7301);
    expect(durableFailureCallback.escrowId).toEqual(1);
    expect(durableFailureCallback.queryId).toEqual(releaseQueryId);
    expect(durableFailureCallback.nftItem).toEqual(nftItem.address);
    expect(durableFailureCallback.buyer).toEqual(buyer.address);

    // Turn off the action failure, then retry the durable callback from Escrow owner.
    expect(
        marketplace.sendSetRejectCallbackV2(
            controller.address,
            false,
            { value: grams("0.02") },
        ),
    ).toHaveSuccessfulTx();
    expect(marketplace.rejectAction()).toEqual(false);

    val retry = escrow.sendRetryReleaseFailureCallbackV2(
        owner.address,
        1,
        { value: grams("0.05") },
    );
    expect(retry).toHaveSuccessfulTx();
    // Marketplace sends the exact failure ACK; only that ACK clears the callback.
    expect(escrow.releaseFailureCallbackV2(1) == null).toEqual(true);
    expect(nftItem.owner()).toEqual(escrow.address);
    expect(escrow.escrowRecordV2(1)!!.status).toEqual(1);
}
