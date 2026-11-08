import test from "node:test";
import assert from "node:assert/strict";
import { assessRecipientCredit, checkRecipientCredit } from "./verify-v3-recipient-credit.mjs";
const recipient = "0:" + "1".repeat(64);
const source = "0:" + "2".repeat(64);
const messageHash = "a".repeat(64);
const expected = { recipient, source, messageHash, amountNano: "200000000" };
const tx = { account: recipient, hash: "b".repeat(64), lt: "123", aborted: false,
  compute_phase: { success: true }, in_msg: { source, hash: messageHash, value: "200000000" } };
test("recipient credit requires matching successful inbound transfer", () => {
  assert.equal(assessRecipientCredit([tx], expected).verified, true);
  assert.equal(assessRecipientCredit([], expected).verified, false);
  assert.equal(assessRecipientCredit([tx, tx], expected).reason, "DUPLICATE_INBOUND_MESSAGE");
  assert.equal(assessRecipientCredit([{ ...tx, aborted: true }], expected).verified, false);
  assert.equal(assessRecipientCredit([{ ...tx, in_msg: { ...tx.in_msg, value: "199999999" } }], expected).reason, "AMOUNT_MISMATCH");
  assert.equal(assessRecipientCredit([{ ...tx, in_msg: { ...tx.in_msg, source: recipient } }], expected).reason, "SOURCE_MISMATCH");
});
test("credit lookup never requests wallet secrets or broadcasts", async () => {
  const result = await checkRecipientCredit(expected, async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.hostname, "testnet.toncenter.com");
    assert.equal(parsed.pathname, "/api/v3/transactions");
    assert.equal(parsed.searchParams.get("account"), recipient);
    assert.equal(options.method, "GET");
    return { ok: true, json: async () => ({ transactions: [tx] }) };
  });
  assert.equal(result.verified, true);
  assert.equal(result.readOnly, true);
});
