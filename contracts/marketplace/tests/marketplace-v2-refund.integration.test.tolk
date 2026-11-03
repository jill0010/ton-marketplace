import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/tlb/maybe"
import "@acton/types/transaction"

import "@contracts/types"
import "@wrappers/MarketplaceV2.gen"
import "@wrappers/MockMarketplaceEscrowV2.gen"

get fun `test Marketplace V2 refunds buyer and retries seller NFT return independently after escrow failure`() {
    val owner = testing.treasury("marketplaceRefundOwner");
    val seller = testing.treasury("marketplaceRefundSeller");
    val buyer = testing.treasury("marketplaceRefundBuyer");
    val treasury = testing.treasury("marketplaceRefundTreasury");
    val nftItem = testing.treasury("marketplaceRefundNftItem");

    val marketplace = MarketplaceV2.fromStorage(MarketplaceV2Storage {
        owner: owner.address,
        escrow: owner.address,
        escrowConfigured: false,
        config: MarketplaceV2Config {
            treasury: owner.address,
            treasuryConfigured: false,
        }.toCell(),
        nextProductId: 1,
        nextQueryId: 1,
        nextOrderId: 1,
        nextOperationId: 1,
        listingMaps: MarketplaceV2ListingMaps {
            products: [],
            assetListings: [],
            queryToProduct: [],
            refundQueryToProduct: [],
        }.toCell(),
        orderMaps: MarketplaceV2OrderMaps {
            orders: [],
            payouts: [],
            releaseQueryToOrder: [],
            refundQueryToOrder: [],
        }.toCell(),
    });
    val escrow = MockMarketplaceEscrowV2.fromStorage(MockMarketplaceEscrowV2Storage {
        config: MockMarketplaceEscrowV2Config {
            owner: owner.address,
            marketplace: marketplace.address,
        }.toCell(),
        state: MockMarketplaceEscrowV2State {
            escrowId: 0,
            nftItem: owner.address,
            seller: owner.address,
            rejectRefund: true,
        }.toCell(),
    });

    expect(
        marketplace.deploy(owner.address, { value: grams("0.2") }),
    ).toHaveSuccessfulDeploy({ to: marketplace.address });
    expect(
        escrow.deploy(owner.address, { value: grams("0.2") }),
    ).toHaveSuccessfulDeploy({ to: escrow.address });

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
            treasury.address,
            { value: grams("0.02") },
        ),
    ).toHaveSuccessfulTx();

    // The mock acknowledges an escrow deposit so this test can focus on the
    // Marketplace's release-failure, refund, retry and idempotency state machine.
    expect(
        marketplace.sendPublishProductV2(
            seller.address,
            nftItem.address,
            owner.address,
            0,
            3,
            grams("4"),
            { value: grams("0.2") },
        ),
    ).toHaveSuccessfulTx();
    expect(marketplace.productV2(1)!!.status).toEqual(2);

    expect(
        marketplace.sendBuyProductV2(
            buyer.address,
            1,
            { value: grams("4.5") },
        ),
    ).toHaveSuccessfulTx();

    val orderAfterFailure = marketplace.orderV2(1);
    assert (orderAfterFailure != null) throw ErrorsV2.OrderNotFound;
    expect(orderAfterFailure!!.status).toEqual(MarketplaceV2OrderStatus.RefundPending);
    expect(orderAfterFailure.refundStatus).toEqual(MarketplaceV2RefundStatus.Pending);
    expect(orderAfterFailure.sellerReturnStatus).toEqual(MarketplaceV2SellerReturnStatus.ManualReview);
    expect(marketplace.productV2(1)!!.status).toEqual(6);

    val operations = orderAfterFailure.extra.load().operations.load();
    val refundPayout = marketplace.payoutV2(operations.buyerRefundOperationId);
    assert (refundPayout != null) throw ErrorsV2.InvalidPayout;
    expect(refundPayout!!.beneficiary).toEqual(buyer.address);
    expect(refundPayout.amount).toEqual(grams("4"));
    expect(refundPayout.status).toEqual(MarketplaceV2PayoutStatus.Pending);

    // Buyer refund dispatch is not blocked by the seller NFT-return retry.
    expect(
        marketplace.sendDispatchPayoutV2(
            buyer.address,
            operations.buyerRefundOperationId,
            { value: grams("0.05") },
        ),
    ).toHaveSuccessfulTx();
    expect(
        marketplace.orderV2(1)!!.refundStatus,
    ).toEqual(MarketplaceV2RefundStatus.Dispatched);
    expect(
        marketplace.orderV2(1)!!.status,
    ).toEqual(MarketplaceV2OrderStatus.RefundPending);

    // The seller retries the exact same escrow return query after the failed
    // request. Escrow confirms the NFT return and Marketplace closes the refund.
    expect(
        escrow.sendSetMockRejectRefundV2(
            owner.address,
            false,
            { value: grams("0.02") },
        ),
    ).toHaveSuccessfulTx();
    expect(escrow.rejectRefundV2()).toEqual(false);

    expect(
        marketplace.sendCancelProductV2(
            seller.address,
            1,
            { value: grams("0.1") },
        ),
    ).toHaveSuccessfulTx();

    val finalOrder = marketplace.orderV2(1);
    assert (finalOrder != null) throw ErrorsV2.OrderNotFound;
    expect(finalOrder!!.status).toEqual(MarketplaceV2OrderStatus.RefundDispatched);
    expect(finalOrder.refundStatus).toEqual(MarketplaceV2RefundStatus.Dispatched);
    expect(finalOrder.sellerReturnStatus).toEqual(MarketplaceV2SellerReturnStatus.Confirmed);
    expect(marketplace.productV2(1)!!.status).toEqual(5);
    expect(marketplace.assetProductIdV2(nftItem.address) == null).toEqual(true);
    expect(
        marketplace.payoutV2(operations.buyerRefundOperationId)!!.status,
    ).toEqual(MarketplaceV2PayoutStatus.Dispatched);
}
