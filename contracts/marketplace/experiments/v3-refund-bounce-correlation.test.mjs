import test from "node:test";
import assert from "node:assert/strict";
import { beginCell } from "@ton/core";
import { correlateV3RefundBounce } from "./v3-refund-bounce-correlation.mjs";

const vault = "0:" + "a".repeat(64);
const buyer = "0:" + "b".repeat(64);
const body = beginCell().storeUint(0x72730105, 32)
  .storeUint(1, 64).storeUint(2, 64).storeCoins(194000000n).endCell().toBoc().toString("base64");
const tx = (hash, in_msg, out_msgs = []) => ({
  transaction_id: { hash, lt: "1" }, in_msg, out_msgs,
});
const outgoing = {
  source: vault, destination: buyer, value: "194000000",
  msg_data: { "@type": "msg.dataRaw", body },
};
const bounced = (value) => ({
  source: buyer, destination: vault, value, bounced: true, hash: "bounce-msg",
});
const response = (transactions) => ({
  source: "toncenter-v2-unverified", trusted: false, address: vault, transactions,
});
const options = { vault, buyer, orderId: "1", queryId: "2" };

test("reports a plausible bounce as unproven and never retryable", () => {
  const result = correlateV3RefundBounce({
    ...options, vaultResponse: response([
      tx("out-tx", null, [outgoing]),
      tx("bounce-tx", bounced("193000000")),
    ]),
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].linkageStatus, "UNPROVEN");
  assert.equal(result.candidates[0].principalVerified, false);
  assert.equal(result.mayRetry, false);
  assert.equal(result.mayConfirmBounce, false);
  assert.equal(result.accountingStatus, "NO_VERIFIED_PRINCIPAL");
});
test("rejects bounced amounts larger than original outgoing payment", () => {
  const result = correlateV3RefundBounce({
    ...options, vaultResponse: response([
      tx("out-tx", null, [outgoing]),
      tx("bounce-tx", bounced("195000000")),
    ]),
  });
  assert.equal(result.candidates.length, 0);
});
test("missing bounce transaction identity cannot be paired", () => {
  const result = correlateV3RefundBounce({
    ...options, vaultResponse: response([
      tx("out-tx", null, [outgoing]),
      tx(null, bounced("193000000")),
    ]),
  });
  assert.equal(result.candidates.length, 0);
});

test("rejects insufficient returned principal even when bounced flag is set", () => {
  const result = correlateV3RefundBounce({
    ...options, vaultResponse: response([
      tx("out-tx", null, [outgoing]),
      tx("bounce-tx", bounced("183999999")),
    ]),
  });
  assert.equal(result.candidates.length, 0);
  assert.equal(result.verifiedReturnedNano, "0");
});
test("quarantines ambiguous multiple bounces and never sums candidate amounts", () => {
  const result = correlateV3RefundBounce({
    ...options, vaultResponse: response([
      tx("out-tx", null, [outgoing]),
      tx("bounce-1", bounced("193000000")),
      tx("bounce-2", { ...bounced("192000000"), hash: "other-bounce" }),
    ]),
  });
  assert.equal(result.candidates.length, 2);
  assert.equal(result.ambiguous, true);
  assert.equal(result.candidates[0].linkageStatus, "AMBIGUOUS_UNPROVEN");
  assert.equal(result.verifiedReturnedNano, "0");
  assert.equal(result.mayRetry, false);
});

test("rejects accounting even when one bounce candidate appears unique", () => {
  const result = correlateV3RefundBounce({
    ...options, vaultResponse: response([
      tx("out-tx", null, [outgoing]),
      tx("bounce-tx", bounced("194000000")),
    ]),
  });
  assert.equal(result.ambiguous, false);
  assert.equal(result.verifiedReturnedNano, "0");
  assert.equal(result.accountingStatus, "NO_VERIFIED_PRINCIPAL");
  assert.equal(result.mayConfirmBounce, false);
  assert.equal(result.mayRetry, false);
});

test("fails closed on too many unverified bounced transfers", () => {
  const transactions = [
    tx("out-tx", null, [outgoing]),
    ...Array.from({ length: 21 }, (_, index) =>
      tx("bounce-" + index, { ...bounced("193000000"), hash: "bounce-msg-" + index })),
  ];
  const result = correlateV3RefundBounce({
    ...options, vaultResponse: response(transactions),
  });
  assert.equal(result.reason, "TOO_MANY_UNVERIFIED_CANDIDATES");
  assert.equal(result.ambiguous, true);
  assert.deepEqual(result.candidates, []);
  assert.equal(result.verifiedReturnedNano, "0");
  assert.equal(result.mayConfirmBounce, false);
  assert.equal(result.mayRetry, false);
});
