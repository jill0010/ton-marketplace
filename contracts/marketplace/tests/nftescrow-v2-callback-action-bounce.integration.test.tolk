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

get fun `test V2 release callback action-phase failure really bounces and owner retry is acknowledged`() {
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
        rejectReturn: false,
    });
    val marketplace = RejectingMarketplaceCallback.fromStorage({
        controller: controller.address,
        escrow: controller.address,
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
    expect(startRelease).toHaveSuccessfulTx();
    expect(nftItem.owner()).toEqual(buyer.address);
    expect(escrow.escrowRecordV2(1)!!.status).toEqual(3);

    // NFT delivery succeeded, but Marketplace callback processing fails in ACTION phase.
    val failedReceiverTxResult = startRelease.findTransaction({ from: escrow.address, to: marketplace.address });
    expect(failedReceiverTxResult).toBeNotNull();
    val failedReceiverTx = failedReceiverTxResult!!;
    val failedReceiverDescription = failedReceiverTx.description.load();
    assert (failedReceiverDescription is TlbTransOrd) throw 73011;
    assert (failedReceiverDescription.action is TlbJust) throw 73012;
    val failedAction = failedReceiverDescription.action.value.load();
    expect(failedAction.noFunds).toEqual(true);
    // Assert the actual bounced child transaction in the trace below instead of
    // decoding the optional TLB bounce-phase field. The transaction trace matcher
    // verifies the bounced Marketplace -> Escrow message and avoids depending on
    // the emulator's optional bounce-phase serialization shape.

    // The real bounce from the Marketplace contract must arrive back at Escrow.
    expect(startRelease).toHaveBouncedTx({
        from: marketplace.address,
        to: escrow.address,
    });
    val durableCallback = escrow.releaseCallbackV2(1);
    assert (durableCallback != null) throw 73015;
    expect(durableCallback!!.orderId).toEqual(8301);
    expect(durableCallback.queryId).toEqual(releaseQueryId);
    expect(durableCallback.buyer).toEqual(buyer.address);

    // Turn off the action failure, then retry from the Escrow owner.
    expect(
        marketplace.sendSetRejectCallbackV2(
            controller.address,
            false,
            { value: grams("0.02") },
        ),
    ).toHaveSuccessfulTx();
    expect(marketplace.rejectAction()).toEqual(false);

    val retry = escrow.sendRetryReleaseCallbackV2(
        owner.address,
        1,
        { value: grams("0.05") },
    );
    expect(retry).toHaveSuccessfulTx();
    // The accepted callback sends the exact ACK; only that ACK clears the record.
    expect(escrow.releaseCallbackV2(1) == null).toEqual(true);
}
