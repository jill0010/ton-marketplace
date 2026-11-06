// Testnet-only candidate deployment. Never use on mainnet.
// Requires explicit V3_TESTNET_DEPLOY_APPROVED and matching deployer address.
// No collectible collections are enabled by this script.
import "@acton/build"
import "@acton/env"
import "@acton/io"
import "@acton/emulation/network"
import "@acton/emulation/scripts"
import "@contracts/TestMarketplaceReserveV3"
import "@contracts/TestReserveCoordinator"
import "@contracts/TestReserveVault"
import "@contracts/types"
import "@wrappers/MarketplaceV2.gen"
import "@wrappers/NFTEscrowV2.gen"

fun main() {
    assert (env<bool>("V3_TESTNET_DEPLOY_APPROVED") ?? false) throw 801;
    val expectedDeployer = env<address>("V3_TESTNET_DEPLOYER_ADDRESS");
    assert (expectedDeployer != null) throw 801;
    assert (scripts.wallet("deployer").address == expectedDeployer!!) throw 801;
    val deployer = scripts.wallet("deployer");
    // Mainnet can use one interactive TON Connect signer plus a public treasury
    // address. Emulation/testnet can keep using a separately configured wallet.
    val treasuryAddress = env<address>("PLATFORM_TREASURY_ADDRESS") ??
        scripts.wallet("treasury").address;

    if (deployer.address == treasuryAddress) {
        println("Deployment aborted: owner and platform treasury must be different wallets");
        return;
    }

    val initial = TestMarketplaceStorageV3 {
        owner: deployer.address,
        escrow: deployer.address,
        escrowConfigured: false,
        nextProductId: 1,
        nextQueryId: 1,
        products: [],
        assetListings: [],
        queryToProduct: [],
        purchaseStorage: TestPurchaseStorageV3 {
            coordinator: deployer.address,
            coordinatorConfigured: false,
            reserves: [],
            schemaVersion: 3,
            treasury: treasuryAddress,
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
    };
    val marketState: ContractState = {
        code: build("TestMarketplaceReserveV3"),
        data: initial.toCell(),
    };
    val marketDestination = AutoDeployAddress {
        workchain: 0,
        stateInit: marketState,
    };
    // Existing wire ABI is used for fixtures; storage and address are fresh V3.
    val marketplace = MarketplaceV2 {
        address: marketDestination.calculateAddress(),
        stateInit: marketState,
    };

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

    println("Deploying Marketplace V3 to {}", marketplace.address);
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
        treasuryAddress,
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
    if (!marketplace.treasuryConfiguredV2() || marketplace.treasuryV2() != treasuryAddress) {
        println("Marketplace V2 Treasury verification failed");
        return;
    }
    if (escrow.marketplace() != marketplace.address || escrow.owner() != deployer.address) {
        println("NFT Escrow V2 configuration verification failed");
        return;
    }

    println("Marketplace V3 testnet candidate deployed at {}", marketplace.address);
    println("NFT Escrow V2 deployed at {}", escrow.address);
    println("Marketplace owner: {}", deployer.address);
    println("Platform treasury: {}", treasuryAddress);
    println("Escrow binding and immutable treasury configuration verified");
    println("No collections are approved; listings remain unavailable until official collection policy is configured");
    val coordinatorState: ContractState = {
        code: build("TestReserveCoordinator"),
        data: TestReserveCoordinatorStorage {
            owner: deployer.address,
            marketplace: marketplace.address,
            vaultCode: build("TestReserveVault"),
            bindings: [],
        }.toCell(),
    };
    val coordinatorDestination = AutoDeployAddress {
        workchain: 0,
        stateInit: coordinatorState,
    };
    val coordinator = coordinatorDestination.calculateAddress();
    expect(
        net.send(
            deployer.address,
            createMessage({
                bounce: false,
                value: grams("0.1"),
                dest: coordinatorDestination,
            }),
        ),
    ).toHaveSuccessfulDeploy({ to: coordinator });
    expect(
        net.send(
            deployer.address,
            createMessage({
                bounce: false,
                value: grams("0.05"),
                dest: marketplace.address,
                body: SetTestReserveCoordinator { coordinator },
            }),
        ),
    ).toHaveSuccessfulTx({ to: marketplace.address });
    println("V3 testnet candidate marketplace: {}", marketplace.address);
    println("V3 testnet candidate escrow: {}", escrow.address);
    println("V3 testnet candidate coordinator: {}", coordinator);
    println("No collection allowlist configured; not a mainnet release.");
}
