import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { buildV3SettlementStatementCell, verifyV3SettlementAttestation } from "./v3-settlement-attestation.mjs";

const keys = Array.from({ length: 3 }, () => generateKeyPairSync("ed25519"));
const validators = keys.map(({ publicKey }) => ({
  publicKey: publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex"),
}));
const statement = {
  schemaVersion: 1,
  networkGlobalId: -3,
  marketplace: "0:" + "1".repeat(64),
  vault: "0:" + "2".repeat(64),
  buyer: "0:" + "3".repeat(64),
  orderId: 17n,
  principalNano: 200_000_000n,
  operationId: 2n,
  queryId: 99n,
  outcome: 1,
  dispatchTransactionHash: "4".repeat(64),
  dispatchMessageHash: "5".repeat(64),
  resultTransactionHash: "6".repeat(64),
  resultMessageHash: "7".repeat(64),
  settledNano: 200_000_000n,
  masterchainSeqno: 123456,
  expiresAt: 2_000_000_000,
  epoch: 4,
};
const signedBy = (...indices) => {
  const digest = Buffer.from(buildV3SettlementStatementCell(statement).hash());
  return indices.map((validatorIndex) => ({
    validatorIndex,
    signature: sign(null, digest, keys[validatorIndex].privateKey).toString("hex"),
  }));
};
const verify = (overrides = {}) => verifyV3SettlementAttestation({
  statement, signatures: signedBy(0, 1), validators, threshold: 2,
  expectedNetworkGlobalId: -3, activeEpoch: 4, nowSeconds: 1_900_000_000,
  ...overrides,
});

test("canonical statement is deterministic and binds every settlement field", () => {
  const first = buildV3SettlementStatementCell(statement);
  const second = buildV3SettlementStatementCell({ ...statement });
  assert.equal(first.hash().toString("hex"), second.hash().toString("hex"));
  assert.notEqual(first.hash().toString("hex"),
    buildV3SettlementStatementCell({ ...statement, queryId: 100n }).hash().toString("hex"));
  assert.notEqual(first.hash().toString("hex"),
    buildV3SettlementStatementCell({ ...statement, networkGlobalId: -239 }).hash().toString("hex"));
});

test("accepts two distinct valid Ed25519 attestations at the configured threshold", () => {
  const result = verify();
  assert.equal(result.verified, true);
  assert.equal(result.validSignatures, 2);
  assert.equal(result.threshold, 2);
  assert.equal(result.transactionInclusionVerified, false);
  assert.equal(result.mayAuthorizePayout, false);
});

test("rejects insufficient quorum and duplicate signer indices", () => {
  assert.throws(() => verify({ signatures: signedBy(0) }), /Insufficient settlement quorum/);
  assert.throws(() => verify({ signatures: [...signedBy(0), ...signedBy(0)] }), /Duplicate validator signature/);
});

test("rejects invalid signature, malformed signature, and unknown signer", () => {
  const bad = signedBy(0, 1);
  bad[1] = { ...bad[1], signature: "00".repeat(64) };
  assert.throws(() => verify({ signatures: bad }), /Invalid settlement signature/);
  assert.throws(() => verify({ signatures: [{ validatorIndex: 0, signature: "abcd" }] }), /Invalid Ed25519 signature encoding/);
  assert.throws(() => verify({ signatures: [{ validatorIndex: 9, signature: "00".repeat(64) }] }), /Invalid validator index/);
});

test("rejects wrong network, stale epoch, and expired statement", () => {
  assert.throws(() => verify({ expectedNetworkGlobalId: -239 }), /Wrong network domain/);
  assert.throws(() => verify({ activeEpoch: 5 }), /Wrong validator epoch/);
  assert.throws(() => verify({ nowSeconds: 2_000_000_001 }), /Expired settlement statement/);
});

test("rejects duplicate configured keys and malformed principal/outcome fields", () => {
  assert.throws(() => verify({ validators: [validators[0], validators[0], validators[2]] }), /Duplicate validator public key/);
  assert.throws(() => buildV3SettlementStatementCell({ ...statement, settledNano: 199_000_000n }), /full principal/);
  assert.throws(() => buildV3SettlementStatementCell({ ...statement, outcome: 2, settledNano: 200_000_000n }), /positive shortfall/);
});

test("rejects invalid address/hash and non-positive replay identifiers", () => {
  assert.throws(() => buildV3SettlementStatementCell({ ...statement, buyer: "not-an-address" }), /Invalid buyer address/);
  assert.throws(() => buildV3SettlementStatementCell({ ...statement, resultMessageHash: "abc" }), /Invalid result message hash/);
  assert.throws(() => buildV3SettlementStatementCell({ ...statement, operationId: 0n }), /Invalid operation ID/);
});

test("bounce-return statement binds exact returned amount below principal", () => {
  const bounced = { ...statement, outcome: 2, settledNano: 199_000_000n };
  const cell = buildV3SettlementStatementCell(bounced);
  assert.ok(cell.hash().length === 32);
  assert.throws(() => buildV3SettlementStatementCell({ ...bounced, settledNano: 0n }), /Invalid settled amount/);
});
