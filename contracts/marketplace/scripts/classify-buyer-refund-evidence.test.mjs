import test from "node:test";
import assert from "node:assert/strict";
import { classifyBuyerRefundEvidence as classify } from "./classify-buyer-refund-evidence.mjs";
const base = {
  outboundVerified: true, recipientReceiptVerified: false,
  bounceVerified: false, returnedPrincipalVerified: false,
  sameOperationVerified: true, conflictingEvidence: false,
};
test("recipient independently confirmed => received, never retry", () => {
  assert.deepEqual(classify({ ...base, recipientReceiptVerified: true }), {
    state: "RECEIVED", retryAuthorized: false, requiresManualReview: false,
  });
});
test("verified bounce and returned principal => returned, still no automatic retry", () => {
  assert.deepEqual(classify({ ...base, bounceVerified: true, returnedPrincipalVerified: true }), {
    state: "RETURNED", retryAuthorized: false, requiresManualReview: true,
  });
});
test("bounce alone, returned principal alone and missing receipt => unknown", () => {
  for (const flags of [{ bounceVerified: true }, { returnedPrincipalVerified: true }, {}]) {
    assert.equal(classify({ ...base, ...flags }).state, "UNKNOWN");
  }
});
test("conflicting evidence is never treated as receipt or refund authorization", () => {
  for (const flags of [
    { recipientReceiptVerified: true, bounceVerified: true },
    { recipientReceiptVerified: true, returnedPrincipalVerified: true },
    { conflictingEvidence: true },
  ]) {
    const result = classify({ ...base, ...flags });
    assert.equal(result.state, "CONFLICT");
    assert.equal(result.retryAuthorized, false);
  }
});
test("missing operation match or outbound proof fails closed", () => {
  for (const flags of [{ sameOperationVerified: false }, { outboundVerified: false }]) {
    const result = classify({ ...base, recipientReceiptVerified: true, ...flags });
    assert.equal(result.state, "UNKNOWN");
    assert.equal(result.retryAuthorized, false);
  }
});
test("missing or malformed evidence fails closed", () => {
  for (const input of [null, [], {}, { ...base, bounceVerified: "true" }]) {
    assert.throws(() => classify(input), TypeError);
  }
});
