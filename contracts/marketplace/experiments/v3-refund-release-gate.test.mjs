import test from "node:test";
import assert from "node:assert/strict";
import { auditV3RefundReleaseGate } from "./v3-refund-release-gate.mjs";
import { assessV3IndependentSettlement } from "./v3-independent-settlement-proof.mjs";
import { inspectV3BuyerReceiptProofRequirements } from "./v3-buyer-receipt-proof-requirements.mjs";

const vault = "0:" + "a".repeat(64);
const buyer = "0:" + "b".repeat(64);
const wrap = (address) => ({
  source: "toncenter-v2-unverified", trusted: false, address, transactions: [],
});
const inputs = (settlementOverrides = {}, ledgerOverrides = {}) => ({
  settlement: {
    vault, buyer, orderId: "1", queryId: "2",
    vaultResponse: wrap(vault), buyerResponse: wrap(buyer),
    externallyCompensated: false, ...settlementOverrides,
  },
  ledger: {
    fundedNano: "200000000", vaultRemainingNano: "200000000",
    buyerCreditedNano: "0", returnedToVaultNano: "0",
    pendingOutboundNano: "0", feesNano: "0",
    externalCompensationNano: "0", evidenceVerified: false,
    ...ledgerOverrides,
  },
});
test("balanced ledger and empty chain observations remain blocked", () => {
  const report = auditV3RefundReleaseGate(inputs());
  assert.equal(report.accountingBalanced, true);
  assert.equal(report.releaseStatus, "BLOCKED_UNVERIFIED");
  assert.equal(report.mayDeployMainnet, false);
  assert.equal(report.mayRetry, false);
  assert.equal(report.verifiedReturnedToVaultNano, "0");
});
test("unbalanced reserve explicitly blocks the release gate", () => {
  const report = auditV3RefundReleaseGate(inputs({}, { feesNano: "1" }));
  assert.equal(report.accountingBalanced, false);
  assert.ok(report.reasons.includes("RESERVE_LEDGER_UNBALANCED"));
  assert.equal(report.mayReleaseFunds, false);
});
test("either external compensation source permanently blocks repayment", () => {
  for (const input of [
    inputs({ externallyCompensated: true }),
    inputs({}, { externalCompensationNano: "200000000" }),
  ]) {
    const report = auditV3RefundReleaseGate(input);
    assert.ok(report.reasons.includes("EXTERNAL_COMPENSATION_NO_REPAYMENT"));
    assert.equal(report.mayRetry, false);
    assert.equal(report.mayConfirmReceipt, false);
  }
});
test("caller-asserted proof never opens a gate", () => {
  const report = auditV3RefundReleaseGate(inputs({}, { evidenceVerified: true }));
  assert.equal(report.releaseStatus, "BLOCKED_UNVERIFIED");
  assert.equal(report.mayDeployMainnet, false);
  assert.equal(report.proofStatus, "UNVERIFIED");
});
test("missing evidence inputs and invalid accounting fail closed", () => {
  assert.throws(() => auditV3RefundReleaseGate({}), TypeError);
  assert.throws(() => auditV3RefundReleaseGate(inputs({}, { fundedNano: "-1" })), TypeError);
});

test("two provider reports with different transaction hashes are not independent receipt proof", () => {
  const a = wrap(vault);
  const b = wrap(buyer);
  const c = wrap(vault);
  const d = wrap(buyer);
  a.network = b.network = c.network = d.network = "testnet";
  a.transactions = [{ transaction_id: { hash: "out-a" }, out_msgs: [] }];
  c.transactions = [{ transaction_id: { hash: "out-b" }, out_msgs: [] }];
  const report = assessV3IndependentSettlement({
    network: "testnet", vault, buyer, orderId: "2", queryId: "1",
    observations: [
      { vaultResponse: a, buyerResponse: b },
      { vaultResponse: c, buyerResponse: d },
    ],
  });
  assert.equal(report.observationAgreement, false);
  assert.equal(report.observedStatus, "CONFLICTING_UNVERIFIED_OBSERVATIONS");
  assert.equal(report.cryptographicInclusionVerified, false);
  assert.equal(report.mayConfirmReceipt, false);
  assert.equal(report.mayRetry, false);
});

test("self-reported cryptographic receipt flags never unlock buyer credit", () => {
  const evidence = inspectV3BuyerReceiptProofRequirements({
    network: "testnet", vault, buyer, orderId: "2", queryId: "1",
    amountNano: "194000000",
    dispatch: { account: vault, lt: "100", transactionHash: "dispatch", messageHash: "msg" },
    receipt: {
      account: buyer, lt: "101", transactionHash: "receipt",
      inboundMessageHash: "msg", amountNano: "194000000",
      orderId: "2", queryId: "1", source: vault, bounced: false, aborted: false,
    },
    independentVerifier: {
      kind: "audited-ton-lite-proof-verifier", masterchainAnchorVerified: true,
      dispatchInclusionVerified: true, receiptInclusionVerified: true,
      finalityVerified: true,
    },
  });
  assert.equal(evidence.requirementsDescribed, true);
  assert.equal(evidence.cryptographicInclusionVerified, false);
  assert.equal(evidence.finalized, false);
  assert.equal(evidence.mayConfirmReceipt, false);
  assert.equal(evidence.mayRetry, false);
});
test("missing receipt message identity cannot be treated as settlement", () => {
  const evidence = inspectV3BuyerReceiptProofRequirements({
    network: "testnet", vault, buyer, orderId: "2", queryId: "1",
    amountNano: "194000000",
  });
  assert.ok(evidence.reasons.includes("MISSING_MATCHING_BUYER_RECEIPT_IDENTITY"));
  assert.equal(evidence.mayConfirmReceipt, false);
});
