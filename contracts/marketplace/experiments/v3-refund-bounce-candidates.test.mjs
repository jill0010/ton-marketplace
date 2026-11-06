import test from "node:test";
import assert from "node:assert/strict";
import { beginCell } from "@ton/core";
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
const richBounceBody = (order = 1, query = 2, amount = 194000000n, prefix = 0xfffffffe) =>
  beginCell().storeUint(prefix, 32).storeUint(0x72730105, 32)
    .storeUint(order, 64).storeUint(query, 64).storeCoins(amount)
    .endCell().toBoc().toString("base64");
const message = (overrides = {}) => ({
  source: buyer, destination: vault, bounced: true,
  value: "193000000", hash: "bounce-hash",
  msg_data: { "@type": "msg.dataRaw", body: richBounceBody() },
  ...overrides,
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

test("rejects a bounced flag without a valid rich bounce envelope", () => {
  const report = findV3RefundBounceCandidates({
    vaultResponse: response([
      message({ msg_data: undefined }),
      message({ msg_data: { "@type": "msg.dataRaw", body: richBounceBody(1, 2, 194000000n, 0xffffffff) } }),
      message({ msg_data: { "@type": "msg.dataRaw", body: "invalid" } }),
      message(),
    ]), vault, buyer,
  });
  assert.equal(report.candidates.length, 1);
  assert.equal(report.candidates[0].orderId, "1");
  assert.equal(report.candidates[0].queryId, "2");
  assert.equal(report.candidates[0].originalAmountNano, "194000000");
  assert.equal(report.candidates[0].principalVerified, false);
});
