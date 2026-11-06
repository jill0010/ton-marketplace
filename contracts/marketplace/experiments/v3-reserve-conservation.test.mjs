import test from "node:test";
import assert from "node:assert/strict";
import { auditV3ReserveConservation } from "./v3-reserve-conservation.mjs";

const ledger = (changes = {}) => ({
  fundedNano: "200000000", vaultRemainingNano: "5000000",
  buyerCreditedNano: "194000000", returnedToVaultNano: "0",
  pendingOutboundNano: "0", feesNano: "1000000",
  externalCompensationNano: "0", evidenceVerified: false, ...changes,
});
test("balanced reserve remains unverified and never permits a payout", () => {
  const result = auditV3ReserveConservation(ledger());
  assert.equal(result.balanced, true);
  assert.equal(result.accountingStatus, "QUARANTINED");
  assert.ok(result.reasons.includes("NO_INDEPENDENT_CHAIN_PROOF"));
  assert.equal(result.mayRetry, false);
  assert.equal(result.mayReleaseFunds, false);
  assert.equal(result.verifiedBuyerCreditNano, "0");
});
test("fee and principal mismatches quarantine funds", () => {
  for (const changes of [
    { feesNano: "0" }, { feesNano: "2000000" },
    { buyerCreditedNano: "195000000" },
    { vaultRemainingNano: "6000000" },
  ]) {
    const result = auditV3ReserveConservation(ledger(changes));
    assert.equal(result.balanced, false);
    assert.ok(result.reasons.includes("RESERVE_CONSERVATION_MISMATCH"));
    assert.equal(result.mayRetry, false);
  }
});
test("returned principal is not double counted as a new vault balance", () => {
  const result = auditV3ReserveConservation(ledger({
    vaultRemainingNano: "199000000", buyerCreditedNano: "0",
    returnedToVaultNano: "194000000",
  }));
  assert.equal(result.balanced, true);
  assert.equal(result.mayConfirmBounce, false);
});
test("pending outgoing transfer prevents any settlement authorization", () => {
  const result = auditV3ReserveConservation(ledger({
    vaultRemainingNano: "5000000", buyerCreditedNano: "0",
    pendingOutboundNano: "194000000",
  }));
  assert.equal(result.balanced, true);
  assert.ok(result.reasons.includes("OUTBOUND_STILL_PENDING"));
  assert.equal(result.mayRetry, false);
});
test("external compensation always blocks repayment even with balanced ledger", () => {
  const result = auditV3ReserveConservation(ledger({
    externalCompensationNano: "200000000", evidenceVerified: true,
  }));
  assert.ok(result.reasons.includes("EXTERNAL_COMPENSATION_REPAYMENT_BARRIER"));
  assert.equal(result.mayReleaseFunds, false);
  assert.equal(result.mayRetry, false);
});
test("even caller-asserted independent proof cannot authorize funds", () => {
  const result = auditV3ReserveConservation(ledger({ evidenceVerified: true }));
  assert.equal(result.accountingStatus, "ARITHMETIC_ONLY");
  assert.equal(result.proofStatus, "UNVERIFIED");
  assert.equal(result.mayConfirmReceipt, false);
});
test("invalid, negative, fractional or absent ledger amounts fail closed", () => {
  for (const bad of ["-1", "0.1", "01", "", 100, null, undefined]) {
    assert.throws(() => auditV3ReserveConservation(ledger({ feesNano: bad })), TypeError);
  }
});
test("rejects historical returned amount larger than funded reserve", () => {
  const result = auditV3ReserveConservation(ledger({
    returnedToVaultNano: "200000001",
  }));
  assert.ok(result.reasons.includes("RETURN_EXCEEDS_FUNDING"));
});
