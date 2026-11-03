import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/message"
import "@acton/tlb/maybe"
import "@acton/types/transaction"

import "@contracts/RejectingNFTItem"
import "@contracts/types"
import "@wrappers/NFTEscrow.gen"
import "@wrappers/RejectingNFTItem.gen"

get fun `test real NFT Item compute failure automatically bounces refund transfer and restores escrow`() {
    val seller = testing.treasury("realBounceSeller");
    val deployer = testing.treasury("realBounceDeployer");
    val marketplace = testing.treasury("realBounceMarketplace");
    val collection = testing.treasury("realBounceCollection");

    val queryId = 88001;
    val itemIndex = 0;
    val nftItem = RejectingNFTItem.fromStorage({
        owner: seller.address,
        controller: seller.address,
        rejectOwner: seller.address,
        rejectReturn: true,
    });
    val nftDeploy = nftItem.deploy(seller.address, { value: grams("0.05") });
    expect(nftDeploy).toHaveSuccessfulDeploy({ to: nftItem.address });

    val recordExtra = EscrowRecordExtra {
        queryId,
        createdAt: 1793577600,
        itemIndex,
        kind: 3,
    };
    val record = EscrowRecord {
        escrowId: 1,
        nftItem: nftItem.address,
        collection: collection.address,
        seller: seller.address,
        productId: 88001,
        status: 1,
        extra: recordExtra.toCell(),
    };
    var records: map<uint64, Cell<EscrowRecord>> = [];
    records.set(1, record.toCell());
    var queryToEscrow: map<uint64, uint64> = [];
    queryToEscrow.set(queryId, 1);

    val escrow = NFTEscrow.fromStorage({
        owner: deployer.address,
        marketplace: marketplace.address,
        paused: false,
        nextEscrowId: 2,
        records,
        collectionStorage: CollectionStorage {
            collections: [],
            collectionItemCodes: [],
        }.toCell(),
        queryToEscrow,
        callbackStorage: EscrowCallbackStorage {
            refundCallbacks: [],
            depositCallbacks: [],
        }.toCell(),
    });
    val escrowDeploy = escrow.deploy(deployer.address, { value: grams("0.05") });
    expect(escrowDeploy).toHaveSuccessfulDeploy({ to: escrow.address });

    // 先执行真实 TEP-62 转账，把测试 NFT 的所有权交给 Escrow。
    // Escrow 收到真实 NftOwnershipAssigned 后，记录从 Pending 变为 Deposited。
    val notificationData = beginCell().storeUint(0x53564950, 32).storeUint(queryId, 64).endCell();
    val forwardPayload = beginCell()
        .storeUint(1, 1)
        .storeRef(notificationData)
        .endCell()
        .beginParse();
    val depositTransfer = createMessage({
        bounce: false,
        value: grams("0.1"),
        dest: nftItem.address,
        body: NftTransfer {
            queryId,
            newOwner: escrow.address,
            responseDestination: null,
            customPayload: null,
            forwardAmount: grams("0.01"),
            forwardPayload,
        },
    });
    val depositRes = net.send(seller.address, depositTransfer);
    expect(depositRes).toHaveSuccessfulTx({
        from: seller.address,
        to: nftItem.address,
    });
    expect(nftItem.owner()).toEqual(escrow.address);

    val depositedRecord = escrow.escrowRecord(1);
    assert (depositedRecord != null) throw Errors.InvalidEscrow;
    expect(depositedRecord!!.status).toEqual(2);

    // Escrow 余额不足时，退款出站消息不能被创建；必须保持 Deposited，不能卡在 RefundPending。
    val underfundedRefundRes = escrow.sendRequestRefund(
        seller.address,
        1,
        { value: grams("0.001") },
    );
    val underfundedTxResult = underfundedRefundRes.findTransaction({ to: escrow.address });
    expect(underfundedTxResult).toBeNotNull();
    val underfundedTx = underfundedTxResult!!;
    val underfundedDescription = underfundedTx.description.load();
    assert (underfundedDescription is TlbTransOrd) throw 402;
    expect(underfundedDescription.aborted).toEqual(true);
    assert (underfundedDescription.action is TlbJust) throw 402;
    val underfundedAction = underfundedDescription.action.value.load();
    expect(underfundedAction.noFunds).toEqual(true);

    val stillDeposited = escrow.escrowRecord(1);
    assert (stillDeposited != null) throw Errors.InvalidEscrow;
    expect(stillDeposited!!.status).toEqual(2);

    // 管理员通过合法消息补充 Escrow Gas 储备，然后重试。
    val replenish = createMessage({
        bounce: false,
        value: grams("0.1"),
        dest: escrow.address,
        body: SetEscrowPaused { paused: false },
    });
    val replenishRes = net.send(deployer.address, replenish);
    expect(replenishRes).toHaveSuccessfulTx({
        from: deployer.address,
        to: escrow.address,
    });

    // NFT Item 对 Escrow 发出的退款 Transfer 执行真实 compute-phase 拒绝。
    // 因 Escrow 使用 RichBounce，Emulator 应自动生成 bounce 并交回 Escrow。
    val failedRefundRes = escrow.sendRequestRefund(
        seller.address,
        1,
        { value: grams("0.05") },
    );
    expect(failedRefundRes).toHaveBouncedTx({
        from: nftItem.address,
        to: escrow.address,
    });

    // 检查 NFT Item 交易的 Bounce phase：必须实际成功生成 Bounce，且费用确实被扣除。
    val failedItemTxResult = failedRefundRes.findTransaction({ to: nftItem.address });
    expect(failedItemTxResult).toBeNotNull();
    val failedItemTx = failedItemTxResult!!;
    val failedItemDescription = failedItemTx.description.load();
    assert (failedItemDescription is TlbTransOrd) throw 402;
    assert (failedItemDescription.bounce is TlbJust) throw 402;
    val bouncePhase = failedItemDescription.bounce.value;
    assert (bouncePhase is TlbTrBounceOk) throw 402;
    expect(bouncePhase.msgFees > 0).toEqual(true);
    expect(bouncePhase.fwdFees > 0).toEqual(true);

    expect(nftItem.owner()).toEqual(escrow.address);

    // 只有真实 bounce 被处理后，RefundPending 才能恢复为 Deposited。
    val restoredRecord = escrow.escrowRecord(1);
    assert (restoredRecord != null) throw Errors.InvalidEscrow;
    expect(restoredRecord!!.status).toEqual(2);

    // 关闭测试拒绝开关，再次退款应正常完成，证明 NFT 所有权和 Escrow 状态均可重试。
    val allowReturn = createMessage({
        bounce: false,
        value: grams("0.02"),
        dest: nftItem.address,
        body: SetRejectReturn { rejectReturn: false },
    });
    val allowReturnRes = net.send(seller.address, allowReturn);
    expect(allowReturnRes).toHaveSuccessfulTx({
        from: seller.address,
        to: nftItem.address,
    });

    val retryRefundRes = escrow.sendRequestRefund(
        seller.address,
        1,
        { value: grams("0.05") },
    );
    expect(retryRefundRes).toHaveSuccessfulTx({
        from: escrow.address,
        to: nftItem.address,
    });
    expect(nftItem.owner()).toEqual(seller.address);

    val refundedRecord = escrow.escrowRecord(1);
    assert (refundedRecord != null) throw Errors.InvalidEscrow;
    expect(refundedRecord!!.status).toEqual(4);
}
