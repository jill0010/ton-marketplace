import test from "node:test";
import assert from "node:assert/strict";
import { beginCell } from "@ton/core";
import { findV3RefundMessageCandidates } from "./v3-refund-message-matcher.mjs";
import { TEST_RESERVE_BUYER_PAYMENT_OPCODE } from "./v3-refund-body-decoder.mjs";

const vault = "0:" + "a".repeat(64);
const buyer = "0:" + "b".repeat(64);
const other = "0:" + "c".repeat(64);
const body = (opcode, order, query) => beginCell()
  .storeUint(opcode, 32).storeUint(order, 64).storeUint(query, 64).storeCoins(194000000n)
  .endCell().toBoc().toString("base64");
const msg = (order, query, overrides = {}) => ({
  source: vault, destination: buyer, value: "194000000",
  msg_data: { "@type": "msg.dataRaw", body: body(TEST_RESERVE_BUYER_PAYMENT_OPCODE, order, query) },
  ...overrides,
});
const response = (messages) => ({
  source: "toncenter-v2-unverified", trusted: false, address: vault,
  transactions: [{ transaction_id: { lt: "123", hash: "tx" }, out_msgs: messages }],
});
const options = { vault, buyer, orderId: "1", queryId: "2" };

test("matches only exact V3 refund order and query while withholding proof", () => {
  const report = findV3RefundMessageCandidates(response([
    msg(1, 2), msg(1, 3), msg(2, 2),
    msg(1, 2, { destination: other }),
    msg(1, 2, { value: "0" }),
    msg(1, 2, { value: "193000000" }),
    msg(1, 2, { msg_data: { "@type": "msg.dataRaw", body: body(0x72730104, 1, 2) } }),
    msg(1, 2, { msg_data: { "@type": "msg.dataText", text: "hello" } }),
  ]), options);
  assert.equal(report.matches.length, 1);
  assert.equal(report.matches[0].transactionLt, "123");
  assert.equal(report.matches[0].orderId, "1");
  assert.equal(report.matches[0].queryId, "2");
  assert.equal(report.matches[0].verified, false);
  assert.equal(report.proofStatus, "UNVERIFIED");
  assert.equal(report.mayRetry, false);
});
test("rejects wrong source identity and malformed search identifiers", () => {
  assert.throws(() => findV3RefundMessageCandidates(response([]), { ...options, queryId: "0" }), TypeError);
  assert.throws(() => findV3RefundMessageCandidates(response([]), { ...options, orderId: "abc" }), TypeError);
  assert.throws(() => findV3RefundMessageCandidates({ ...response([]), trusted: true }, options), TypeError);
  assert.throws(() => findV3RefundMessageCandidates({ ...response([]), address: other }, options), TypeError);
});

test("rejects provider-reported failed vault dispatch, never upgrading unknown execution", () => {
  for (const description of [
    { aborted: true },
    { compute_ph: { success: false } },
    { action: { success: false } },
  ]) {
    const candidate = response([msg(1, 2)]);
    candidate.transactions[0].description = description;
    const report = findV3RefundMessageCandidates(candidate, options);
    assert.equal(report.matches.length, 0);
    assert.equal(report.mayRetry, false);
  }
  const unknown = findV3RefundMessageCandidates(response([msg(1, 2)]), options);
  assert.equal(unknown.matches[0].executionStatus, "UNKNOWN");
  assert.equal(unknown.matches[0].verified, false);
  const reported = response([msg(1, 2)]);
  reported.transactions[0].description = {
    aborted: false, compute_ph: { success: true }, action: { success: true },
  };
  const report = findV3RefundMessageCandidates(reported, options);
  assert.equal(report.matches[0].executionStatus, "REPORTED_SUCCESS");
  assert.equal(report.matches[0].verified, false);
  assert.equal(report.matches[0].finalized, false);
});

test("quarantines oversized outgoing history and invalid workchain", () => {
  const oversized = response([msg(1, 2)]);
  oversized.transactions = Array.from({ length: 201 }, (_, i) => ({
    transaction_id: { lt: String(i + 1), hash: "tx-" + i }, out_msgs: [msg(1, 2)],
  }));
  const result = findV3RefundMessageCandidates(oversized, options);
  assert.equal(result.ambiguous, true);
  assert.equal(result.matches.length, 0);
  assert.equal(result.mayRetry, false);
  assert.throws(() => findV3RefundMessageCandidates(response([]), {
    ...options, buyer: "1:" + "b".repeat(64),
  }), TypeError);
});
