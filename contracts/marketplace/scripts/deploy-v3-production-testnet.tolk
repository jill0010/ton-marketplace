// Production V3 contracts: explicit Testnet-only deployment.
import "@acton/build"
import "@acton/env"
import "@acton/io"
import "@acton/emulation/network"
import "@acton/emulation/scripts"
import "@contracts/MarketplaceReserveV3"
import "@contracts/ReserveCoordinatorV3"
import "@contracts/ReserveVaultV3"
import "@contracts/SettlementAttestationVerifierV3"
import "@contracts/types"
import "@wrappers/MarketplaceV2.gen"
import "@wrappers/NFTEscrowV2.gen"

fun main() {
    assert (env<bool>("V3_PRODUCTION_TESTNET_DEPLOY_APPROVED") ?? false) throw 821;
    val expectedDeployer = env<address>("V3_TESTNET_DEPLOYER_ADDRESS");
    assert (expectedDeployer != null) throw 821;
    val deployer = scripts.wallet("deployer");
    assert (deployer.address == expectedDeployer!) throw 821;
    val treasuryAddress = env<address>("PLATFORM_TREASURY_ADDRESS") ??
        scripts.wallet("treasury").address;
    assert (deployer.address != treasuryAddress) throw 822;

    val validator0 = env<uint256>("V3_VALIDATOR_0_PUBLIC_KEY");
    val validator1 = env<uint256>("V3_VALIDATOR_1_PUBLIC_KEY");
    val validator2 = env<uint256>("V3_VALIDATOR_2_PUBLIC_KEY");
    assert (validator0 != null && validator1 != null && validator2 != null) throw 823;
    assert (
        validator0!! != validator1!! &&
        validator0!! != validator2!! &&
        validator1!! != validator2!!
    ) throw 823;

    val initial = MarketplaceReserveStorageV3 {
        owner: deployer.address,
        escrow: deployer.address,
        escrowConfigured: false,
        nextProductId: 1,
        nextQueryId: 1,
        products: [],
        assetListings: [],
        queryToProduct: [],
        purchaseStorage: MarketplaceReservePurchaseStorageV3 {
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
    val marketCode = build("MarketplaceReserveV3");
    val marketState: ContractState = { code: marketCode, data: initial.toCell() };
    val marketDestination = AutoDeployAddress {
        workchain: 0,
        stateInit: marketState,
    };
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

    val verifierState: ContractState = {
        code: build("SettlementAttestationVerifierV3"),
        data: SettlementVerifierStorageV3 {
            owner: deployer.address,
            marketplace: marketplace.address,
            networkGlobalId: -3,
            epoch: 1,
            threshold: 2,
            validatorKeys: [
                0: validator0!!,
                1: validator1!!,
                2: validator2!!,
            ],
            consumedStatements: [],
        }.toCell(),
    };
    val verifierDestination = AutoDeployAddress {
        workchain: 0,
        stateInit: verifierState,
    };
    val verifier = verifierDestination.calculateAddress();

    val coordinatorState: ContractState = {
        code: build("ReserveCoordinatorV3"),
        data: ReserveCoordinatorStorageV3 {
            owner: deployer.address,
            marketplace: marketplace.address,
            verifier,
            vaultCode: build("ReserveVaultV3"),
            bindings: [],
        }.toCell(),
    };
    val coordinatorDestination = AutoDeployAddress {
        workchain: 0,
        stateInit: coordinatorState,
    };
    val coordinator = coordinatorDestination.calculateAddress();

    println("Marketplace V3 code hash: {}", marketCode.hash());
    println("Reserve Vault V3 code hash: {}", build("ReserveVaultV3").hash());
    println("Reserve Coordinator V3 code hash: {}", build("ReserveCoordinatorV3").hash());
    println("Settlement Verifier V3 code hash: {}", build("SettlementAttestationVerifierV3").hash());

    val marketDeploy = marketplace.deploy(deployer.address, { value: grams("0.6") });
    if (marketDeploy.waitForFirstTransaction() == null) {
        println("Production Marketplace V3 deployment failed");
        throw 824;
    }
    val escrowDeploy = escrow.deploy(deployer.address, { value: grams("0.6") });
    if (escrowDeploy.waitForFirstTransaction() == null) {
        println("NFT Escrow V2 deployment failed");
        throw 825;
    }

    val verifierDeploy = net.send(
        deployer.address,
        createMessage({
            bounce: false,
            value: grams("0.2"),
            dest: verifierDestination,
        }),
    );
    if (verifierDeploy.waitForFirstTransaction() == null) {
        println("Settlement verifier deployment transaction missing");
        throw 826;
    }

    val coordinatorDeploy = net.send(
        deployer.address,
        createMessage({
            bounce: false,
            value: grams("0.3"),
            dest: coordinatorDestination,
        }),
    );
    if (coordinatorDeploy.waitForFirstTransaction() == null) {
        println("Reserve coordinator deployment transaction missing");
        throw 827;
    }

    val configureEscrow = marketplace.sendSetMarketplaceV2Escrow(
        deployer.address,
        escrow.address,
        { value: grams("0.05") },
    );
    if (configureEscrow.waitForFirstTransaction() == null) throw 828;

    val configureTreasury = marketplace.sendSetMarketplaceV2Treasury(
        deployer.address,
        treasuryAddress,
        { value: grams("0.05") },
    );
    if (configureTreasury.waitForFirstTransaction() == null) throw 829;

    val configureCoordinator = net.send(
        deployer.address,
        createMessage({
            bounce: BounceMode.RichBounce,
            value: grams("0.05"),
            dest: marketplace.address,
            body: SetReserveCoordinatorV3 { coordinator }.toCell(),
        }),
    );
    if (configureCoordinator.waitForFirstTransaction() == null) throw 830;

    assert (marketplace.escrowV2() == escrow.address) throw 831;
    assert (marketplace.escrowConfiguredV2()) throw 831;
    assert (marketplace.treasuryV2() == treasuryAddress) throw 832;
    assert (marketplace.treasuryConfiguredV2()) throw 832;
    assert (escrow.marketplace() == marketplace.address) throw 833;
    assert (escrow.owner() == deployer.address) throw 833;
    assert (net.runGetMethod<address>(coordinator, "reserveCoordinatorMarketplaceV3") == marketplace.address) throw 834;
    assert (net.runGetMethod<address>(coordinator, "reserveCoordinatorVerifierV3") == verifier) throw 834;
    assert (net.runGetMethod<uint32>(verifier, "verifierEpoch") == 1) throw 835;
    assert (net.runGetMethod<int32>(verifier, "verifierNetwork") == -3) throw 835;
    assert (net.runGetMethod<uint8>(verifier, "verifierThreshold") == 2) throw 835;

    println("PRODUCTION V3 TESTNET deployment and immutable bindings verified.");
    println("Marketplace V3: {}", marketplace.address);
    println("NFT Escrow V2: {}", escrow.address);
    println("Reserve Coordinator V3: {}", coordinator);
    println("Settlement Verifier V3: {}", verifier);
    println("Platform treasury: {}", treasuryAddress);
    println("Network: Testnet (-3). No Mainnet deployment or transaction.");
    println("Collection allowlist remains disabled pending official collection configuration.");
}
