import test from "node:test";
import assert from "node:assert/strict";
import { auditV3RefundReleaseGate } from "./v3-refund-release-gate.mjs";

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
