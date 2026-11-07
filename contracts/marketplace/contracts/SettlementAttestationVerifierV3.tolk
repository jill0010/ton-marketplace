import "@stdlib/tvm-lowlevel"

const SETTLEMENT_DOMAIN_V3 = 0x56523301;
const SETTLEMENT_SCHEMA_V3 = 1;

struct SettlementIdentityV3 {
    marketplace: address
    vault: address
    buyer: address
    orderId: uint64
    principal: coins
}

struct SettlementOperationV3 {
    operationId: uint64
    queryId: uint64
}

struct SettlementDispatchV3 {
    transactionHash: uint256
    messageHash: uint256
}

struct SettlementResultV3 {
    outcome: uint8
    transactionHash: uint256
    messageHash: uint256
    settledAmount: coins
    masterchainSeqno: uint32
    expiresAt: uint64
    epoch: uint32
}

struct SettlementStatementRootV3 {
    domain: uint32
    schemaVersion: uint16
    networkGlobalId: int32
    identity: Cell<SettlementIdentityV3>
    operation: Cell<SettlementOperationV3>
    dispatch: Cell<SettlementDispatchV3>
    result: Cell<SettlementResultV3>
}

struct SettlementSignatureBundleV3 {
    signatures: map<uint8, cell>
}

struct SettlementVerifierStorageV3 {
    owner: address
    marketplace: address
    networkGlobalId: int32
    epoch: uint32
    threshold: uint8
    validatorKeys: map<uint8, uint256>
    consumedStatements: map<uint256, uint8>
}

struct (0x72730401) VerifySettlementAttestationV3 {
    statement: cell
    signatures: Cell<SettlementSignatureBundleV3>
}

struct (0x72730402) SettlementAttestationVerifiedV3 {
    statementHash: uint256
    orderId: uint64
    operationId: uint64
    queryId: uint64
    outcome: uint8
    settledAmount: coins
}

struct (0x72730403) AcknowledgeSettlementAttestationV3 {
    statementHash: uint256
}

struct SettlementVerifierCallbackV3 {
    statementHash: uint256
    orderId: uint64
    operationId: uint64
    queryId: uint64
    outcome: uint8
    settledAmount: coins
    vault: address
}

type SettlementVerifierMessageV3 = VerifySettlementAttestationV3 | AcknowledgeSettlementAttestationV3

contract SettlementAttestationVerifierV3 {
    author: "TON Market"
    version: "0.1.0"
    description: "Domain-separated Ed25519 quorum verifier for V3 settlement statements"
    storage: SettlementVerifierStorageV3
    incomingMessages: SettlementVerifierMessageV3
}

fun SettlementVerifierStorageV3.load(): SettlementVerifierStorageV3 {
    return SettlementVerifierStorageV3.fromCell(contract.getData());
}

fun SettlementVerifierStorageV3.save(self) {
    contract.setData(self.toCell());
}

fun onInternalMessage(in: InMessage) {
    if (in.body.isEmpty()) {
        return;
    }
    val msg = lazy SettlementVerifierMessageV3.fromSlice(in.body);
    var storage = SettlementVerifierStorageV3.load();
    match (msg) {
        AcknowledgeSettlementAttestationV3 => {
            assert (in.senderAddress == storage.owner) throw 751;
            val found = storage.consumedStatements.get(msg.statementHash);
            assert (found.isFound && found.loadValue() == 1) throw 752;
            storage.consumedStatements.set(msg.statementHash, 2);
            storage.save();
        }
        VerifySettlementAttestationV3 => {
            val statementHash = msg.statement.hash();
            assert (in.senderAddress != contract.getAddress()) throw 751;
            assert (!storage.consumedStatements.get(statementHash).isFound) throw 752;

            val root = SettlementStatementRootV3.fromCell(msg.statement);
            assert (root.domain == SETTLEMENT_DOMAIN_V3) throw 753;
            assert (root.schemaVersion == SETTLEMENT_SCHEMA_V3) throw 753;
            assert (root.networkGlobalId == storage.networkGlobalId) throw 754;

            val identity = root.identity.load();
            val operation = root.operation.load();
            val dispatch = root.dispatch.load();
            val result = root.result.load();

            assert (identity.marketplace == storage.marketplace) throw 755;
            assert (identity.marketplace != identity.vault) throw 753;
            assert (identity.marketplace != contract.getAddress()) throw 753;
            assert (identity.vault == in.senderAddress && identity.vault != contract.getAddress()) throw 755;
            assert (identity.buyer != identity.vault && identity.buyer != identity.marketplace) throw 753;
            assert (identity.orderId > 0 && identity.principal > 0) throw 753;
            assert (operation.operationId > 0 && operation.queryId > 0) throw 753;
            assert (dispatch.transactionHash != 0 && dispatch.messageHash != 0) throw 753;
            assert (result.transactionHash != 0 && result.messageHash != 0) throw 753;
            assert (result.masterchainSeqno > 0) throw 753;
            assert (result.epoch == storage.epoch) throw 754;
            assert (result.expiresAt >= now()) throw 754;
            assert (result.expiresAt <= now() + 900) throw 754;
            assert (result.outcome == 1 || result.outcome == 2) throw 753;
            assert (result.settledAmount > 0 && result.settledAmount <= identity.principal) throw 753;
            if (result.outcome == 1) {
                assert (result.settledAmount == identity.principal) throw 753;
            } else {
                assert (result.settledAmount < identity.principal) throw 753;
            }

            val bundle = msg.signatures.load();
            var validSignatures = 0;
            var signerIndex: uint8 = 0;
            while (signerIndex < 3) {
                val signatureFound = bundle.signatures.get(signerIndex);
                if (signatureFound.isFound) {
                    val keyFound = storage.validatorKeys.get(signerIndex);
                    assert (keyFound.isFound) throw 756;
                    val signatureCell = signatureFound.loadValue();
                    var signatureSlice = signatureCell.beginParse();
                    assert (signatureSlice.remainingBitsCount() == 512) throw 757;
                    assert (signatureSlice.remainingRefsCount() == 0) throw 757;
                    assert (isSignatureValid(statementHash, signatureSlice, keyFound.loadValue())) throw 758;
                    validSignatures += 1;
                }
                signerIndex += 1;
            }
            assert (validSignatures >= storage.threshold) throw 759;

            storage.consumedStatements.set(statementHash, 1);
            storage.save();
            createMessage({
                bounce: BounceMode.RichBounce,
                value: grams("0.03"),
                dest: identity.vault,
                body: SettlementAttestationVerifiedV3 {
                    statementHash,
                    orderId: identity.orderId,
                    operationId: operation.operationId,
                    queryId: operation.queryId,
                    outcome: result.outcome,
                    settledAmount: result.settledAmount,
                },
            }).send(SEND_MODE_PAY_FEES_SEPARATELY);
        }
    }
}

fun onBouncedMessage(_in: InMessageBounced) {}

get fun verifierEpoch(): uint32 {
    return SettlementVerifierStorageV3.load().epoch;
}

get fun verifierNetwork(): int32 {
    return SettlementVerifierStorageV3.load().networkGlobalId;
}

get fun verifierThreshold(): uint8 {
    return SettlementVerifierStorageV3.load().threshold;
}

get fun isSettlementStatementConsumed(statementHash: uint256): uint8 {
    val found = SettlementVerifierStorageV3.load().consumedStatements.get(statementHash);
    if (!found.isFound) {
        return 0;
    }
    return found.loadValue();
}
