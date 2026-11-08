import test from "node:test";
import assert from "node:assert/strict";
import { discoverOutboundCandidates, discoverTestnetTransfers } from "./discover-v3-testnet-transfers.mjs";
const source = "0:" + "1".repeat(64), recipient = "0:" + "2".repeat(64);
const expected = { source, recipient, amountNano: "200000000" };
const tx = { account: source, hash: "b".repeat(64), lt: "10", aborted: false,
  action_phase: { success: true },
  out_msgs: [{ destination: recipient, value: "200000000", hash: "a".repeat(64) },
    { destination: recipient, value: "1", hash: "c".repeat(64) }] };
test("discovery yields only exact outbound candidates and never claims finality", () => {
  const candidates = discoverOutboundCandidates([tx], expected);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].messageHash, "a".repeat(64));
  assert.equal(candidates[0].recipientCreditVerified, false);
  assert.deepEqual(discoverOutboundCandidates([], expected), []);
});
test("discovery uses only testnet GET and leaves history completeness unknown", async () => {
  const result = await discoverTestnetTransfers(expected, async (url, options) => {
    assert.equal(new URL(url).hostname, "testnet.toncenter.com");
    assert.equal(options.method, "GET");
    return { ok: true, json: async () => ({ transactions: [tx] }) };
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.finalityVerified, false);
  assert.equal(result.historyComplete, false);
});
