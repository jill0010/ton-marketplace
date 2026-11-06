// Deterministic property-style adversarial checks, without wallet keys,
// network calls, timers, randomness, or any transaction side effects.
import test from "node:test";
import assert from "node:assert/strict";
import { auditV3ReserveConservation } from "./v3-reserve-conservation.mjs";
import { auditV3RefundReleaseGate } from "./v3-refund-release-gate.mjs";

const vault = "0:" + "a".repeat(64);
const buyer = "0:" + "b".repeat(64);
const wrap = (address) => ({
  source: "toncenter-v2-unverified", trusted: false, address, transactions: [],
});
const settlement = {
  vault, buyer, orderId: "1", queryId: "2",
  vaultResponse: wrap(vault), buyerResponse: wrap(buyer),
};
const ledger = (funded, remaining, credited, pending, fees, compensation = 0n) => ({
  fundedNano: String(funded), vaultRemainingNano: String(remaining),
  buyerCreditedNano: String(credited), pendingOutboundNano: String(pending),
  feesNano: String(fees), returnedToVaultNano: "0",
  externalCompensationNano: String(compensation), evidenceVerified: true,
});

test("1024 balanced principal partitions never authorize money movement", () => {
  const funded = 200000000n;
  for (let i = 0; i < 1024; i++) {
    const credited = BigInt((i * 7919) % 100000000);
    const pending = BigInt((i * 337) % 50000000);
    const fees = BigInt((i * 13) % 10000000);
    const remaining = funded - credited - pending - fees;
    const input = ledger(funded, remaining, credited, pending, fees,
      i % 7 === 0 ? funded : 0n);
    const report = auditV3RefundReleaseGate({ settlement, ledger: input });
    assert.equal(report.accountingBalanced, true, "partition " + i);
    assert.equal(report.mayRetry, false);
    assert.equal(report.mayReleaseFunds, false);
    assert.equal(report.mayDeployMainnet, false);
    assert.equal(report.verifiedBuyerCreditNano, "0");
    assert.equal(report.verifiedReturnedToVaultNano, "0");
  }
});
test("1024 one-nano conservation perturbations are always quarantined", () => {
  const funded = 200000000n;
  for (let i = 0; i < 1024; i++) {
    const credited = BigInt((i * 7919) % 100000000);
    const pending = BigInt((i * 337) % 50000000);
    const fees = BigInt((i * 13) % 10000000);
    const remaining = funded - credited - pending - fees;
    const delta = i % 2 ? 1n : -1n;
    const report = auditV3ReserveConservation(
      ledger(funded, remaining + delta, credited, pending, fees));
    assert.equal(report.balanced, false, "perturbation " + i);
    assert.ok(report.reasons.includes("RESERVE_CONSERVATION_MISMATCH"));
    assert.equal(report.mayRetry, false);
  }
});
test("compensation and pending outbound never bypass gate even with exact arithmetic", () => {
  const input = ledger(200000000n, 0n, 0n, 200000000n, 0n, 200000000n);
  const report = auditV3RefundReleaseGate({
    settlement: { ...settlement, externallyCompensated: true },
    ledger: input,
  });
  assert.equal(report.accountingBalanced, true);
  assert.ok(report.reasons.includes("EXTERNAL_COMPENSATION_NO_REPAYMENT"));
  assert.ok(report.reasons.includes("OUTBOUND_STILL_PENDING"));
  assert.equal(report.mayConfirmBounce, false);
  assert.equal(report.mayRetry, false);
});
