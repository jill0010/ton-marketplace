import "@acton/io"
import "@acton/emulation/network"
import "@acton/emulation/scripts"

import "@contracts/types"
import "@wrappers/Marketplace.gen"
import "@wrappers/NFTEscrow.gen"

fun main() {
    val deployer = scripts.wallet("deployer");

    // 第一步：初始化并部署 Marketplace
    val marketplace = Marketplace.fromStorage({
        owner: deployer.address,
        nextProductId: 1,
        nextOrderId: 1,
        products: [],
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

    // 第二步：初始化 NFTEscrow
    // 初始暂停，Collection 白名单为空
    val escrow = NFTEscrow.fromStorage({
        owner: deployer.address,
        marketplace: marketplace.address,
        paused: true,
        nextEscrowId: 1,
        records: [],
        collections: [],
        queryToEscrow: [],
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
    println("Owner is {}", escrow.owner());
    println("Marketplace is {}", escrow.marketplace());
    println("Initial escrow status: PAUSED");
}
