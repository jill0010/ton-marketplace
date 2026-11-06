import test from "node:test";
import assert from "node:assert/strict";
import { auditV3TestnetEvidenceBundle, auditV3TestnetBundleWithSettlement } from "./v3-testnet-evidence-bundle.mjs";

const vault = "0:" + "a".repeat(64);
const buyer = "0:" + "b".repeat(64);
const hash = "c".repeat(64);
const bundle = (changes = {}) => ({
  network: "-3", vault, buyer, orderId: "1", queryId: "2",
  transactions: [{ account: vault, lt: "100", hash, role: "dispatch" }],
  independentChainProof: false, ...changes,
});
const wrap = (address) => ({
  source: "toncenter-v2-unverified", trusted: false, address, transactions: [],
});
const settlement = {
  vault, buyer, orderId: "1", queryId: "2",
  vaultResponse: wrap(vault), buyerResponse: wrap(buyer),
};
const ledger = {
  fundedNano: "200000000", vaultRemainingNano: "200000000",
  buyerCreditedNano: "0", pendingOutboundNano: "0",
  returnedToVaultNano: "0", feesNano: "0",
  externalCompensationNano: "0", evidenceVerified: true,
};
test("testnet evidence bundle remains unverified even with a transaction hash", () => {
  const report = auditV3TestnetEvidenceBundle(bundle());
  assert.equal(report.evidenceStatus, "UNVERIFIED_TESTNET_BUNDLE");
  assert.equal(report.mayDeployMainnet, false);
  assert.equal(report.mayRetry, false);
});
test("self-reported chain proof cannot authorize a transfer", () => {
  const report = auditV3TestnetEvidenceBundle(bundle({ independentChainProof: { claimed: true } }));
  assert.ok(report.reasons.includes("UNVERIFIED_SELF_REPORTED_CHAIN_PROOF"));
  assert.equal(report.mayReleaseFunds, false);
});
test("duplicate account and logical time are quarantined", () => {
  const tx = bundle().transactions[0];
  const report = auditV3TestnetEvidenceBundle(bundle({
    transactions: [tx, { ...tx, hash: "d".repeat(64), role: "fee" }],
  }));
  assert.ok(report.reasons.includes("DUPLICATE_ACCOUNT_LT"));
});
test("misattributed buyer receipt and bounce are quarantined", () => {
  const report = auditV3TestnetEvidenceBundle(bundle({
    transactions: [
      { account: vault, lt: "1", hash, role: "buyer_receipt" },
      { account: buyer, lt: "2", hash: "d".repeat(64), role: "bounce" },
    ],
  }));
  assert.ok(report.reasons.includes("RECEIPT_ACCOUNT_MISMATCH"));
  assert.ok(report.reasons.includes("BOUNCE_ACCOUNT_MISMATCH"));
});
test("missing, malformed or wrong-network evidence fails closed", () => {
  for (const changes of [
    { network: "-239" }, { vault: buyer }, { queryId: "0" },
    { transactions: [{ account: vault, lt: "-1", hash, role: "dispatch" }] },
    { transactions: [{ account: vault, lt: "1", hash: "bad", role: "dispatch" }] },
  ]) assert.throws(() => auditV3TestnetEvidenceBundle(bundle(changes)), TypeError);
});
test("combined evidence requires matching order and wallet identities", () => {
  assert.throws(() => auditV3TestnetBundleWithSettlement(
    bundle({ orderId: "3" }), settlement, ledger), TypeError);
  const report = auditV3TestnetBundleWithSettlement(bundle(), settlement, ledger);
  assert.equal(report.accountingBalanced, true);
  assert.equal(report.releaseStatus, "BLOCKED_UNVERIFIED");
  assert.equal(report.mayRetry, false);
});
