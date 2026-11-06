import test from "node:test";
import assert from "node:assert/strict";
import { prepareRefundReconciliation as prepare } from "./prepare-refund-reconciliation.mjs";
const record = {
  orderId: "order-2", operationId: "refund-1",
  transactionId: "a".repeat(64), accountAddress: "0:" + "b".repeat(64),
  counterpartyAddress: "0:" + "c".repeat(64),
  amountNano: "200000000", logicalTime: "107886213000003",
};
test("attacker-supplied verified receipt never authorizes payout", () => {
  const result = prepare({ orderId: "order-2", records: [{
    ...record, verified: true, recipientReceiptVerified: true,
    returnedPrincipalVerified: true, evidence: {
      outboundVerified: true, recipientReceiptVerified: true,
      bounceVerified: true, returnedPrincipalVerified: true,
      sameOperationVerified: true, conflictingEvidence: false,
    },
  }] });
  assert.equal(result.state, "UNKNOWN");
  assert.equal(result.retryAuthorized, false);
  assert.deepEqual(result.diagnostics, ["UNVERIFIED_CHAIN_RECORD"]);
});
test("duplicate transaction and mismatched order are rejected", () => {
  const duplicate = prepare({ orderId: "order-2", records: [record, { ...record, operationId: "refund-2" }] });
  assert.equal(duplicate.state, "CONFLICT");
  assert.ok(duplicate.diagnostics.includes("DUPLICATE_TRANSACTION"));
  const mismatch = prepare({ orderId: "order-3", records: [record] });
  assert.equal(mismatch.state, "CONFLICT");
  assert.ok(mismatch.diagnostics.includes("ORDER_MISMATCH"));
});
test("invalid chain record cannot promote evidence", () => {
  const result = prepare({ orderId: "order-2", records: [{ ...record, transactionId: "fake" }] });
  assert.equal(result.state, "UNKNOWN");
  assert.equal(result.retryAuthorized, false);
  assert.ok(result.diagnostics.includes("INVALID_CHAIN_IDENTIFIERS"));
});
