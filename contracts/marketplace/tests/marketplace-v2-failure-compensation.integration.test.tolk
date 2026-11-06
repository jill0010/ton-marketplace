import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/RejectingMarketplaceCallback"
import "@contracts/types"
import "@wrappers/MarketplaceV2.gen"
import "@wrappers/RejectingMarketplaceCallback.gen"

get fun `test Marketplace V2 returns buyer funds only after Escrow confirms seller NFT return`() {
    val owner = testing.treasury("v2FailureOwner");
    val seller = testing.treasury("v2FailureSeller");
    val treasury = testing.treasury("v2FailureTreasury");
    val fakeEscrow = testing.treasury("v2FailureEscrow");
    val nftItem = testing.treasury("v2FailureNftItem").address;
    val collection = testing.treasury("v2FailureCollection").address;

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

    val rejector = RejectingMarketplaceCallback.fromStorage(RejectingMarketplaceCallbackStorage {
        controller: owner.address,
        escrow: fakeEscrow.address,
        extra: RejectingMarketplaceCallbackExtra {
            marketplace: marketplace.address,
            testNftItem: nftItem,
        }.toCell(),
        rejectAction: true,
    });
    val buyer = rejector.address;

    expect(
        marketplace.deploy(owner.address, { value: grams("0.3") }),
    ).toHaveSuccessfulDeploy({ to: marketplace.address });
    expect(
        rejector.deploy(owner.address, { value: grams("0.3") }),
    ).toHaveSuccessfulDeploy({ to: rejector.address });

    expect(marketplace.nextProductIdV2()).toEqual(1);
    expect(marketplace.nextQueryIdV2()).toEqual(1);

    expect(
        marketplace.sendSetMarketplaceV2Escrow(
            owner.address,
            fakeEscrow.address,
            { value: grams("0.03") },
        ),
    ).toHaveSuccessfulTx();
    expect(
        marketplace.sendSetMarketplaceV2Treasury(
            owner.address,
            treasury.address,
            { value: grams("0.03") },
        ),
    ).toHaveSuccessfulTx();

    // The test harness wallet stands in for Escrow. It confirms the deposit,
    // then the test injects authenticated failure/return callbacks from that
    // exact configured address to exercise the Marketplace compensation path.
    expect(
        marketplace.sendPublishProductV2(
            seller.address,
            1,
            1,
            nftItem,
            collection,
            4242,
            3,
            grams("4"),
            { value: grams("0.2") },
        ),
    ).toHaveSuccessfulTx();

    val depositCallback = createMessage({
        bounce: BounceMode.Only256BitsOfBody,
        value: grams("0.03"),
        dest: marketplace.address,
        body: EscrowDepositedV2 {
            escrowId: 1,
            productId: 1,
            nftItem,
            seller: seller.address,
            queryId: 1,
        },
    });
    expect(net.send(fakeEscrow.address, depositCallback)).toHaveSuccessfulTx();
    expect(marketplace.productV2(1)!!.status).toEqual(2);

    val now = testing.getNow();
    val purchase = marketplace.sendBuyProductV2(
        buyer,
        1,
        grams("4"),
        1001,
        now + 600,
        { value: grams("4.2") },
    );
    expect(purchase).toHaveSuccessfulTx();

    val releaseFailure = createMessage({
        bounce: BounceMode.Only256BitsOfBody,
        value: grams("0.03"),
        dest: marketplace.address,
        body: EscrowReleaseFailedV2 {
            orderId: 1,
            productId: 1,
            escrowId: 1,
            queryId: 2,
            nftItem,
            buyer,
        },
    });
    expect(net.send(fakeEscrow.address, releaseFailure)).toHaveSuccessfulTx();

    // Escrow confirms the NFT has returned to the seller. Only now may the
    // Marketplace dispatch the buyer refund.
    val sellerReturn = createMessage({
        bounce: BounceMode.Only256BitsOfBody,
        value: grams("0.03"),
        dest: marketplace.address,
        body: EscrowRefundedV2 {
            escrowId: 1,
            productId: 1,
            queryId: 6,
            nftItem,
            seller: seller.address,
        },
    });
    expect(net.send(fakeEscrow.address, sellerReturn)).toHaveSuccessfulTx();

    // The rejecting buyer contract deliberately bounces the refund transfer.
    val resolvedOrderId = marketplace.orderIdForProductV2(1);
    assert (resolvedOrderId != null) throw ErrorsV2.InvalidRefund;
    expect(resolvedOrderId!!).toEqual(1);
    expect(marketplace.orderIdForProductV2(999) == null).toEqual(true);

    val order = marketplace.orderV2(1);
    assert (order != null) throw ErrorsV2.InvalidRefund;
    expect(order!!.status).toEqual(6);
    expect(order.deliveryStatus).toEqual(3);
    expect(order.refundStatus).toEqual(3);
    expect(order.sellerPayoutStatus).toEqual(1);
    expect(order.platformPayoutStatus).toEqual(1);

    val product = marketplace.productV2(1);
    assert (product != null) throw ErrorsV2.InvalidRefund;
    expect(product!!.status).toEqual(5);
    expect(marketplace.assetProductIdV2(nftItem) == null).toEqual(true);

    val operations = order.extra.load().operations.load();
    val buyerRefund = marketplace.payoutV2(operations.buyerRefundOperationId);
    assert (buyerRefund != null) throw ErrorsV2.InvalidPayout;
    expect(buyerRefund!!.kind).toEqual(3);
    expect(buyerRefund.status).toEqual(3);
    expect(buyerRefund.beneficiary).toEqual(buyer);
    expect(buyerRefund.amount).toEqual(grams("4"));

    val sellerPayout = marketplace.payoutV2(operations.sellerPayoutOperationId);
    val platformPayout = marketplace.payoutV2(operations.platformPayoutOperationId);
    assert (sellerPayout != null && platformPayout != null) throw ErrorsV2.InvalidPayout;
    expect(sellerPayout!!.status).toEqual(1);
    expect(platformPayout!!.status).toEqual(1);

    expect(
        rejector.sendSetRejectCallbackV2(
            owner.address,
            false,
            { value: grams("0.02") },
        ),
    ).toHaveSuccessfulTx();
    expect(rejector.rejectAction()).toEqual(false);

    val retryBuyerRefund = marketplace.sendRetryPayoutV2(
        owner.address,
        operations.buyerRefundOperationId,
        { value: grams("0.05") },
    );
    expect(retryBuyerRefund).toHaveSuccessfulTx();

    val refundedOrder = marketplace.orderV2(1);
    assert (refundedOrder != null) throw ErrorsV2.InvalidPayout;
    expect(refundedOrder!!.status).toEqual(8);
    expect(refundedOrder.refundStatus).toEqual(2);
    val retriedRefund = marketplace.payoutV2(operations.buyerRefundOperationId);
    assert (retriedRefund != null) throw ErrorsV2.InvalidPayout;
    expect(retriedRefund!!.status).toEqual(2);

    expect(marketplace.nextProductIdV2()).toEqual(2);
    expect(marketplace.nextQueryIdV2()).toEqual(8);

    // The Marketplace supports all three Fragment asset kinds. Real collection
    // code hashes are still configured/verified separately by the Escrow owner.
    val usernameItem = testing.treasury("v2FailureUsernameItem").address;
    val usernameCollection = testing.treasury("v2FailureUsernameCollection").address;
    expect(
        marketplace.sendPublishProductV2(
            seller.address,
            2,
            8,
            usernameItem,
            usernameCollection,
            4243,
            1,
            grams("5"),
            { value: grams("0.2") },
        ),
    ).toHaveSuccessfulTx();
    val usernameDeposit = createMessage({
        bounce: BounceMode.Only256BitsOfBody,
        value: grams("0.03"),
        dest: marketplace.address,
        body: EscrowDepositedV2 {
            escrowId: 2,
            productId: 2,
            nftItem: usernameItem,
            seller: seller.address,
            queryId: 8,
        },
    });
    expect(net.send(fakeEscrow.address, usernameDeposit)).toHaveSuccessfulTx();
    expect(marketplace.productV2(2)!!.status).toEqual(2);
    expect(marketplace.productV2(2)!!.extra.load().kind).toEqual(1);

    val numberItem = testing.treasury("v2FailureNumberItem").address;
    val numberCollection = testing.treasury("v2FailureNumberCollection").address;
    expect(
        marketplace.sendPublishProductV2(
            seller.address,
            3,
            9,
            numberItem,
            numberCollection,
            4244,
            2,
            grams("6"),
            { value: grams("0.2") },
        ),
    ).toHaveSuccessfulTx();
    val numberDeposit = createMessage({
        bounce: BounceMode.Only256BitsOfBody,
        value: grams("0.03"),
        dest: marketplace.address,
        body: EscrowDepositedV2 {
            escrowId: 3,
            productId: 3,
            nftItem: numberItem,
            seller: seller.address,
            queryId: 9,
        },
    });
    expect(net.send(fakeEscrow.address, numberDeposit)).toHaveSuccessfulTx();
    expect(marketplace.productV2(3)!!.status).toEqual(2);
    expect(marketplace.productV2(3)!!.extra.load().kind).toEqual(2);
}

get fun `test Marketplace V2 compensates an actual bounced RichBounce ReleaseEscrowV2 request`() {
    val owner = testing.treasury("v2RequestBounceOwner");
    val seller = testing.treasury("v2RequestBounceSeller");
    val treasury = testing.treasury("v2RequestBounceTreasury");
    val buyer = testing.treasury("v2RequestBounceBuyer");
    val nftItem = testing.treasury("v2RequestBounceNft").address;
    val collection = testing.treasury("v2RequestBounceCollection").address;

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
    val rejector = RejectingMarketplaceCallback.fromStorage(RejectingMarketplaceCallbackStorage {
        controller: owner.address,
        escrow: owner.address,
        extra: RejectingMarketplaceCallbackExtra {
            marketplace: marketplace.address,
            testNftItem: nftItem,
        }.toCell(),
        rejectAction: false,
    });

    expect(
        marketplace.deploy(owner.address, { value: grams("0.3") }),
    ).toHaveSuccessfulDeploy({ to: marketplace.address });
    expect(
        rejector.deploy(owner.address, { value: grams("0.3") }),
    ).toHaveSuccessfulDeploy({ to: rejector.address });
    expect(
        marketplace.sendSetMarketplaceV2Escrow(
            owner.address,
            rejector.address,
            { value: grams("0.03") },
        ),
    ).toHaveSuccessfulTx();
    expect(
        marketplace.sendSetMarketplaceV2Treasury(
            owner.address,
            treasury.address,
            { value: grams("0.03") },
        ),
    ).toHaveSuccessfulTx();

    expect(
        marketplace.sendPublishProductV2(
            seller.address,
            1,
            1,
            nftItem,
            collection,
            77,
            3,
            grams("4"),
            { value: grams("0.2") },
        ),
    ).toHaveSuccessfulTx();
    expect(
        rejector.sendStartTestEscrowV2(
            owner.address,
            1,
            nftItem,
            seller.address,
            1,
            { value: grams("0.03") },
        ),
    ).toHaveSuccessfulTx();
    expect(marketplace.productV2(1)!!.status).toEqual(2);

    val now = testing.getNow();
    val purchase = marketplace.sendBuyProductV2(
        buyer.address,
        1,
        grams("4"),
        9001,
        now + 600,
        { value: grams("4.2") },
    );
    expect(purchase).toHaveSuccessfulTx();
    expect(purchase).toHaveBouncedTx({ from: rejector.address, to: marketplace.address });

    // The fixture accepts only the correlated RefundEscrowV2 request and then
    // returns the exact EscrowRefundedV2 callback. Final settlement therefore
    // proves that the request Bounce entered compensation and completed the
    // seller-return-before-buyer-refund sequence.
    val completed = marketplace.orderV2(1);
    assert (completed != null) throw ErrorsV2.InvalidRefund;
    expect(completed!!.status).toEqual(8);
    expect(completed.deliveryStatus).toEqual(3);
    expect(completed.refundStatus).toEqual(2);
    expect(marketplace.productV2(1)!!.status).toEqual(5);
    val operations = completed.extra.load().operations.load();
    val refund = marketplace.payoutV2(operations.buyerRefundOperationId);
    assert (refund != null) throw ErrorsV2.InvalidPayout;
    expect(refund!!.status).toEqual(2);
    expect(refund.amount).toEqual(grams("4"));
    expect(refund.beneficiary).toEqual(buyer.address);
    expect(marketplace.nextQueryIdV2()).toEqual(7);
}
