// Production V3 Mainnet deployment. Interactive signer only; do not use CI wallet seeds.
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
import "@wrappers/NFTEscrowV2Testnet.gen"

fun main() {
    assert (env<bool>("V3_MAINNET_DEPLOY_APPROVED") ?? false) throw 821;
    val expectedDeployer = env<address>("V3_MAINNET_DEPLOYER_ADDRESS");
    assert (expectedDeployer != null) throw 821;
    val deployer = scripts.wallet("deployer");
    // Mainnet wallet and public treasury must be supplied explicitly.
    assert (deployer.address == expectedDeployer!) throw 821;
    val treasuryAddress = env<address>("PLATFORM_TREASURY_ADDRESS");
    assert (treasuryAddress != null) throw 822;
    assert (deployer.address != treasuryAddress!) throw 822;

    val validator0 = env<int>("V3_VALIDATOR_0_PUBLIC_KEY");
    val validator1 = env<int>("V3_VALIDATOR_1_PUBLIC_KEY");
    val validator2 = env<int>("V3_VALIDATOR_2_PUBLIC_KEY");
    assert (validator0 != null && validator1 != null && validator2 != null) throw 823;
    assert (
        validator0!! != validator1!! &&
        validator0!! != validator2!! &&
        validator1!! != validator2!!
    ) throw 823;

    // A fresh funded validation must never resolve to the historical deterministic address.
    // A unique GitHub run ID seeds the initial query counter and therefore StateInit.
    val freshNonce = env<int>("V3_MAINNET_DEPLOYMENT_NONCE") ?? 1;
    assert (freshNonce > 0 && freshNonce < 9223372036854775807) throw 839;
    println("Mainnet deployer: {}", deployer.address);
    println("Mainnet treasury: {}", treasuryAddress!);
    val initial = MarketplaceReserveStorageV3 {
        owner: deployer.address,
        escrow: deployer.address,
        escrowConfigured: false,
        nextProductId: 1,
        nextQueryId: freshNonce,
        products: [],
        assetListings: [],
        queryToProduct: [],
        purchaseStorage: MarketplaceReservePurchaseStorageV3 {
            coordinator: deployer.address,
            coordinatorConfigured: false,
            reserves: [],
            schemaVersion: 3,
            treasury: treasuryAddress!,
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

    val escrow = NFTEscrowV2Testnet.fromStorage(NFTEscrowV2Storage {
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

    var validatorKeys: map<uint8, uint256> = [];
    validatorKeys.set(0, validator0!! as uint256);
    validatorKeys.set(1, validator1!! as uint256);
    validatorKeys.set(2, validator2!! as uint256);
    val verifierState: ContractState = {
        code: build("SettlementAttestationVerifierV3"),
        data: SettlementVerifierStorageV3 {
            owner: deployer.address,
            marketplace: marketplace.address,
            networkGlobalId: -239,
            epoch: 1,
            threshold: 2,
            validatorKeys,
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

    println("V3 trusted compiled marketplace code hash: {}", marketCode.hash());
    println("V3 trusted compiled escrow code hash: {}", build("NFTEscrowV2Testnet").hash());
    println("V3 trusted compiled vault code hash: {}", build("ReserveVaultV3").hash());
    println("V3 trusted compiled coordinator code hash: {}", build("ReserveCoordinatorV3").hash());
    println("V3 trusted compiled verifier code hash: {}", build("SettlementAttestationVerifierV3").hash());

    val marketDeploy = marketplace.deploy(deployer.address, { value: grams("0.4") });
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
            value: grams("0.1"),
            dest: coordinatorDestination,
        }),
    );
    if (coordinatorDeploy.waitForFirstTransaction() == null) {
        println("Reserve coordinator deployment transaction missing");
        throw 827;
    }

    // Send the canonical V2 escrow-binding message directly. This avoids
    // relying on a wrapper generated for the legacy MarketplaceV2 artifact
    // while the destination is the production MarketplaceReserveV3 code.
    val configureEscrow = net.send(
        deployer.address,
        createMessage({
            bounce: BounceMode.RichBounce,
            value: grams("0.05"),
            dest: marketplace.address,
            body: SetMarketplaceV2Escrow { escrow: escrow.address }.toCell(),
        }),
    );
    // Await the full wallet -> Marketplace trace before reading persisted state.
    configureEscrow.waitForTrace();

    val configureTreasury = marketplace.sendSetMarketplaceV2Treasury(
        deployer.address,
        treasuryAddress!,
        { value: grams("0.05") },
    );
    // Treasury configuration is also asynchronous from the external wallet.
    configureTreasury.waitForTrace();

    val configureCoordinator = net.send(
        deployer.address,
        createMessage({
            bounce: BounceMode.RichBounce,
            value: grams("0.05"),
            dest: marketplace.address,
            body: SetReserveCoordinatorV3 { coordinator }.toCell(),
        }),
    );
    // Wait for Marketplace to process SetReserveCoordinatorV3, not merely
    // for the deployer wallet's external message to be accepted.
    configureCoordinator.waitForTrace();

    // Print persisted configuration in small groups because Acton println
    // supports at most six total arguments per call.
    println(
        "V3 binding diagnostics: owner={}, escrow={}, escrowConfigured={}, treasury={}, treasuryConfigured={}",
        marketplace.ownerV2(),
        marketplace.escrowV2(),
        marketplace.escrowConfiguredV2(),
        marketplace.treasuryV2(),
        marketplace.treasuryConfiguredV2(),
    );
    println(
        "V3 coordinator diagnostics: coordinator={}, coordinatorConfigured={}",
        net.runGetMethod<address>(marketplace.address, "marketplaceReserveCoordinatorV3"),
        net.runGetMethod<bool>(marketplace.address, "marketplaceReserveCoordinatorConfiguredV3"),
    );
    val storedEscrowAddress = marketplace.escrowV2();
    val escrowAddressMatches = storedEscrowAddress == escrow.address;
    val escrowMatchesDeployer = storedEscrowAddress == deployer.address;
    val escrowMatchesMarketplace = storedEscrowAddress == marketplace.address;
    val escrowMatchesCoordinator = storedEscrowAddress == coordinator;
    val escrowMatchesVerifier = storedEscrowAddress == verifier;
    val escrowMatchesTreasury = storedEscrowAddress == treasuryAddress!;
    val escrowContractPointsToMarketplace = escrow.marketplace() == marketplace.address;
    println(
        "V3 escrow identity diagnostics: storedMatchesDeployer={}, storedMatchesMarketplace={}, storedMatchesCoordinator={}, storedMatchesVerifier={}, storedMatchesTreasury={}",
        escrowMatchesDeployer,
        escrowMatchesMarketplace,
        escrowMatchesCoordinator,
        escrowMatchesVerifier,
        escrowMatchesTreasury,
    );
    println(
        "V3 escrow address values: expected={}, stored={}, escrowContractMarketplace={}",
        escrow.address,
        storedEscrowAddress,
        escrowContractPointsToMarketplace,
    );
    val escrowIsConfigured = marketplace.escrowConfiguredV2();
    val treasuryAddressMatches = marketplace.treasuryV2() == treasuryAddress!;
    val treasuryIsConfigured = marketplace.treasuryConfiguredV2();
    println(
        "V3 binding comparison diagnostics: escrowAddressMatches={}, escrowIsConfigured={}, treasuryAddressMatches={}, treasuryIsConfigured={}",
        escrowAddressMatches,
        escrowIsConfigured,
        treasuryAddressMatches,
        treasuryIsConfigured,
    );
    // Keep address mismatch and configuration-flag failures distinguishable.
    assert (escrowAddressMatches) throw 837;
    assert (escrowIsConfigured) throw 831;
    assert (treasuryAddressMatches) throw 838;
    assert (treasuryIsConfigured) throw 832;
    assert (net.runGetMethod<address>(marketplace.address, "marketplaceReserveCoordinatorV3") == coordinator) throw 836;
    assert (net.runGetMethod<bool>(marketplace.address, "marketplaceReserveCoordinatorConfiguredV3")) throw 836;
    assert (escrow.marketplace() == marketplace.address) throw 833;
    assert (escrow.owner() == deployer.address) throw 833;
    assert (net.runGetMethod<address>(coordinator, "reserveCoordinatorMarketplaceV3") == marketplace.address) throw 834;
    assert (net.runGetMethod<address>(coordinator, "reserveCoordinatorVerifierV3") == verifier) throw 834;
    assert (net.runGetMethod<uint32>(verifier, "verifierEpoch") == 1) throw 835;
    assert (net.runGetMethod<int32>(verifier, "verifierNetwork") == -3) throw 835;
    assert (net.runGetMethod<uint8>(verifier, "verifierThreshold") == 2) throw 835;

    println("PRODUCTION V3 MAINNET deployment and immutable bindings verified.");
    println("V3 mainnet marketplace: {}", marketplace.address);
    println("V3 mainnet escrow: {}", escrow.address);
    println("V3 mainnet coordinator: {}", coordinator);
    println("V3 mainnet verifier: {}", verifier);
    println("Platform treasury: {}", treasuryAddress!);
    println("Network: Mainnet (-239). Mainnet deployment requires explicit interactive wallet signing.");
    println("Collection allowlist remains disabled pending official collection configuration.");
}
