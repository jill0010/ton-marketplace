import "@acton/env"
import "@acton/io"
import "@acton/emulation/network"
import "@contracts/types"
import "@wrappers/MarketplaceV2.gen"

// Strictly read-only: never sends an internal message or deploys contracts.
fun main() {
    val marketplaceAddress = env<address>("V3_PRODUCTION_TESTNET_MARKETPLACE_ADDRESS");
    val coordinatorAddress = env<address>("V3_PRODUCTION_TESTNET_COORDINATOR_ADDRESS");
    val nftItem = env<address>("V3_TESTNET_FIXTURE_NFT_ADDRESS");
    assert (marketplaceAddress != null && coordinatorAddress != null && nftItem != null) throw 951;

    val marketplace = MarketplaceV2 { address: marketplaceAddress! };
    val productId = marketplace.assetProductIdV2(nftItem!!);
    println("V3_DIAGNOSTIC_PRODUCT_ID: {}", productId);
    assert (productId != null) throw 952;

    val status = marketplace.productStatusV2(productId!!);
    println("V3_DIAGNOSTIC_PRODUCT_STATUS: {}", status);
    // The fresh-fixture mode is strictly getter-only and must not apply the
    // historical transaction's hard-coded buyer, deadline or query ID.
    if (env<bool>("V3_INSPECT_FRESH_FIXTURE") ?? false) {
        val listing = marketplace.productV2(productId!!);
        assert (listing != null) throw 953;
        println("V3_FRESH_PRODUCT_PRICE_NANOTON: {}", listing!!.price);
        println("V3_FRESH_PRODUCT_ESCROW_ID: {}", listing!!.escrowId);
        println("V3_FRESH_PRODUCT_NFT_MATCHES: {}", listing!!.nftItem == nftItem!!);
        println("V3_FRESH_TREASURY_CONFIGURED: {}", marketplace.treasuryConfiguredV2());
        println("V3_FRESH_ESCROW_CONFIGURED: {}", marketplace.escrowConfiguredV2());
        println("V3_FRESH_COORDINATOR_CONFIGURED: {}", net.runGetMethod<bool>(marketplace.address, "marketplaceReserveCoordinatorConfiguredV3"));
        val nft = net.runGetMethod<tuple>(nftItem!!, "get_nft_data");
        val nftOwner = nft.get(3) as address;
        println("V3_FRESH_NFT_OWNER: {}", nftOwner);
        val escrowOwnerMatches = nftOwner == marketplace.escrowV2();
        val listingIsReady = status != null && status!! == 2 &&
            listing!!.nftItem == nftItem!! &&
            listing!!.price == grams("0.01") &&
            listing!!.escrowId > 0 &&
            marketplace.treasuryConfiguredV2() &&
            marketplace.escrowConfiguredV2() &&
            net.runGetMethod<bool>(marketplace.address, "marketplaceReserveCoordinatorConfiguredV3") &&
            escrowOwnerMatches;
        println("V3_FRESH_ESCROW_OWNS_NFT: {}", escrowOwnerMatches);
        println("V3_FRESH_LISTING_READY_FOR_CONTROLLED_TEST: {}", listingIsReady);
        val freshOrderId = marketplace.orderIdForProductV2(productId!!);
        println("V3_FRESH_ORDER_ID: {}", freshOrderId);
        if (freshOrderId == null) {
            println("V3_FRESH_RESULT: LISTED_WITHOUT_ORDER. Purchase step did not run; do not replay a payment automatically.");
            assert (listingIsReady) throw 954;
            return;
        }
        val orderCell = marketplace.orderCellV2(freshOrderId!!);
        println("V3_FRESH_ORDER_CELL_EXISTS: {}", orderCell != null);
        if (orderCell == null) {
            println("V3_FRESH_RESULT: ORDER_INDEX_WITHOUT_CELL. Read-only inspection stopped.");
            return;
        }
        val order = MarketplaceV2Order.fromCell(orderCell!!);
        println("V3_FRESH_ORDER_STATUS: {}", order.status);
        println("V3_FRESH_DELIVERY_STATUS: {}", order.deliveryStatus);
        println("V3_FRESH_SELLER_PAYOUT_STATUS: {}", order.sellerPayoutStatus);
        println("V3_FRESH_PLATFORM_PAYOUT_STATUS: {}", order.platformPayoutStatus);
        println("V3_FRESH_MARKETPLACE_RESERVE_STATUS: {}", net.runGetMethod<uint8>(marketplace.address, "marketplaceReserveStatusV3", [freshOrderId!!]));
        println("V3_FRESH_COORDINATOR_RESERVE_STATUS: {}", net.runGetMethod<uint8>(coordinatorAddress!!, "reserveCoordinatorStatusV3", [freshOrderId!!]));
        println("V3_FRESH_COORDINATOR_VAULT: {}", net.runGetMethod<address?>(coordinatorAddress!!, "reserveCoordinatorVaultV3", [freshOrderId!!]));
        println("V3_FRESH_RESULT: ORDER_EXISTS. Getter-only inspection complete; settlement is not attested.");
        return;
    }
    // Compare the exact historical BuyProductV2 fields with persisted state.
    // This is a getter-only preflight; no new purchase or transfer is sent.
    val productResult = marketplace.productV2(productId!!);
    assert (productResult != null) throw 953;
    val product = productResult!!;
    val historicalBuyer = env<address>("PLATFORM_TREASURY_ADDRESS");
    val historicalSeller = env<address>("V3_TESTNET_DEPLOYER_ADDRESS");
    val historicalQueryId: uint64 = 8005;
    val nextQueryId = marketplace.nextQueryIdV2();
    val refundQueryId = nextQueryId + 3;
    // Historical trace: 2026-11-07 15:46:42 UTC; deadline 1794067298.
    // These values are fixed evidence, not a new transaction request.
    val historicalCreatedAt: int = 1794066402;
    val historicalDeadline: int = 1794067298;
    val historicalDeadlineMargin = historicalCreatedAt + 900 - historicalDeadline;
    println("V3_DIAGNOSTIC_HISTORICAL_DEADLINE_VALID: {}", historicalDeadline >= historicalCreatedAt && historicalDeadline <= historicalCreatedAt + 900);
    println("V3_DIAGNOSTIC_HISTORICAL_DEADLINE_MARGIN_SECONDS: {}", historicalDeadlineMargin);
    println("V3_DIAGNOSTIC_HISTORICAL_DEADLINE_NEAR_LIMIT: {}", historicalDeadlineMargin >= 0 && historicalDeadlineMargin <= 30);
    println("V3_DIAGNOSTIC_PRODUCT_ID_MATCHES: {}", product.id == productId!!);
    println("V3_DIAGNOSTIC_BUYER_EQUALS_NFT_ITEM: {}", historicalBuyer != null && historicalBuyer!! == product.nftItem);
    println("V3_DIAGNOSTIC_PRODUCT_NFT_MATCHES_FIXTURE: {}", product.nftItem == nftItem!!);
    println("V3_DIAGNOSTIC_SELLER: {}", product.seller);
    println("V3_DIAGNOSTIC_PRICE_NANOTON: {}", product.price);
    println("V3_DIAGNOSTIC_ESCROW_ID: {}", product.escrowId);
    println("V3_DIAGNOSTIC_NEXT_QUERY_ID: {}", nextQueryId);
    println("V3_DIAGNOSTIC_HISTORICAL_QUERY_ID: {}", historicalQueryId);
    println("V3_DIAGNOSTIC_REQUIRED_MIN_PAYMENT_QUERY_ID_EXCLUSIVE: {}", refundQueryId);
    println("V3_DIAGNOSTIC_HISTORICAL_QUERY_VALID: {}", historicalQueryId > refundQueryId);
    println("V3_DIAGNOSTIC_PRICE_VALID: {}", product.price == grams("0.01"));
    // The existing Testnet deployment predates the newly added V3 getters.
    // Never call those getters here: unknown method errors abort the entire
    // read-only script and conceal the original preflight diagnostics.
    println("V3_DIAGNOSTIC_PURCHASE_SCHEMA_STATUS: unavailable_on_existing_deployment");
    println("V3_DIAGNOSTIC_HISTORICAL_PAYMENT_QUERY_STATUS: unavailable_on_existing_deployment");
    println("V3_DIAGNOSTIC_CODE_VERSION_MISMATCH: unverified_by_getter_coverage");
    println("V3_DIAGNOSTIC_GETTER_COVERAGE: legacy deployment does not expose newer schema/query introspection getters; this alone does not prove a code-hash mismatch");
    println("V3_DIAGNOSTIC_NEXT_STEP: inspect the exact inbound transaction timestamp and query-index state; the four-second deadline margin is a high-priority InvalidPurchase candidate");

    println("V3_DIAGNOSTIC_TREASURY_CONFIGURED: {}", marketplace.treasuryConfiguredV2());
    println("V3_DIAGNOSTIC_ESCROW_CONFIGURED: {}", marketplace.escrowConfiguredV2());
    println("V3_DIAGNOSTIC_COORDINATOR_CONFIGURED: {}", net.runGetMethod<bool>(marketplace.address, "marketplaceReserveCoordinatorConfiguredV3"));
    if (historicalBuyer != null && historicalSeller != null) {
        println("V3_DIAGNOSTIC_BUYER_EQUALS_SELLER: {}", historicalBuyer!! == product.seller);
        println("V3_DIAGNOSTIC_EXPECTED_SELLER_MATCHES: {}", historicalSeller!! == product.seller);
        println("V3_DIAGNOSTIC_BUYER_EQUALS_ESCROW: {}", historicalBuyer!! == marketplace.escrowV2());
        println("V3_DIAGNOSTIC_BUYER_EQUALS_MARKETPLACE: {}", historicalBuyer!! == marketplace.address);
    }
    val orderId = marketplace.orderIdForProductV2(productId!!);
    println("V3_DIAGNOSTIC_ORDER_ID: {}", orderId);
    if (orderId == null) {
        println("V3_DIAGNOSTIC_RESULT: No order exists for this NFT listing. Inspect the purchase transaction's Marketplace inbound execution and bounce before sending any more funds.");
        return;
    }

    val orderCell = marketplace.orderCellV2(orderId!!);
    println("V3_DIAGNOSTIC_ORDER_CELL_EXISTS: {}", orderCell != null);
    if (orderCell == null) {
        println("V3_DIAGNOSTIC_RESULT: Product-to-order index exists, but order cell is missing.");
        return;
    }

    val order = MarketplaceV2Order.fromCell(orderCell!!);
    println("V3_DIAGNOSTIC_ORDER_STATUS: {}", order.status);
    println("V3_DIAGNOSTIC_DELIVERY_STATUS: {}", order.deliveryStatus);
    println("V3_DIAGNOSTIC_SELLER_PAYOUT_STATUS: {}", order.sellerPayoutStatus);
    println("V3_DIAGNOSTIC_PLATFORM_PAYOUT_STATUS: {}", order.platformPayoutStatus);

    val marketplaceReserveStatus = net.runGetMethod<uint8>(
        marketplace.address,
        "marketplaceReserveStatusV3",
        [orderId!!],
    );
    val marketplaceVault = net.runGetMethod<address?>(
        marketplace.address,
        "marketplaceReserveVaultV3",
        [orderId!!],
    );
    val coordinatorStatus = net.runGetMethod<uint8>(
        coordinatorAddress!!,
        "reserveCoordinatorStatusV3",
        [orderId!!],
    );
    val coordinatorVault = net.runGetMethod<address?>(
        coordinatorAddress!!,
        "reserveCoordinatorVaultV3",
        [orderId!!],
    );
    println("V3_DIAGNOSTIC_MARKETPLACE_RESERVE_STATUS: {}", marketplaceReserveStatus);
    println("V3_DIAGNOSTIC_COORDINATOR_RESERVE_STATUS: {}", coordinatorStatus);
    println("V3_DIAGNOSTIC_MARKETPLACE_VAULT: {}", marketplaceVault);
    println("V3_DIAGNOSTIC_COORDINATOR_VAULT: {}", coordinatorVault);
    println("V3_DIAGNOSTIC_RESULT: Read-only status collection completed; this does not attest settlement.");
}
