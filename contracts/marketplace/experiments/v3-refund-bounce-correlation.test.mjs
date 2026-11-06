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
