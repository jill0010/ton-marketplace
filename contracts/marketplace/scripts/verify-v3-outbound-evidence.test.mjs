import test from "node:test";
import assert from "node:assert/strict";
import { assessOutboundEvidence, checkOutboundEvidence } from "./verify-v3-outbound-evidence.mjs";
const source = "0:" + "1".repeat(64), recipient = "0:" + "2".repeat(64);
const messageHash = "a".repeat(64);
const expected = { source, recipient, messageHash, amountNano: "200000000" };
const tx = { account: source, hash: "b".repeat(64), lt: "100", aborted: false,
  action_phase: { success: true },
  out_msgs: [{ hash: messageHash, destination: recipient, value: "200000000" }] };
test("source transaction requires exact successful outbound evidence", () => {
  assert.equal(assessOutboundEvidence([tx], expected).verified, true);
  assert.equal(assessOutboundEvidence([], expected).verified, false);
  assert.equal(assessOutboundEvidence([tx, tx], expected).reason, "DUPLICATE_OUTBOUND");
  assert.equal(assessOutboundEvidence([{ ...tx, aborted: true }], expected).verified, false);
  assert.equal(assessOutboundEvidence([{ ...tx, out_msgs: [{ ...tx.out_msgs[0], value: "1" }] }], expected).reason, "AMOUNT_MISMATCH");
  assert.equal(assessOutboundEvidence([{ ...tx, out_msgs: [{ ...tx.out_msgs[0], destination: source }] }], expected).reason, "DESTINATION_MISMATCH");
});
test("outbound evidence collection is public testnet GET only", async () => {
  const result = await checkOutboundEvidence(expected, async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.hostname, "testnet.toncenter.com");
    assert.equal(parsed.pathname, "/api/v3/transactions");
    assert.equal(options.method, "GET");
    return { ok: true, json: async () => ({ transactions: [tx] }) };
  });
  assert.equal(result.verified, true);
  assert.equal(result.recipientCreditVerified, false);
});
