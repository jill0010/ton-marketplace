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
