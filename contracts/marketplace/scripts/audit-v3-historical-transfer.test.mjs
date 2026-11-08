import test from "node:test";
import assert from "node:assert/strict";
import { auditHistoricalTransfer } from "./audit-v3-historical-transfer.mjs";
const source = "0:" + "1".repeat(64), recipient = "0:" + "2".repeat(64);
const hash = "a".repeat(64);
const expected = { source, recipient, amountNano: "200000000" };
const outbound = { account: source, hash: "b".repeat(64), lt: "10", aborted: false,
  action_phase: { success: true }, out_msgs: [{ destination: recipient, value: "200000000", hash }] };
const inbound = { account: recipient, hash: "c".repeat(64), lt: "11", aborted: false,
  compute_phase: { success: true }, in_msg: { source, value: "200000000", hash } };
function fetcher(sourceTransactions, recipientTransactions = [inbound]) {
  return async (url, options) => {
    assert.equal(options.method, "GET");
    assert.equal(new URL(url).hostname, "testnet.toncenter.com");
    const account = new URL(url).searchParams.get("account");
    return { ok: true, json: async () => ({ transactions: account === source ? sourceTransactions : recipientTransactions }) };
  };
}
test("discovers a unique historical transfer and independently checks recipient", async () => {
  const result = await auditHistoricalTransfer(expected, fetcher([outbound]));
  assert.equal(result.verified, true);
  assert.equal(result.evidence.assessment.recipientTransactionHash, "c".repeat(64));
});
test("does not infer receipt from source dispatch alone", async () => {
  const result = await auditHistoricalTransfer(expected, fetcher([outbound], []));
  assert.equal(result.verified, false);
  assert.equal(result.reason, "INCOMPLETE_TRANSFER_EVIDENCE");
});
test("rejects ambiguous historical transfers even when both were dispatched", async () => {
  const other = { ...outbound, hash: "d".repeat(64), lt: "12",
    out_msgs: [{ ...outbound.out_msgs[0], hash: "e".repeat(64) }] };
  const result = await auditHistoricalTransfer(expected, fetcher([outbound, other]));
  assert.equal(result.verified, false);
  assert.equal(result.reason, "AMBIGUOUS_TRANSFER_CANDIDATES");
});
test("rejects unsuccessful source transactions", async () => {
  const result = await auditHistoricalTransfer(expected, fetcher([{ ...outbound, aborted: true }]));
  assert.equal(result.verified, false);
  assert.equal(result.reason, "NO_SUCCESSFUL_TRANSFER_CANDIDATE");
});
