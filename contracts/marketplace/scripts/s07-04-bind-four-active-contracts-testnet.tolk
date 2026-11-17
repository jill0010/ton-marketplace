// S07-04 binding only: all four contracts already active. TESTNET ONLY.
// S07-04 TESTNET FIXTURE ONLY. Never use on mainnet.
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
import "@wrappers/NFTEscrowV2Testnet.gen"

fun main() {
    assert (env<bool>("S07_04_TESTNET_BINDING_ONLY_APPROVED") ?? false) throw 821;
    val expectedDeployer = env<address>("V3_TESTNET_DEPLOYER_ADDRESS");
    assert (expectedDeployer != null) throw 821;
    val deployer = scripts.wallet("deployer");
    assert (deployer.address == expectedDeployer!) throw 821;
    val treasuryAddress = env<address>("PLATFORM_TREASURY_ADDRESS") ??
        scripts.wallet("treasury").address;
    assert (deployer.address != treasuryAddress) throw 822;

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
    val freshNonce = env<int>("V3_FRESH_DEPLOYMENT_NONCE") ?? 43828407746;
    assert (freshNonce == 43828407746) throw 839;
    assert (freshNonce > 0 && freshNonce < 9223372036854775807) throw 839;
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
            networkGlobalId: -3,
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
            networkGlobalId: -3,
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

    // Recover the ALREADY ACTIVE Marketplace from run 43828407746.
    // Never deploy a second Marketplace or overwrite its existing state.
    val expectedMarket = env<address>("S07_04_EXISTING_MARKETPLACE_ADDRESS");
    assert (expectedMarket != null && marketplace.address == expectedMarket!) throw 842;
    assert (marketplace.ownerV2() == deployer.address) throw 843;
    assert (!marketplace.escrowConfiguredV2()) throw 844;
    assert (!net.runGetMethod<bool>(marketplace.address, "marketplaceReserveCoordinatorConfiguredV3")) throw 844;
    println("S07_04_EXISTING_MARKETPLACE_VERIFIED: {}", marketplace.address);
    println("S07_04_MARKETPLACE_REDEPLOYED: false");

    // The fixture-compatible Escrow was confirmed ACTIVE in read-only run 43833480462.
    // Do not send a second deployment message to this address.
    val expectedEscrow = env<address>("S07_04_EXISTING_ESCROW_ADDRESS");
    assert (expectedEscrow != null && escrow.address == expectedEscrow!) throw 845;
    assert (escrow.owner() == deployer.address) throw 845;
    assert (escrow.marketplace() == marketplace.address) throw 845;
    println("S07_04_EXISTING_ESCROW_VERIFIED: {}", escrow.address);
    println("S07_04_ESCROW_REDEPLOYED: false");

    // Read-only verifier attestation before any Coordinator deployment.
    val expectedVerifier = env<address>("S07_04_EXISTING_VERIFIER_ADDRESS");
    assert (expectedVerifier != null && verifier == expectedVerifier!) throw 846;
    assert (net.runGetMethod<uint32>(verifier, "verifierEpoch") == 1) throw 846;
    assert (net.runGetMethod<int32>(verifier, "verifierNetwork") == -3) throw 846;
    assert (net.runGetMethod<uint8>(verifier, "verifierThreshold") == 2) throw 846;
    println("S07_04_EXISTING_VERIFIER_VERIFIED: {}", verifier);
    println("S07_04_VERIFIER_REDEPLOYED: false");

    // All four contracts were confirmed active by readonly run 43836770274.
    // Fail closed if the deterministic Coordinator does not match the agreed address.
    val expectedCoordinator = env<address>("S07_04_EXISTING_COORDINATOR_ADDRESS");
    assert (expectedCoordinator != null && coordinator == expectedCoordinator!) throw 847;
    assert (net.runGetMethod<address>(coordinator, "reserveCoordinatorMarketplaceV3") == marketplace.address) throw 847;
    assert (net.runGetMethod<address>(coordinator, "reserveCoordinatorVerifierV3") == verifier) throw 847;
    println("S07_04_EXISTING_COORDINATOR_VERIFIED: {}", coordinator);
    println("S07_04_COORDINATOR_REDEPLOYED: false");

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
        treasuryAddress,
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
    val escrowMatchesTreasury = storedEscrowAddress == treasuryAddress;
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
    val treasuryAddressMatches = marketplace.treasuryV2() == treasuryAddress;
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

    println("S07_04_FOUR_CONTRACTS_BOUND: true");
    println("V3 testnet candidate marketplace: {}", marketplace.address);
    println("V3 testnet candidate escrow: {}", escrow.address);
    println("V3 testnet candidate coordinator: {}", coordinator);
    println("V3 testnet candidate verifier: {}", verifier);
    println("Platform treasury: {}", treasuryAddress);
    println("Network: Testnet (-3). No Mainnet deployment or transaction.");
    println("Collection allowlist remains disabled pending official collection configuration.");
}
