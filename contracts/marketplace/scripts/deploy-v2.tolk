import "@acton/io"
import "@acton/emulation/network"
import "@acton/emulation/scripts"

import "@contracts/types"
import "@wrappers/MarketplaceV2.gen"
import "@wrappers/NFTEscrowV2.gen"

fun main() {
    val deployer = scripts.wallet("deployer");

    val marketplace = MarketplaceV2.fromStorage(MarketplaceV2Storage {
        owner: deployer.address,
        escrow: deployer.address,
        escrowConfigured: false,
        nextProductId: 1,
        nextQueryId: 1,
        products: [],
        assetListings: [],
        queryToProduct: [],
        purchaseStorage: MarketplaceV2PurchaseStorage {
            schemaVersion: 2,
            treasury: deployer.address,
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

    val escrow = NFTEscrowV2.fromStorage(NFTEscrowV2Storage {
        owner: deployer.address,
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

    println("Deploying Marketplace V2 to {}", marketplace.address);
    val marketplaceRes = marketplace.deploy(
        deployer.address,
        { value: grams("0.5") },
    );
    if (marketplaceRes.waitForFirstTransaction() == null) {
        println("Marketplace V2 deployment failed");
        return;
    }

    println("Deploying NFT Escrow V2 to {}", escrow.address);
    val escrowRes = escrow.deploy(
        deployer.address,
        { value: grams("0.5") },
    );
    if (escrowRes.waitForFirstTransaction() == null) {
        println("NFT Escrow V2 deployment failed");
        return;
    }

    val configureEscrow = marketplace.sendSetMarketplaceV2Escrow(
        deployer.address,
        escrow.address,
        { value: grams("0.05") },
    );
    if (configureEscrow.waitForFirstTransaction() == null) {
        println("Marketplace V2 Escrow configuration failed");
        return;
    }

    val configureTreasury = marketplace.sendSetMarketplaceV2Treasury(
        deployer.address,
        deployer.address,
        { value: grams("0.05") },
    );
    if (configureTreasury.waitForFirstTransaction() == null) {
        println("Marketplace V2 Treasury configuration failed");
        return;
    }

    if (!marketplace.escrowConfiguredV2() || marketplace.escrowV2() != escrow.address) {
        println("Marketplace V2 Escrow verification failed");
        return;
    }
    if (!marketplace.treasuryConfiguredV2() || marketplace.treasuryV2() != deployer.address) {
        println("Marketplace V2 Treasury verification failed");
        return;
    }
    if (escrow.marketplace() != marketplace.address || escrow.owner() != deployer.address) {
        println("NFT Escrow V2 configuration verification failed");
        return;
    }

    println("Marketplace V2 deployed at {}", marketplace.address);
    println("NFT Escrow V2 deployed at {}", escrow.address);
    println("Marketplace owner and treasury: {}", deployer.address);
    println("Escrow binding and immutable treasury configuration verified");
    println("No collections are approved; listings remain unavailable until official collection policy is configured");
}
