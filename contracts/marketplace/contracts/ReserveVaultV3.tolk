import "SettlementAttestationVerifierV3"

struct ReserveVaultFundingIdentityV3 {
    fundingSource: address
    marketplace: address
}

struct ReserveVaultPartiesV3 {
    verifier: address
    buyer: address
}

struct ReserveVaultOrderIdentityV3 {
    orderId: uint64
    paymentHash: uint256
}

struct ReserveVaultIdentityV3 {
    funding: Cell<ReserveVaultFundingIdentityV3>
    parties: Cell<ReserveVaultPartiesV3>
    order: Cell<ReserveVaultOrderIdentityV3>
}

struct ReserveVaultBalancesV3 {
    principal: coins
    available: coins
    inFlight: coins
    paid: coins
    operationalBudget: coins
}

struct ReserveVaultOperationV3 {
    operationId: uint64
    queryId: uint64
    activeStatementHash: uint256
    dispatchMessageHash: uint256
    status: uint8
    retryCount: uint8
}

struct ReserveVaultStorageV3 {
    owner: address
    identity: Cell<ReserveVaultIdentityV3>
    balances: Cell<ReserveVaultBalancesV3>
    operation: Cell<ReserveVaultOperationV3>
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
    val parties = identity.parties.load();
    val order = identity.order.load();
    var balances = storage.balances.load();
    var operation = storage.operation.load();
    assert (operation.status == 1 || operation.status == 4) throw 761;
    assert (balances.available == balances.principal - balances.paid) throw 762;
    assert (balances.available > 0) throw 762;
    assert (contract.getOriginalBalance() >= balances.available + grams("0.03")) throw 763;
    operation.operationId += 1;
    operation.queryId += 1;
    assert (operation.operationId > 0 && operation.queryId > 0) throw 762;
    balances.inFlight = balances.available;
    balances.available = 0;
    operation.status = 2;
    operation.activeStatementHash = 0;
    storage.balances = balances.toCell();
    storage.operation = operation.toCell();
    storage.save();
    val refundMessage = createMessage({
        bounce: BounceMode.RichBounce,
        value: balances.inFlight,
        dest: parties.buyer,
        body: ReserveRefundDispatchedV3 {
            orderId: order.orderId,
            operationId: operation.operationId,
            queryId: operation.queryId,
            amount: balances.inFlight,
        },
    });
    operation.dispatchMessageHash = refundMessage.toCell().hash();
    storage.operation = operation.toCell();
    storage.save();
    refundMessage.send(SEND_MODE_PAY_FEES_SEPARATELY);
}

fun onInternalMessage(in: InMessage) {
    if (in.body.isEmpty()) {
        return;
    }
    val msg = lazy ReserveVaultMessageV3.fromSlice(in.body);
    var storage = ReserveVaultStorageV3.load();
    val identity = storage.identity.load();
    val funding = identity.funding.load();
    val parties = identity.parties.load();
    val order = identity.order.load();
    var balances = storage.balances.load();
    var operation = storage.operation.load();
    match (msg) {
        FundReserveV3 => {
            assert (in.senderAddress == funding.fundingSource) throw 764;
            assert (msg.orderId == order.orderId && msg.paymentHash == order.paymentHash) throw 765;
            assert (operation.status == 0 && balances.principal == grams("0.2")) throw 766;
            assert (in.valueCoins >= balances.principal + grams("0.08")) throw 767;
            balances.available = balances.principal;
            balances.operationalBudget = in.valueCoins - balances.principal;
            operation.status = 1;
            storage.balances = balances.toCell();
            storage.operation = operation.toCell();
            storage.save();
            createMessage({
                bounce: BounceMode.NoBounce,
                value: grams("0.005"),
                dest: funding.fundingSource,
                body: ReserveFundedV3 {
                    orderId: order.orderId,
                    paymentHash: order.paymentHash,
                    vault: contract.getAddress(),
                },
            }).send(SEND_MODE_PAY_FEES_SEPARATELY);
        }
        DispatchReserveRefundV3 => {
            assert (in.senderAddress == funding.marketplace) throw 764;
            assert (msg.orderId == order.orderId) throw 765;
            dispatchReserveRefundV3(mutate storage);
        }
        SubmitReserveAttestationV3 => {
            assert (
                in.senderAddress == funding.marketplace || in.senderAddress == storage.owner
            ) throw 764;
            assert (operation.status == 2 && balances.inFlight > 0) throw 768;
            val root = SettlementStatementRootV3.fromCell(msg.statement);
            val statementIdentity = root.identity.load();
            val statementOperation = root.operation.load();
            val statementDispatch = root.dispatch.load();
            assert (root.networkGlobalId == -3) throw 769;
            assert (statementIdentity.marketplace == funding.marketplace) throw 769;
            assert (statementIdentity.vault == contract.getAddress()) throw 769;
            assert (statementIdentity.buyer == parties.buyer) throw 769;
            assert (statementIdentity.orderId == order.orderId) throw 769;
            assert (statementIdentity.principal == balances.principal) throw 769;
            assert (
                statementOperation.operationId == operation.operationId &&
                statementOperation.queryId == operation.queryId
            ) throw 769;
            assert (
                statementDispatch.messageHash == operation.dispatchMessageHash &&
                statementDispatch.messageHash != 0
            ) throw 769;
            assert (!storage.consumedStatements.get(msg.statement.hash()).isFound) throw 770;
            operation.activeStatementHash = msg.statement.hash();
            storage.operation = operation.toCell();
            storage.save();
            createMessage({
                bounce: BounceMode.RichBounce,
                value: grams("0.05"),
                dest: parties.verifier,
                body: VerifySettlementAttestationV3 {
                    statement: msg.statement,
                    signatures: msg.signatures,
                }.toCell(),
            }).send(SEND_MODE_PAY_FEES_SEPARATELY);
        }
        SettlementAttestationVerifiedV3 => {
            assert (in.senderAddress == parties.verifier) throw 764;
            assert (operation.status == 2 && balances.inFlight > 0) throw 768;
            assert (msg.orderId == order.orderId) throw 769;
            assert (
                msg.operationId == operation.operationId && msg.queryId == operation.queryId
            ) throw 769;
            assert (
                msg.statementHash == operation.activeStatementHash && msg.statementHash != 0
            ) throw 769;
            assert (!storage.consumedStatements.get(msg.statementHash).isFound) throw 770;
            if (msg.outcome == 1) {
                assert (msg.settledAmount == balances.inFlight) throw 771;
                balances.paid += msg.settledAmount;
                balances.inFlight = 0;
                operation.status = 3;
            } else {
                assert (msg.outcome == 2) throw 771;
                assert (msg.settledAmount > 0 && msg.settledAmount < balances.inFlight) throw 771;
                balances.available = msg.settledAmount;
                balances.inFlight = 0;
                operation.status = 4;
            }
            storage.consumedStatements.set(msg.statementHash, true);
            operation.activeStatementHash = 0;
            storage.balances = balances.toCell();
            storage.operation = operation.toCell();
            storage.save();
        }
        TopUpReserveV3 => {
            assert (
                in.senderAddress == funding.fundingSource || in.senderAddress == storage.owner
            ) throw 764;
            assert (operation.status == 4 && balances.inFlight == 0) throw 768;
            assert (msg.orderId == order.orderId && msg.fundingId > 0) throw 765;
            assert (
                msg.principalTopUp == balances.principal - balances.paid - balances.available
            ) throw 772;
            assert (msg.principalTopUp > 0) throw 772;
            assert (in.valueCoins >= msg.principalTopUp + grams("0.03")) throw 773;
            balances.available += msg.principalTopUp;
            balances.operationalBudget += in.valueCoins - msg.principalTopUp;
            operation.status = 1;
            storage.balances = balances.toCell();
            storage.operation = operation.toCell();
            storage.save();
        }
        RetryReserveRefundV3 => {
            assert (
                in.senderAddress == funding.marketplace || in.senderAddress == storage.owner
            ) throw 764;
            assert (msg.orderId == order.orderId && operation.status == 1) throw 765;
            assert (operation.retryCount == 0) throw 774;
            operation.retryCount = 1;
            storage.operation = operation.toCell();
            dispatchReserveRefundV3(mutate storage);
        }
    }
}

fun onBouncedMessage(_in: InMessageBounced) {
    // A bounce is not proof of returned principal. Only the configured quorum
    // verifier may transition in-flight funds back to available.
}

get fun reserveVaultStatusV3(): uint8 {
    return ReserveVaultStorageV3.load().operation.load().status;
}

get fun reserveVaultPrincipalV3(): coins {
    return ReserveVaultStorageV3.load().balances.load().principal;
}

get fun reserveVaultAvailableV3(): coins {
    return ReserveVaultStorageV3.load().balances.load().available;
}

get fun reserveVaultInFlightV3(): coins {
    return ReserveVaultStorageV3.load().balances.load().inFlight;
}

get fun reserveVaultPaidV3(): coins {
    return ReserveVaultStorageV3.load().balances.load().paid;
}

get fun reserveVaultOperationV3(): uint64 {
    return ReserveVaultStorageV3.load().operation.load().operationId;
}

get fun reserveVaultQueryV3(): uint64 {
    return ReserveVaultStorageV3.load().operation.load().queryId;
}

get fun reserveVaultRetryCountV3(): uint8 {
    return ReserveVaultStorageV3.load().operation.load().retryCount;
}

get fun reserveVaultDispatchMessageHashV3(): uint256 {
    return ReserveVaultStorageV3.load().operation.load().dispatchMessageHash;
}
