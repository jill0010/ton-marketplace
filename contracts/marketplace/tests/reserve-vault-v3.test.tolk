import "@acton/build"
import "@acton/crypto"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@contracts/ReserveVaultV3"
import "@contracts/SettlementAttestationVerifierV3"

fun productionReserveSetup(): (address, address, address, address, address, KeyPair, KeyPair) {
    testing.setNow(1700000000);
    val owner = testing.treasury("productionReserveOwner").address;
    val marketplace = testing.treasury("productionReserveMarketplace").address;
    val funder = testing.treasury("productionReserveCoordinator").address;
    val buyer = testing.treasury("productionReserveBuyer").address;
    val key0 = crypto.generateKeyPair();
    val key1 = crypto.generateKeyPair();
    val key2 = crypto.generateKeyPair();
    var validatorKeys: map<uint8, uint256> = [];
    validatorKeys.set(0, key0.publicKey);
    validatorKeys.set(1, key1.publicKey);
    validatorKeys.set(2, key2.publicKey);
    val verifierState: ContractState = {
        code: build("SettlementAttestationVerifierV3"),
        data: SettlementVerifierStorageV3 {
            owner,
            marketplace,
            networkGlobalId: -3,
            epoch: 4,
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
    expect(
        net.send(
            owner,
            createMessage({ bounce: false, value: grams("0.1"), dest: verifierDestination }),
        ),
    ).toHaveSuccessfulDeploy({ to: verifier });
    val vaultState: ContractState = {
        code: build("ReserveVaultV3"),
        data: ReserveVaultStorageV3 {
            owner,
            identity: ReserveVaultIdentityV3 {
                funding: ReserveVaultFundingIdentityV3 {
                    fundingSource: funder,
                    marketplace,
                }.toCell(),
                parties: ReserveVaultPartiesV3 {
                    verifier,
                    buyer,
                }.toCell(),
                order: ReserveVaultOrderIdentityV3 {
                    orderId: 1,
                    paymentHash: 12345,
                }.toCell(),
            }.toCell(),
            balances: ReserveVaultBalancesV3 {
                principal: grams("0.2"),
                available: 0,
                inFlight: 0,
                paid: 0,
                operationalBudget: 0,
            }.toCell(),
            operation: ReserveVaultOperationV3 {
                operationId: 0,
                queryId: 0,
                activeStatementHash: 0,
                status: 0,
                retryCount: 0,
            }.toCell(),
            consumedStatements: [],
        }.toCell(),
    };
    val vaultDestination = AutoDeployAddress {
        workchain: 0,
        stateInit: vaultState,
    };
    val vault = vaultDestination.calculateAddress();
    expect(
        net.send(
            owner,
            createMessage({ bounce: false, value: grams("0.1"), dest: vaultDestination }),
        ),
    ).toHaveSuccessfulDeploy({ to: vault });
    return (vault, verifier, owner, marketplace, funder, key0, key1);
}

fun productionReserveFund(vault: address, funder: address) {
    expect(
        net.send(
            funder,
            createMessage({
                bounce: BounceMode.RichBounce,
                value: grams("0.28"),
                dest: vault,
                body: FundReserveV3 { orderId: 1, paymentHash: 12345 }.toCell(),
            }),
        ),
    ).toHaveSuccessfulTx({ to: vault });
}

fun productionReserveDispatch(vault: address, marketplace: address) {
    expect(
        net.send(
            marketplace,
            createMessage({
                bounce: BounceMode.RichBounce,
                value: grams("0.03"),
                dest: vault,
                body: DispatchReserveRefundV3 { orderId: 1 }.toCell(),
            }),
        ),
    ).toHaveSuccessfulTx({ to: vault });
}

fun productionReserveStatement(
    vault: address,
    marketplace: address,
    buyer: address,
    operationId: uint64,
    queryId: uint64,
    outcome: uint8,
    settledAmount: coins,
): cell {
    val identity = beginCell()
        .storeAddress(marketplace)
        .storeAddress(vault)
        .storeAddress(buyer)
        .storeUint(1, 64)
        .storeCoins(grams("0.2"))
        .endCell();
    val operation = beginCell().storeUint(operationId, 64).storeUint(queryId, 64).endCell();
    val dispatch = beginCell().storeUint(4, 256).storeUint(5, 256).endCell();
    val result = beginCell()
        .storeUint(outcome, 8)
        .storeUint(6, 256)
        .storeUint(7, 256)
        .storeCoins(settledAmount)
        .storeUint(123456, 32)
        .storeUint(1700000600, 64)
        .storeUint(4, 32)
        .endCell();
    return beginCell()
        .storeUint(0x56523301, 32)
        .storeUint(1, 16)
        .storeInt(-3, 32)
        .storeRef(identity)
        .storeRef(operation)
        .storeRef(dispatch)
        .storeRef(result)
        .endCell();
}

fun productionReserveSignatures(statement: cell, key0: KeyPair, key1: KeyPair): cell {
    var signatures: map<uint8, cell> = [];
    signatures.set(
        0,
        beginCell().storeSlice(crypto.sign(key0.privateKey, statement)).endCell(),
    );
    signatures.set(
        1,
        beginCell().storeSlice(crypto.sign(key1.privateKey, statement)).endCell(),
    );
    return SettlementSignatureBundleV3 { signatures }.toCell();
}

fun productionReserveSubmit(
    vault: address,
    owner: address,
    statement: cell,
    signatures: cell,
): SendResultList {
    return net.send(
        owner,
        createMessage({
            bounce: BounceMode.RichBounce,
            value: grams("0.05"),
            dest: vault,
            body: SubmitReserveAttestationV3 {
                statement,
                signatures: signatures as Cell<SettlementSignatureBundleV3>,
            }.toCell(),
        }),
    );
}

get fun `test production reserve vault funds dispatches and settles only after verifier quorum`() {
    val (vault, verifier, owner, marketplace, funder, key0, key1) = productionReserveSetup();
    productionReserveFund(vault, funder);
    expect(net.runGetMethod<uint8>(vault, "reserveVaultStatusV3")).toEqual(1);
    expect(net.runGetMethod<coins>(vault, "reserveVaultAvailableV3")).toEqual(grams("0.2"));
    productionReserveDispatch(vault, marketplace);
    expect(net.runGetMethod<uint8>(vault, "reserveVaultStatusV3")).toEqual(2);
    expect(net.runGetMethod<coins>(vault, "reserveVaultInFlightV3")).toEqual(grams("0.2"));
    val buyer = testing.treasury("productionReserveBuyer").address;
    val statement = productionReserveStatement(vault, marketplace, buyer, 1, 1, 1, grams("0.2"));
    val signatures = productionReserveSignatures(statement, key0, key1);
    val result = productionReserveSubmit(vault, owner, statement, signatures);
    expect(result).toHaveSuccessfulTx({ to: vault });
    expect(result).toHaveSuccessfulTx<SettlementAttestationVerifiedV3>({ from: verifier, to: vault });
    expect(net.runGetMethod<uint8>(vault, "reserveVaultStatusV3")).toEqual(3);
    expect(net.runGetMethod<coins>(vault, "reserveVaultPaidV3")).toEqual(grams("0.2"));
    expect(net.runGetMethod<coins>(vault, "reserveVaultInFlightV3")).toEqual(0);
}

get fun `test production reserve vault quarantines returned principal and requires exact topup before one retry`() {
    val (vault, _, owner, marketplace, funder, key0, key1) = productionReserveSetup();
    productionReserveFund(vault, funder);
    productionReserveDispatch(vault, marketplace);
    val buyer = testing.treasury("productionReserveBuyer").address;
    val returned = productionReserveStatement(vault, marketplace, buyer, 1, 1, 2, grams("0.19"));
    val signatures = productionReserveSignatures(returned, key0, key1);
    expect(productionReserveSubmit(vault, owner, returned, signatures)).toHaveSuccessfulTx({ to: vault });
    expect(net.runGetMethod<uint8>(vault, "reserveVaultStatusV3")).toEqual(4);
    expect(net.runGetMethod<coins>(vault, "reserveVaultAvailableV3")).toEqual(grams("0.19"));
    expect(
        net.send(
            owner,
            createMessage({
                bounce: BounceMode.RichBounce,
                value: grams("0.04"),
                dest: vault,
                body: TopUpReserveV3 {
                    orderId: 1,
                    fundingId: 77,
                    principalTopUp: grams("0.01"),
                }.toCell(),
            }),
        ),
    ).toHaveSuccessfulTx({ to: vault });
    expect(net.runGetMethod<coins>(vault, "reserveVaultAvailableV3")).toEqual(grams("0.2"));
    expect(
        net.send(
            marketplace,
            createMessage({
                bounce: BounceMode.RichBounce,
                value: grams("0.03"),
                dest: vault,
                body: RetryReserveRefundV3 { orderId: 1 }.toCell(),
            }),
        ),
    ).toHaveSuccessfulTx({ to: vault });
    expect(net.runGetMethod<uint8>(vault, "reserveVaultStatusV3")).toEqual(2);
    expect(net.runGetMethod<uint64>(vault, "reserveVaultOperationV3")).toEqual(2);
    expect(net.runGetMethod<uint64>(vault, "reserveVaultQueryV3")).toEqual(2);
    expect(
        net.send(
            marketplace,
            createMessage({
                bounce: false,
                value: grams("0.03"),
                dest: vault,
                body: RetryReserveRefundV3 { orderId: 1 }.toCell(),
            }),
        ),
    ).toHaveFailedTx({ to: vault, exitCode: 765 });
}

get fun `test production reserve vault rejects forged verifier callbacks and unauthorized dispatch`() {
    val (vault, _, owner, marketplace, funder, _, _) = productionReserveSetup();
    productionReserveFund(vault, funder);
    expect(
        net.send(
            owner,
            createMessage({
                bounce: false,
                value: grams("0.03"),
                dest: vault,
                body: DispatchReserveRefundV3 { orderId: 1 }.toCell(),
            }),
        ),
    ).toHaveFailedTx({ to: vault, exitCode: 764 });
    expect(net.runGetMethod<uint8>(vault, "reserveVaultStatusV3")).toEqual(1);
    expect(
        net.send(
            marketplace,
            createMessage({
                bounce: false,
                value: grams("0.03"),
                dest: vault,
                body: SettlementAttestationVerifiedV3 {
                    statementHash: 1,
                    orderId: 1,
                    operationId: 1,
                    queryId: 1,
                    outcome: 1,
                    settledAmount: grams("0.2"),
                }.toCell(),
            }),
        ),
    ).toHaveFailedTx({ to: vault, exitCode: 764 });
    expect(net.runGetMethod<uint8>(vault, "reserveVaultStatusV3")).toEqual(1);
}
