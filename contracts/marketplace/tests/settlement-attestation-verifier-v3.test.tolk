import "@acton/build"
import "@acton/crypto"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@contracts/SettlementAttestationVerifierV3"

fun verifierStatement(
    vault: address,
    networkGlobalId: int32 = -3,
    epoch: uint32 = 4,
    expiresAt: uint64 = 1700000600,
): cell {
    val identity = beginCell()
        .storeAddress(testing.treasury("statementMarketplace").address)
        .storeAddress(vault)
        .storeAddress(testing.treasury("statementBuyer").address)
        .storeUint(17, 64)
        .storeCoins(grams("0.2"))
        .endCell();
    val operation = beginCell().storeUint(2, 64).storeUint(99, 64).endCell();
    val dispatch = beginCell().storeUint(4, 256).storeUint(5, 256).endCell();
    val result = beginCell()
        .storeUint(1, 8)
        .storeUint(6, 256)
        .storeUint(7, 256)
        .storeCoins(grams("0.2"))
        .storeUint(123456, 32)
        .storeUint(expiresAt, 64)
        .storeUint(epoch, 32)
        .endCell();
    return beginCell()
        .storeUint(0x56523301, 32)
        .storeUint(1, 16)
        .storeInt(networkGlobalId, 32)
        .storeRef(identity)
        .storeRef(operation)
        .storeRef(dispatch)
        .storeRef(result)
        .endCell();
}

fun verifierSetup(): (address, address, KeyPair, KeyPair, KeyPair) {
    testing.setNow(1700000000);
    val owner = testing.treasury("verifierOwner").address;
    val marketplace = testing.treasury("statementMarketplace").address;
    val vault = testing.treasury("verifierVault").address;
    val key0 = crypto.generateKeyPair();
    val key1 = crypto.generateKeyPair();
    val key2 = crypto.generateKeyPair();
    var validatorKeys: map<uint8, uint256> = [];
    validatorKeys.set(0, key0.publicKey);
    validatorKeys.set(1, key1.publicKey);
    validatorKeys.set(2, key2.publicKey);
    val state: ContractState = {
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
    val destination = AutoDeployAddress {
        workchain: 0,
        stateInit: state,
    };
    val verifier = destination.calculateAddress();
    expect(
        net.send(
            owner,
            createMessage({ bounce: false, value: grams("0.1"), dest: destination }),
        ),
    ).toHaveSuccessfulDeploy({ to: verifier });
    return (verifier, vault, key0, key1, key2);
}

fun verifierBundle(
    statement: cell,
    key0: KeyPair?,
    key1: KeyPair?,
    key2: KeyPair? = null,
): cell {
    var signatures: map<uint8, cell> = [];
    if (key0 != null) {
        signatures.set(
            0,
            beginCell().storeSlice(crypto.sign(key0.privateKey, statement)).endCell(),
        );
    }
    if (key1 != null) {
        signatures.set(
            1,
            beginCell().storeSlice(crypto.sign(key1.privateKey, statement)).endCell(),
        );
    }
    if (key2 != null) {
        signatures.set(
            2,
            beginCell().storeSlice(crypto.sign(key2.privateKey, statement)).endCell(),
        );
    }
    return SettlementSignatureBundleV3 { signatures }.toCell();
}

fun verifierSend(
    from: address,
    verifier: address,
    statement: cell,
    signatures: cell,
): SendResultList {
    return net.send(
        from,
        createMessage({
            bounce: BounceMode.RichBounce,
            value: grams("0.1"),
            dest: verifier,
            body: VerifySettlementAttestationV3 {
                statement,
                signatures: signatures as Cell<SettlementSignatureBundleV3>,
            }.toCell(),
        }),
    );
}

get fun `test verifier accepts exact two-of-three Ed25519 quorum and blocks replay`() {
    val (verifier, vault, key0, key1, _) = verifierSetup();
    val statement = verifierStatement(vault);
    val signatures = verifierBundle(statement, key0, key1);
    val result = verifierSend(vault, verifier, statement, signatures);
    expect(result).toHaveSuccessfulTx({ to: verifier });
    expect(
        result,
    ).toHaveSuccessfulTx<SettlementAttestationVerifiedV3>({ from: verifier, to: vault });
    expect(
        net.runGetMethod<uint8>(verifier, "isSettlementStatementConsumed", [statement.hash()]),
    ).toEqual(1);
    expect(
        verifierSend(vault, verifier, statement, signatures),
    ).toHaveFailedTx({ to: verifier, exitCode: 752 });
}

get fun `test verifier rejects insufficient quorum and invalid signature`() {
    val (verifier, vault, key0, key1, _) = verifierSetup();
    val statement = verifierStatement(vault);
    expect(
        verifierSend(vault, verifier, statement, verifierBundle(statement, key0, null)),
    ).toHaveFailedTx({ to: verifier, exitCode: 759 });
    val other = crypto.generateKeyPair();
    expect(
        verifierSend(vault, verifier, statement, verifierBundle(statement, key0, other)),
    ).toHaveFailedTx({ to: verifier, exitCode: 758 });
    expect(
        net.runGetMethod<uint8>(verifier, "isSettlementStatementConsumed", [statement.hash()]),
    ).toEqual(0);
}

get fun `test verifier rejects wrong network epoch expiry and vault binding`() {
    val (verifier, vault, key0, key1, _) = verifierSetup();
    val wrongNetwork = verifierStatement(vault, -239);
    expect(
        verifierSend(vault, verifier, wrongNetwork, verifierBundle(wrongNetwork, key0, key1)),
    ).toHaveFailedTx({ to: verifier, exitCode: 754 });
    val wrongEpoch = verifierStatement(vault, -3, 5);
    expect(
        verifierSend(vault, verifier, wrongEpoch, verifierBundle(wrongEpoch, key0, key1)),
    ).toHaveFailedTx({ to: verifier, exitCode: 754 });
    val expired = verifierStatement(vault, -3, 4, 1);
    expect(
        verifierSend(vault, verifier, expired, verifierBundle(expired, key0, key1)),
    ).toHaveFailedTx({ to: verifier, exitCode: 754 });
    val otherVault = testing.treasury("otherVerifierVault").address;
    val wrongVault = verifierStatement(otherVault);
    expect(
        verifierSend(vault, verifier, wrongVault, verifierBundle(wrongVault, key0, key1)),
    ).toHaveFailedTx({ to: verifier, exitCode: 755 });
}

get fun `test verifier rejects malformed signatures and unknown signer indices`() {
    val (verifier, vault, key0, key1, _) = verifierSetup();
    val statement = verifierStatement(vault);
    var malformed: map<uint8, cell> = [];
    malformed.set(0, beginCell().storeUint(1, 8).endCell());
    malformed.set(1, beginCell().storeSlice(crypto.sign(key1.privateKey, statement)).endCell());
    expect(
        verifierSend(
            vault,
            verifier,
            statement,
            SettlementSignatureBundleV3 { signatures: malformed }.toCell(),
        ),
    ).toHaveFailedTx({ to: verifier, exitCode: 757 });
    var unknown: map<uint8, cell> = [];
    unknown.set(3, beginCell().storeSlice(crypto.sign(key0.privateKey, statement)).endCell());
    unknown.set(4, beginCell().storeSlice(crypto.sign(key1.privateKey, statement)).endCell());
    expect(
        verifierSend(
            vault,
            verifier,
            statement,
            SettlementSignatureBundleV3 { signatures: unknown }.toCell(),
        ),
    ).toHaveFailedTx({ to: verifier, exitCode: 759 });
}
