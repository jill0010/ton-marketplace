import "@acton/io"
import "@acton/emulation/network"
import "@acton/emulation/scripts"

import "@contracts/types"
import "@wrappers/Marketplace.gen"
import "@wrappers/NFTEscrow.gen"

fun main() {
    val deployer = scripts.wallet("deployer");

    val marketplace = Marketplace.fromStorage({
        owner: deployer.address,
        escrow: deployer.address,
        escrowConfigured: false,
        nextProductId: 1,
        nextOrderId: 1,
        products: [],
        assetListings: [],
        orders: [],
    });

    println("Deploying Marketplace to {}", marketplace.address);

    val marketplaceRes = marketplace.deploy(
        deployer.address,
        { value: grams("0.05") },
    );

    if (marketplaceRes.waitForFirstTransaction() == null) {
        println("Marketplace deployment failed");
        return;
    }

    println("Marketplace deployed at {}", marketplace.address);

    val escrow = NFTEscrow.fromStorage({
        owner: deployer.address,
        marketplace: marketplace.address,
        paused: true,
        nextEscrowId: 1,
        records: [],
        collectionStorage: CollectionStorage {
            collections: [],
            collectionItemCodes: [],
        }.toCell(),
        queryToEscrow: [],
        callbackStorage: EscrowCallbackStorage {
            refundCallbacks: [],
            depositCallbacks: [],
        }.toCell(),
    });

    println("Deploying NFTEscrow to {}", escrow.address);

    val escrowRes = escrow.deploy(
        deployer.address,
        { value: grams("0.05") },
    );

    if (escrowRes.waitForFirstTransaction() == null) {
        println("NFTEscrow deployment failed");
        return;
    }

    println("NFTEscrow deployed at {}", escrow.address);

    // 配置 Marketplace 指向本次部署的 NFTEscrow
    println("Configuring Marketplace Escrow address");

    val configureRes = marketplace.sendSetEscrowAddress(
        deployer.address,
        escrow.address,
        { value: grams("0.05") },
    );

    if (configureRes.waitForFirstTransaction() == null) {
        println("Marketplace Escrow address configuration failed");
        return;
    }

    // 双重核验：配置标志必须开启，地址必须与本次部署的 Escrow 一致
    if (!marketplace.escrowConfigured()) {
        println("Escrow configuration verification failed: escrowConfigured is false");
        return;
    }

    if (marketplace.escrow() != escrow.address) {
        println("Escrow configuration verification failed: address mismatch");
        return;
    }

    println("Marketplace Escrow address configured and verified");
    println("Owner is {}", escrow.owner());
    println("Marketplace is {}", escrow.marketplace());
    println("Initial escrow status: PAUSED");
    println("Deployment and configuration completed successfully");
    println("Escrow remains paused. Configure and verify Collection whitelist before unpausing.");
}
