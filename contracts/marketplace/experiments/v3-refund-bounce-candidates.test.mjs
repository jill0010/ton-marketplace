import test from "node:test";
import assert from "node:assert/strict";
import { findV3RefundBounceCandidates } from "./v3-refund-bounce-candidates.mjs";

const vault = "0:" + "a".repeat(64);
const buyer = "0:" + "b".repeat(64);
const other = "0:" + "c".repeat(64);
const response = (messages) => ({
  source: "toncenter-v2-unverified", trusted: false, address: vault,
  transactions: messages.map((in_msg, i) => ({
    transaction_id: { lt: String(i + 1), hash: "tx" + i }, in_msg,
  })),
});
const message = (overrides = {}) => ({
  source: buyer, destination: vault, bounced: true,
  value: "193000000", hash: "bounce-hash", ...overrides,
});

test("reports bounced incoming transfer as unverified candidate, never proof", () => {
  const report = findV3RefundBounceCandidates({
    vaultResponse: response([message()]), vault, buyer,
  });
  assert.equal(report.candidates.length, 1);
  assert.equal(report.candidates[0].amountNano, "193000000");
  assert.equal(report.candidates[0].principalVerified, false);
  assert.equal(report.candidates[0].mayRetry, false);
  assert.equal(report.proofStatus, "UNVERIFIED");
});
test("rejects spoofed sender, destination, bounce flag and invalid values", () => {
  const report = findV3RefundBounceCandidates({
    vaultResponse: response([
      message({ source: other }), message({ destination: other }),
      message({ bounced: false }), message({ bounced: undefined }),
      message({ value: "0" }), message({ value: "invalid" }),
      message(),
    ]), vault, buyer,
  });
  assert.equal(report.candidates.length, 1);
});
test("rejects mismatched account and unrecognized provider data", () => {
  assert.throws(() => findV3RefundBounceCandidates({
    vaultResponse: { ...response([]), address: other }, vault, buyer,
  }), TypeError);
  assert.throws(() => findV3RefundBounceCandidates({
    vaultResponse: { ...response([]), trusted: true }, vault, buyer,
  }), TypeError);
});
