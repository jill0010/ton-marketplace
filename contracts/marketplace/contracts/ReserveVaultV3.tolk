import "SettlementAttestationVerifierV3"

struct ReserveVaultIdentityV3 {
    fundingSource: address
    marketplace: address
    verifier: address
    buyer: address
    orderId: uint64
    paymentHash: uint256
}

struct ReserveVaultStorageV3 {
    owner: address
    identity: Cell<ReserveVaultIdentityV3>
    principal: coins
    available: coins
    inFlight: coins
    paid: coins
    operationalBudget: coins
    operationId: uint64
    queryId: uint64
    activeStatementHash: uint256
    status: uint8
    retryCount: uint8
    consumedStatements: map<uint256, bool>
}

struct (0x72730501) FundReserveV3 {
    orderId: uint64
    paymentHash: uint256
}

struct (0x72730502) DispatchReserveRefundV3 {
    orderId: uint64
}

struct (0x72730503) SubmitReserveAttestationV3 {
    statement: cell
    signatures: Cell<SettlementSignatureBundleV3>
}

struct (0x72730504) TopUpReserveV3 {
    orderId: uint64
    fundingId: uint64
    principalTopUp: coins
}

struct (0x72730505) ReserveFundedV3 {
    orderId: uint64
    paymentHash: uint256
    vault: address
}

struct (0x72730506) ReserveRefundDispatchedV3 {
    orderId: uint64
    operationId: uint64
    queryId: uint64
    amount: coins
}

struct (0x72730507) RetryReserveRefundV3 {
    orderId: uint64
}

type ReserveVaultMessageV3 =
    | FundReserveV3
    | DispatchReserveRefundV3
    | SubmitReserveAttestationV3
    | TopUpReserveV3
    | SettlementAttestationVerifiedV3
    | RetryReserveRefundV3

contract ReserveVaultV3 {
    author: "TON Market"
    version: "3.0.0"
    description: "Production per-order reserve vault with quorum-attested settlement"
    storage: ReserveVaultStorageV3
    incomingMessages: ReserveVaultMessageV3
}

fun ReserveVaultStorageV3.load(): ReserveVaultStorageV3 {
    return ReserveVaultStorageV3.fromCell(contract.getData());
}

fun ReserveVaultStorageV3.save(self) {
    contract.setData(self.toCell());
}

fun dispatchReserveRefundV3(mutate storage: ReserveVaultStorageV3) {
    val identity = storage.identity.load();
    assert (storage.status == 1 || storage.status == 4) throw 761;
    assert (storage.available == storage.principal - storage.paid) throw 762;
    assert (storage.available > 0) throw 762;
    assert (contract.getOriginalBalance() >= storage.available + grams("0.03")) throw 763;
    storage.operationId += 1;
    storage.queryId += 1;
    assert (storage.operationId > 0 && storage.queryId > 0) throw 762;
    storage.inFlight = storage.available;
    storage.available = 0;
    storage.status = 2;
    storage.activeStatementHash = 0;
    storage.save();
    createMessage({
        bounce: BounceMode.RichBounce,
        value: storage.inFlight,
        dest: identity.buyer,
        body: ReserveRefundDispatchedV3 {
            orderId: identity.orderId,
            operationId: storage.operationId,
            queryId: storage.queryId,
            amount: storage.inFlight,
        },
    }).send(SEND_MODE_PAY_FEES_SEPARATELY);
}

fun onInternalMessage(in: InMessage) {
    if (in.body.isEmpty()) {
        return;
    }
    val msg = lazy ReserveVaultMessageV3.fromSlice(in.body);
    var storage = ReserveVaultStorageV3.load();
    val identity = storage.identity.load();
    match (msg) {
        FundReserveV3 => {
            assert (in.senderAddress == identity.fundingSource) throw 764;
            assert (msg.orderId == identity.orderId && msg.paymentHash == identity.paymentHash) throw 765;
            assert (storage.status == 0 && storage.principal == grams("0.2")) throw 766;
            assert (in.valueCoins >= storage.principal + grams("0.08")) throw 767;
            storage.available = storage.principal;
            storage.operationalBudget = in.valueCoins - storage.principal;
            storage.status = 1;
            storage.save();
            createMessage({
                bounce: BounceMode.NoBounce,
                value: grams("0.005"),
                dest: identity.fundingSource,
                body: ReserveFundedV3 {
                    orderId: identity.orderId,
                    paymentHash: identity.paymentHash,
                    vault: contract.getAddress(),
                },
            }).send(SEND_MODE_PAY_FEES_SEPARATELY);
        }
        DispatchReserveRefundV3 => {
            assert (in.senderAddress == identity.marketplace) throw 764;
            assert (msg.orderId == identity.orderId) throw 765;
            dispatchReserveRefundV3(mutate storage);
        }
        SubmitReserveAttestationV3 => {
            assert (in.senderAddress == identity.marketplace || in.senderAddress == storage.owner) throw 764;
            assert (storage.status == 2 && storage.inFlight > 0) throw 768;
            val root = SettlementStatementRootV3.fromCell(msg.statement);
            val statementIdentity = root.identity.load();
            val operation = root.operation.load();
            assert (root.networkGlobalId == -3) throw 769;
            assert (statementIdentity.marketplace == identity.marketplace) throw 769;
            assert (statementIdentity.vault == contract.getAddress()) throw 769;
            assert (statementIdentity.buyer == identity.buyer) throw 769;
            assert (statementIdentity.orderId == identity.orderId) throw 769;
            assert (statementIdentity.principal == storage.principal) throw 769;
            assert (operation.operationId == storage.operationId && operation.queryId == storage.queryId) throw 769;
            assert (!storage.consumedStatements.get(msg.statement.hash()).isFound) throw 770;
            storage.activeStatementHash = msg.statement.hash();
            storage.save();
            createMessage({
                bounce: BounceMode.RichBounce,
                value: grams("0.05"),
                dest: identity.verifier,
                body: VerifySettlementAttestationV3 {
                    statement: msg.statement,
                    signatures: msg.signatures,
                }.toCell(),
            }).send(SEND_MODE_PAY_FEES_SEPARATELY);
        }
        SettlementAttestationVerifiedV3 => {
            assert (in.senderAddress == identity.verifier) throw 764;
            assert (storage.status == 2 && storage.inFlight > 0) throw 768;
            assert (msg.orderId == identity.orderId) throw 769;
            assert (msg.operationId == storage.operationId && msg.queryId == storage.queryId) throw 769;
            assert (msg.statementHash == storage.activeStatementHash && msg.statementHash != 0) throw 769;
            assert (!storage.consumedStatements.get(msg.statementHash).isFound) throw 770;
            if (msg.outcome == 1) {
                assert (msg.settledAmount == storage.inFlight) throw 771;
                storage.paid += msg.settledAmount;
                storage.inFlight = 0;
                storage.status = 3;
            } else {
                assert (msg.outcome == 2) throw 771;
                assert (msg.settledAmount > 0 && msg.settledAmount < storage.inFlight) throw 771;
                storage.available = msg.settledAmount;
                storage.inFlight = 0;
                storage.status = 4;
            }
            storage.consumedStatements.set(msg.statementHash, true);
            storage.activeStatementHash = 0;
            storage.save();
        }
        TopUpReserveV3 => {
            assert (in.senderAddress == identity.fundingSource || in.senderAddress == storage.owner) throw 764;
            assert (storage.status == 4 && storage.inFlight == 0) throw 768;
            assert (msg.orderId == identity.orderId && msg.fundingId > 0) throw 765;
            assert (msg.principalTopUp == storage.principal - storage.paid - storage.available) throw 772;
            assert (msg.principalTopUp > 0) throw 772;
            assert (in.valueCoins >= msg.principalTopUp + grams("0.03")) throw 773;
            storage.available += msg.principalTopUp;
            storage.operationalBudget += in.valueCoins - msg.principalTopUp;
            storage.status = 1;
            storage.save();
        }
        RetryReserveRefundV3 => {
            assert (in.senderAddress == identity.marketplace || in.senderAddress == storage.owner) throw 764;
            assert (msg.orderId == identity.orderId && storage.status == 1) throw 765;
            assert (storage.retryCount == 0) throw 774;
            storage.retryCount = 1;
            dispatchReserveRefundV3(mutate storage);
        }
    }
}

fun onBouncedMessage(_in: InMessageBounced) {
    // A bounce is not proof of returned principal. Only the configured quorum
    // verifier may transition in-flight funds back to available.
}

get fun reserveVaultStatusV3(): uint8 {
    return ReserveVaultStorageV3.load().status;
}

get fun reserveVaultPrincipalV3(): coins {
    return ReserveVaultStorageV3.load().principal;
}

get fun reserveVaultAvailableV3(): coins {
    return ReserveVaultStorageV3.load().available;
}

get fun reserveVaultInFlightV3(): coins {
    return ReserveVaultStorageV3.load().inFlight;
}

get fun reserveVaultPaidV3(): coins {
    return ReserveVaultStorageV3.load().paid;
}

get fun reserveVaultOperationV3(): uint64 {
    return ReserveVaultStorageV3.load().operationId;
}

get fun reserveVaultQueryV3(): uint64 {
    return ReserveVaultStorageV3.load().queryId;
}

get fun reserveVaultRetryCountV3(): uint8 {
    return ReserveVaultStorageV3.load().retryCount;
}
