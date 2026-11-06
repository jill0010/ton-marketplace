import test from "node:test";
import assert from "node:assert/strict";
import { beginCell } from "@ton/core";
import { auditV3RefundSettlement } from "./v3-refund-settlement-audit.mjs";

const vault = "0:" + "a".repeat(64);
const buyer = "0:" + "b".repeat(64);
const body = beginCell().storeUint(0x72730105, 32)
  .storeUint(1, 64).storeUint(2, 64).storeCoins(194000000n)
  .endCell().toBoc().toString("base64");
const sent = {
  source: vault, destination: buyer, value: "194000000",
  hash: "same-message-hash",
  msg_data: { "@type": "msg.dataRaw", body },
};
const wrap = (address, transactions) => ({
  source: "toncenter-v2-unverified", trusted: false, address, transactions,
});
const options = { vault, buyer, orderId: "1", queryId: "2" };
const outgoing = { transaction_id: { lt: "1", hash: "out-tx" }, out_msgs: [sent] };
const receipt = { transaction_id: { lt: "2", hash: "buyer-tx" }, in_msg: sent };
const richBounceBody = beginCell().storeUint(0xfffffffe, 32)
  .storeUint(0x72730105, 32).storeUint(1, 64).storeUint(2, 64)
  .storeCoins(194000000n).endCell().toBoc().toString("base64");
const bounce = {
  transaction_id: { lt: "3", hash: "bounce-tx" },
  in_msg: { source: buyer, destination: vault, value: "193000000",
    bounced: true, hash: "bounce-msg",
    msg_data: { "@type": "msg.dataRaw", body: richBounceBody } },
};
const audit = (vaultTxs, buyerTxs, compensated = false) =>
  auditV3RefundSettlement({
    ...options, externallyCompensated: compensated,
    vaultResponse: wrap(vault, vaultTxs),
    buyerResponse: wrap(buyer, buyerTxs),
  });

test("never authorizes payout for buyer receipt candidates", () => {
  const result = audit([outgoing], [receipt]);
  assert.equal(result.outboundToBuyerCandidateCount, 1);
  assert.equal(result.verifiedBuyerCreditNano, "0");
  assert.equal(result.mayConfirmReceipt, false);
  assert.equal(result.mayReleaseFunds, false);
});
test("flags conflicting receipt and bounce evidence without choosing either", () => {
  const result = audit([outgoing, bounce], [receipt]);
  assert.equal(result.conflictingEvidence, true);
  assert.ok(result.reasons.includes("BOUNCE_AND_RECEIPT_CONFLICT"));
  assert.equal(result.verifiedReturnedToVaultNano, "0");
  assert.equal(result.mayRetry, false);
});
test("external compensation is an absolute no-repayment barrier", () => {
  const result = audit([outgoing, bounce], [], true);
  assert.ok(result.reasons.includes("EXTERNALLY_COMPENSATED_NO_REPAYMENT"));
  assert.equal(result.mayConfirmBounce, false);
  assert.equal(result.mayRetry, false);
  assert.equal(result.mayReleaseFunds, false);
});
test("empty investigation fails closed", () => {
  const result = audit([], []);
  assert.ok(result.reasons.includes("NO_CORRELATED_CANDIDATES"));
  assert.equal(result.accountingStatus, "NO_VERIFIED_SETTLEMENT");
  assert.equal(result.proofStatus, "UNVERIFIED");
});

test("ambiguous buyer receipts are surfaced but cannot settle", () => {
  const duplicate = { ...receipt, transaction_id: { lt: "4", hash: "other-buyer-tx" } };
  const result = audit([outgoing], [receipt, duplicate]);
  assert.equal(result.ambiguousEvidence, true);
  assert.ok(result.reasons.includes("AMBIGUOUS_BUYER_RECEIPT"));
  assert.equal(result.outboundToBuyerCandidateCount, 0);
  assert.equal(result.verifiedBuyerCreditNano, "0");
  assert.equal(result.mayConfirmReceipt, false);
});
