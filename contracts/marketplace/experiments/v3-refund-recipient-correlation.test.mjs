import test from "node:test";
import assert from "node:assert/strict";
import { beginCell } from "@ton/core";
import { correlateV3RefundRecipient } from "./v3-refund-recipient-correlation.mjs";

const vault = "0:" + "a".repeat(64);
const buyer = "0:" + "b".repeat(64);
const other = "0:" + "c".repeat(64);
const body = (order, query) => beginCell().storeUint(0x72730105, 32)
  .storeUint(order, 64).storeUint(query, 64).storeCoins(194000000n).endCell().toBoc().toString("base64");
const message = (order = 1, query = 2, overrides = {}) => ({
  source: vault, destination: buyer, value: "194000000", hash: "same-message-hash",
  msg_data: { "@type": "msg.dataRaw", body: body(order, query) }, ...overrides,
});
const response = (address, transactions) => ({
  source: "toncenter-v2-unverified", trusted: false, address, transactions,
});
const vaultResponse = response(vault, [{
  transaction_id: { lt: "1", hash: "out-tx" }, out_msgs: [message()],
}]);
const buyerResponse = (inbound) => response(buyer, [{
  transaction_id: { lt: "2", hash: "in-tx" }, in_msg: inbound,
}]);
const options = { vault, buyer, orderId: "1", queryId: "2" };

test("finds matching outbound/inbound candidate but never confirms payment", () => {
  const result = correlateV3RefundRecipient({
    ...options, vaultResponse, buyerResponse: buyerResponse(message()),
  });
  assert.equal(result.recipientCandidates.length, 1);
  assert.equal(result.recipientCandidates[0].inboundTransactionHash, "in-tx");
  assert.equal(result.recipientCandidates[0].messageHash, "same-message-hash");
  assert.equal(result.recipientCandidates[0].verified, false);
  assert.equal(result.proofStatus, "UNVERIFIED");
  assert.equal(result.mayRetry, false);
});
test("rejects wrong buyer, amount, order or query", () => {
  for (const inbound of [
    message(1, 2, { source: other }),
    message(1, 2, { destination: other }),
    message(1, 2, { value: "1" }),
    message(2, 2),
    message(1, 3),
  ]) {
    const result = correlateV3RefundRecipient({
      ...options, vaultResponse, buyerResponse: buyerResponse(inbound),
    });
    assert.equal(result.recipientCandidates.length, 0);
  }
});
test("rejects mismatched buyer account and untrusted transport claims", () => {
  assert.throws(() => correlateV3RefundRecipient({
    ...options, vaultResponse, buyerResponse: response(other, []),
  }), TypeError);
  assert.throws(() => correlateV3RefundRecipient({
    ...options, vaultResponse, buyerResponse: { ...response(buyer, []), trusted: true },
  }), TypeError);
});

test("rejects missing or mismatched message hashes and ambiguous outbound duplicates", () => {
  for (const inbound of [
    message(1, 2, { hash: "different" }),
    message(1, 2, { hash: undefined }),
    message(1, 2, { hash: "" }),
  ]) {
    const result = correlateV3RefundRecipient({
      ...options, vaultResponse, buyerResponse: buyerResponse(inbound),
    });
    assert.equal(result.recipientCandidates.length, 0);
  }
  const duplicated = response(vault, [{
    transaction_id: { lt: "1", hash: "out-tx" },
    out_msgs: [message(), message()],
  }]);
  assert.equal(correlateV3RefundRecipient({
    ...options, vaultResponse: duplicated, buyerResponse: buyerResponse(message()),
  }).recipientCandidates.length, 0);
});

test("aborted or explicitly failed buyer transactions are not receipt candidates", () => {
  for (const description of [
    { aborted: true },
    { aborted: false, compute_ph: { success: false } },
    { aborted: false, action: { success: false } },
  ]) {
    const buyerTx = response(buyer, [{
      transaction_id: { lt: "2", hash: "in-tx" },
      in_msg: message(),
      description,
    }]);
    const result = correlateV3RefundRecipient({
      ...options, vaultResponse, buyerResponse: buyerTx,
    });
    assert.equal(result.recipientCandidates.length, 0);
  }
});
test("provider-reported execution success is not finalized payment proof", () => {
  const buyerTx = response(buyer, [{
    transaction_id: { lt: "2", hash: "in-tx" },
    in_msg: message(),
    description: { aborted: false, compute_ph: { success: true } },
  }]);
  const result = correlateV3RefundRecipient({
    ...options, vaultResponse, buyerResponse: buyerTx,
  });
  assert.equal(result.recipientCandidates[0].executionStatus, "REPORTED_SUCCESS");
  assert.equal(result.recipientCandidates[0].verified, false);
  assert.equal(result.recipientCandidates[0].finalized, false);
});

test("fails closed on duplicated outbound transaction identity", () => {
  const duplicated = response(vault, [
    vaultResponse.transactions[0], vaultResponse.transactions[0],
  ]);
  const result = correlateV3RefundRecipient({
    ...options, vaultResponse: duplicated, buyerResponse: buyerResponse(message()),
  });
  assert.equal(result.recipientCandidates.length, 0);
  assert.equal(result.mayRetry, false);
});
test("fails closed on duplicated or missing recipient transaction identity", () => {
  const one = buyerResponse(message()).transactions[0];
  for (const transactions of [
    [one, one],
    [{ ...one, transaction_id: { hash: "" } }],
    [{ ...one, transaction_id: null }],
  ]) {
    const result = correlateV3RefundRecipient({
      ...options, vaultResponse, buyerResponse: response(buyer, transactions),
    });
    assert.equal(result.recipientCandidates.length, 0);
  }
});
test("fails closed on multiple distinct buyer receipts for one outbound refund", () => {
  const one = buyerResponse(message()).transactions[0];
  const result = correlateV3RefundRecipient({
    ...options, vaultResponse,
    buyerResponse: response(buyer, [
      one, { ...one, transaction_id: { hash: "other-buyer-tx", lt: "3" } },
    ]),
  });
  assert.equal(result.ambiguous, true);
  assert.equal(result.recipientCandidates.length, 0);
  assert.equal(result.mayRetry, false);
});
