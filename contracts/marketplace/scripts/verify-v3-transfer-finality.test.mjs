import test from "node:test";
import assert from "node:assert/strict";
import { reconcileTransferEvidence, verifyTransferFinality } from "./verify-v3-transfer-finality.mjs";
const source = "0:" + "1".repeat(64), recipient = "0:" + "2".repeat(64);
const messageHash = "a".repeat(64), amountNano = "200000000";
const outbound = { verified: true, network: "testnet", source, recipient, amountNano,
  outboundMessageHash: messageHash, sourceTransactionHash: "b".repeat(64), sourceTransactionLt: "10" };
const inbound = { verified: true, network: "testnet", source, recipient, amountNano,
  inboundMessageHash: messageHash, recipientTransactionHash: "c".repeat(64), recipientTransactionLt: "11" };
test("finality requires matching outbound and inbound evidence", () => {
  assert.equal(reconcileTransferEvidence(outbound, inbound).verified, true);
  assert.equal(reconcileTransferEvidence(outbound, { ...inbound, verified: false }).verified, false);
  assert.equal(reconcileTransferEvidence({ ...outbound, amountNano: "1" }, inbound).reason, "TRANSFER_EVIDENCE_MISMATCH");
  assert.equal(reconcileTransferEvidence(outbound, { ...inbound, inboundMessageHash: "d".repeat(64) }).verified, false);
});
test("combined verification queries only public testnet transactions", async () => {
  const result = await verifyTransferFinality({ source, recipient, messageHash, amountNano }, async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.hostname, "testnet.toncenter.com");
    assert.equal(parsed.pathname, "/api/v3/transactions");
    assert.equal(options.method, "GET");
    const account = parsed.searchParams.get("account");
    if (account === source) return { ok: true, json: async () => ({ transactions: [{
      account: source, hash: "b".repeat(64), lt: "10", aborted: false, action_phase: { success: true },
      out_msgs: [{ hash: messageHash, destination: recipient, value: amountNano }],
    }] }) };
    assert.equal(account, recipient);
    return { ok: true, json: async () => ({ transactions: [{
      account: recipient, hash: "c".repeat(64), lt: "11", aborted: false, compute_phase: { success: true },
      in_msg: { hash: messageHash, source, value: amountNano },
    }] }) };
  });
  assert.equal(result.readOnly, true);
  assert.equal(result.assessment.verified, true);
});
