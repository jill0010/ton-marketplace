import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/RejectingMarketplaceCallback"
import "@contracts/TestMarketplaceEscrowV2"
import "@contracts/types"
import "@wrappers/MarketplaceV2.gen"
import "@wrappers/RejectingMarketplaceCallback.gen"
import "@wrappers/TestMarketplaceEscrowV2.gen"

get fun `test Marketplace V2 returns buyer funds only after Escrow confirms seller NFT return`() {
    val owner = testing.treasury("v2FailureOwner");
    val seller = testing.treasury("v2FailureSeller");
    val treasury = testing.treasury("v2FailureTreasury");
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

    val fakeEscrow = TestMarketplaceEscrowV2.fromStorage(NFTEscrowV2Storage {
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

    val rejector = RejectingMarketplaceCallback.fromStorage(RejectingMarketplaceCallbackStorage {
        controller: owner.address,
        escrow: fakeEscrow.address,
        rejectAction: true,
    });
    val buyer = rejector.address;

    expect(
        marketplace.deploy(owner.address, { value: grams("0.3") }),
    ).toHaveSuccessfulDeploy({ to: marketplace.address });
    expect(
        fakeEscrow.deploy(owner.address, { value: grams("0.3") }),
    ).toHaveSuccessfulDeploy({ to: fakeEscrow.address });

    expect(
        rejector.deploy(owner.address, { value: grams("0.3") }),
    ).toHaveSuccessfulDeploy({ to: rejector.address });

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

    // The test-only Escrow confirms custody, then deterministically reports
    // a failed NFT release so the Marketplace compensation state machine runs.
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
    expect(marketplace.productV2(1)!!.status).toEqual(2);
    expect(marketplace.productV2(1)!!.escrowId).toEqual(1);

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

    // The Marketplace must not settle seller/platform legs on failed delivery.
    // It first asks Escrow to return the NFT, then refunds the buyer only after
    // the exact EscrowRefundedV2 callback is received and acknowledged.
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

    // Marketplace accepts the three supported Fragment asset categories:
    // 1=username, 2=anonymous phone number, 3=collectible gift.
    val usernameItem = testing.treasury("v2FailureUsernameItem").address;
    val usernameCollection = testing.treasury("v2FailureUsernameCollection").address;
    val publishUsername = marketplace.sendPublishProductV2(
        seller.address,
        2,
        8,
        usernameItem,
        usernameCollection,
        4243,
        1,
        grams("5"),
        { value: grams("0.2") },
    );
    expect(publishUsername).toHaveSuccessfulTx();
    expect(marketplace.productV2(2)!!.status).toEqual(2);
    expect(marketplace.productV2(2)!!.extra.load().kind).toEqual(1);

    val numberItem = testing.treasury("v2FailureNumberItem").address;
    val numberCollection = testing.treasury("v2FailureNumberCollection").address;
    val publishNumber = marketplace.sendPublishProductV2(
        seller.address,
        3,
        9,
        numberItem,
        numberCollection,
        4244,
        2,
        grams("6"),
        { value: grams("0.2") },
    );
    expect(publishNumber).toHaveSuccessfulTx();
    expect(marketplace.productV2(3)!!.status).toEqual(2);
    expect(marketplace.productV2(3)!!.extra.load().kind).toEqual(2);
}
