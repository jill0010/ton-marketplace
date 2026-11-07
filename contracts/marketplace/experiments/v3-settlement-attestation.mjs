// Reference model for the V3 quorum-attestation ABI.
// This is NOT an on-chain verifier and MUST NOT authorize contract payouts.
// The production Tolk verifier must reproduce this canonical cell/hash exactly.
import { createPublicKey, verify as verifySignature } from "node:crypto";
import { Address, beginCell } from "@ton/core";

const DOMAIN = 0x56523301;
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const UINT256 = /^[0-9a-f]{64}$/i;
const HEX64 = /^[0-9a-f]{128}$/i;
const RAW_ADDRESS = /^(?:-1|0):[0-9a-f]{64}$/i;

function requireInteger(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new TypeError("Invalid " + label);
  }
  return value;
}
function requireHash(value, label) {
  if (typeof value !== "string" || !UINT256.test(value)) throw new TypeError("Invalid " + label);
  return BigInt("0x" + value);
}
function requireAddress(value, label) {
  if (typeof value !== "string" || !RAW_ADDRESS.test(value)) throw new TypeError("Invalid " + label);
  return Address.parseRaw(value);
}
function requirePositiveBigInt(value, label) {
  if (typeof value !== "bigint" || value <= 0n) throw new TypeError("Invalid " + label);
  return value;
}

// Every field affecting authority, order, payment, outcome, replay, or finality
// is serialized in one canonical cell. The outcome fields are mutually exclusive.
export function buildV3SettlementStatementCell(s) {
  const networkGlobalId = requireInteger(s.networkGlobalId, -2147483648, 2147483647, "network global ID");
  const schemaVersion = requireInteger(s.schemaVersion, 1, 65535, "schema version");
  const outcome = requireInteger(s.outcome, 1, 2, "settlement outcome");
  const expiry = requireInteger(s.expiresAt, 1, Number.MAX_SAFE_INTEGER, "expiry");
  const epoch = requireInteger(s.epoch, 1, 0xffffffff, "validator epoch");
  const anchorSeqno = requireInteger(s.masterchainSeqno, 1, 0xffffffff, "masterchain seqno");
  const orderId = requirePositiveBigInt(s.orderId, "order ID");
  const operationId = requirePositiveBigInt(s.operationId, "operation ID");
  const queryId = requirePositiveBigInt(s.queryId, "query ID");
  const principal = requirePositiveBigInt(s.principalNano, "principal");
  const amount = requirePositiveBigInt(s.settledNano, "settled amount");
  if (orderId > 0xffffffffffffffffn || operationId > 0xffffffffffffffffn ||
      queryId > 0xffffffffffffffffn || expiry > 0xffffffffffffffff) {
    throw new TypeError("Settlement integer exceeds ABI width");
  }
  if (amount > principal) throw new TypeError("Settlement exceeds principal");
  const marketplace = requireAddress(s.marketplace, "marketplace address");
  const vault = requireAddress(s.vault, "vault address");
  const buyer = requireAddress(s.buyer, "buyer address");
  if (vault.equals(buyer)) throw new TypeError("Vault and buyer must differ");
  const resultTxHash = requireHash(s.resultTransactionHash, "result transaction hash");
  const resultMessageHash = requireHash(s.resultMessageHash, "result message hash");
  const dispatchTxHash = requireHash(s.dispatchTransactionHash, "dispatch transaction hash");
  const dispatchMessageHash = requireHash(s.dispatchMessageHash, "dispatch message hash");
  if (outcome === 1 && amount !== principal) throw new TypeError("Buyer-credit proof must cover full principal");
  if (outcome === 2 && amount >= principal) throw new TypeError("Bounce-return proof must expose a positive shortfall");
  // TON cells are limited to 1023 bits. Split the canonical statement into
  // three deterministic referenced cells; the root hash commits to all refs.
  const identityCell = beginCell()
    .storeAddress(marketplace)
    .storeAddress(vault)
    .storeAddress(buyer)
    .storeUint(orderId, 64)
    .storeCoins(principal)
    .endCell();
  const operationCell = beginCell()
    .storeUint(operationId, 64)
    .storeUint(queryId, 64)
    .endCell();
  const dispatchCell = beginCell()
    .storeUint(dispatchTxHash, 256)
    .storeUint(dispatchMessageHash, 256)
    .endCell();
  const resultCell = beginCell()
    .storeUint(outcome, 8)
    .storeUint(resultTxHash, 256)
    .storeUint(resultMessageHash, 256)
    .storeCoins(amount)
    .storeUint(anchorSeqno, 32)
    .storeUint(expiry, 64)
    .storeUint(epoch, 32)
    .endCell();
  return beginCell()
    .storeUint(DOMAIN, 32)
    .storeUint(schemaVersion, 16)
    .storeInt(networkGlobalId, 32)
    .storeRef(identityCell)
    .storeRef(operationCell)
    .storeRef(dispatchCell)
    .storeRef(resultCell)
    .endCell();
}

function parsePublicKey(hex) {
  if (typeof hex !== "string" || !/^[0-9a-f]{64}$/i.test(hex)) {
    throw new TypeError("Invalid Ed25519 validator public key");
  }
  return createPublicKey({
    key: Buffer.concat([SPKI_ED25519_PREFIX, Buffer.from(hex, "hex")]),
    format: "der",
    type: "spki",
  });
}

export function verifyV3SettlementAttestation({
  statement, signatures, validators, threshold, expectedNetworkGlobalId, activeEpoch, nowSeconds,
}) {
  if (!Array.isArray(validators) || !Array.isArray(signatures)) throw new TypeError("Invalid validator/signature set");
  requireInteger(threshold, 1, validators.length, "signature threshold");
  requireInteger(activeEpoch, 1, 0xffffffff, "active validator epoch");
  requireInteger(nowSeconds, 0, Number.MAX_SAFE_INTEGER, "current time");
  if (statement.epoch !== activeEpoch) throw new Error("Wrong validator epoch");
  if (statement.networkGlobalId !== expectedNetworkGlobalId) throw new Error("Wrong network domain");
  if (statement.expiresAt < nowSeconds) throw new Error("Expired settlement statement");
  const publicKeys = validators.map((v) => parsePublicKey(v.publicKey));
  const uniqueKeys = new Set(validators.map((v) => v.publicKey.toLowerCase()));
  if (uniqueKeys.size !== validators.length) throw new Error("Duplicate validator public key");
  const cell = buildV3SettlementStatementCell(statement);
  const digest = Buffer.from(cell.hash());
  const used = new Set();
  let valid = 0;
  for (const item of signatures) {
    const index = requireInteger(item.validatorIndex, 0, validators.length - 1, "validator index");
    if (used.has(index)) throw new Error("Duplicate validator signature");
    used.add(index);
    if (typeof item.signature !== "string" || !HEX64.test(item.signature)) {
      throw new TypeError("Invalid Ed25519 signature encoding");
    }
    if (!verifySignature(null, digest, publicKeys[index], Buffer.from(item.signature, "hex"))) {
      throw new Error("Invalid settlement signature");
    }
    valid++;
  }
  if (valid < threshold) throw new Error("Insufficient settlement quorum");
  return {
    verified: true,
    statementHash: cell.hash().toString("hex"),
    validSignatures: valid,
    threshold,
    epoch: activeEpoch,
    networkGlobalId: expectedNetworkGlobalId,
    // This model verifies attestor signatures only; it does not verify TON
    // transaction inclusion or masterchain finality itself.
    transactionInclusionVerified: false,
    mayAuthorizePayout: false,
  };
}
