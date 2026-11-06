import test from "node:test";
import assert from "node:assert/strict";
import { classifyReserveRefund, mayAutoRetryReserveRefund } from "./v3-refund-reconciliation.mjs";

const op = { vault: "vault", buyer: "buyer", amount: 194000000n, queryId: 1, txHash: "tx1", messageHash: "msg1" };
const outgoing = { finalized: true, success: true, txHash: "tx1", messageHash: "msg1", source: "vault", destination: "buyer", amount: 194000000n, queryId: 1 };
const recipient = { finalized: true, success: true, incomingMessageHash: "msg1", address: "buyer", amount: 194000000n };
const returned = { finalized: true, success: true, originalMessageHash: "msg1", outgoingTxHash: "tx1", destination: "vault", source: "buyer", amount: 193000000n, queryId: 1, principalVerified: true };
const check = (overrides = {}) => classifyReserveRefund({ operation: op, outgoing, ...overrides });

test("verified matching recipient receipt is credited", () => {
  assert.equal(check({ recipient }), "CREDITED");
});
test("verified return is only a candidate, never retry authorization", () => {
  assert.equal(check({ returned }), "RETURNED_CANDIDATE");
  assert.equal(mayAutoRetryReserveRefund(), false);
});
test("missing, stale, unfinalized or contradictory evidence freezes", () => {
  assert.equal(check(), "UNKNOWN");
  assert.equal(check({ recipient, returned }), "UNKNOWN");
  assert.equal(check({ recipient: { ...recipient, finalized: false } }), "UNKNOWN");
  assert.equal(check({ recipient: { ...recipient, incomingMessageHash: "wrong" } }), "UNKNOWN");
  assert.equal(check({ returned: { ...returned, principalVerified: false } }), "UNKNOWN");
  assert.equal(check({ returned: { ...returned, queryId: 2 } }), "UNKNOWN");
  assert.equal(check({ outgoing: { ...outgoing, txHash: "wrong" }, recipient }), "UNKNOWN");
  assert.equal(check({ outgoing: { ...outgoing, amount: 1n }, recipient }), "UNKNOWN");
});
