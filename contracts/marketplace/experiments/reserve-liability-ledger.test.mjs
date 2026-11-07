import test from "node:test";
import assert from "node:assert/strict";
import { createReserveLedger, topUpReserve, dispatchReserveRefund, reconcileRefundResult } from "./reserve-liability-ledger.mjs";
const H = (n) => n.toString(16).padStart(64, "0");
const start = (orderId = "order-1") => createReserveLedger({ orderId, buyer: "buyer-1", principalNano: 200_000_000n });
const dispatch = (s) => dispatchReserveRefund(s, { orderId: s.orderId, buyer: "buyer-1", amountNano: s.outstandingNano, operationId: s.nextOperationId });
test("one order can dispatch exactly its fully backed reserve liability", () => {
  const s = dispatch(start());
  assert.equal(s.inFlightNano, 200_000_000n);
  assert.equal(s.availableNano, 0n);
  assert.equal(s.outstandingNano, 200_000_000n);
  assert.throws(() => dispatchReserveRefund(s, { orderId: s.orderId, buyer: "buyer-1", amountNano: 200_000_000n, operationId: 2n }), /Insufficient/);
});
test("fee-reduced bounce records actual return and preserves the full buyer liability", () => {
  const sent = dispatch(start());
  const bounced = reconcileRefundResult(sent, { orderId: sent.orderId, buyer: "buyer-1", operationId: 1n,
    result: "bounced", returnedNano: 199_000_000n, evidenceHash: H(1) });
  assert.equal(bounced.availableNano, 199_000_000n);
  assert.equal(bounced.outstandingNano, 200_000_000n);
  assert.equal(bounced.shortfallNano, 1_000_000n);
  assert.equal(bounced.feesNano, 1_000_000n);
  assert.equal(bounced.paidNano + bounced.inFlightNano + bounced.availableNano + bounced.feesNano, 200_000_000n);
  assert.throws(() => dispatch(bounced), /Insufficient/);
});
test("order-scoped top-up covers only the residual shortfall before exact retry", () => {
  const bounced = reconcileRefundResult(dispatch(start()), { orderId: "order-1", buyer: "buyer-1",
    operationId: 1n, result: "bounced", returnedNano: 199_000_000n, evidenceHash: H(2) });
  const topped = topUpReserve(bounced, { orderId: "order-1", buyer: "buyer-1",
    amountNano: 1_000_000n, fundingMessageHash: "funding-1" });
  const retry = dispatchReserveRefund(topped, { orderId: "order-1", buyer: "buyer-1",
    amountNano: 200_000_000n, operationId: 2n });
  assert.equal(retry.availableNano, 0n);
  assert.equal(retry.inFlightNano, 200_000_000n);
  assert.equal(retry.operations.filter((op) => op.kind === "refund").length, 2);
});
test("top-up cannot be replayed, oversized, premature, or redirected", () => {
  const bounced = reconcileRefundResult(dispatch(start()), { orderId: "order-1", buyer: "buyer-1",
    operationId: 1n, result: "bounced", returnedNano: 199_000_000n, evidenceHash: H(10) });
  const topUp = { orderId: "order-1", buyer: "buyer-1", amountNano: 1_000_000n, fundingMessageHash: "fund-1" };
  const topped = topUpReserve(bounced, topUp);
  assert.throws(() => topUpReserve(topped, topUp), /not allowed without an outstanding shortfall/);
  assert.throws(() => topUpReserve(bounced, { ...topUp, amountNano: 1_000_001n, fundingMessageHash: "fund-2" }), /exact outstanding shortfall/);
  assert.throws(() => topUpReserve(start(), topUp), /not allowed without an outstanding shortfall/);
  assert.throws(() => topUpReserve(bounced, { ...topUp, orderId: "order-2", fundingMessageHash: "fund-3" }), /identity mismatch/);
  assert.throws(() => topUpReserve(bounced, { ...topUp, buyer: "attacker", fundingMessageHash: "fund-4" }), /identity mismatch/);
});
test("stale, duplicate, forged and over-returned bounce results fail closed", () => {
  const s = dispatch(start());
  assert.throws(() => reconcileRefundResult(s, { orderId: "order-1", buyer: "buyer-1", operationId: 2n,
    result: "bounced", returnedNano: 200_000_000n, evidenceHash: H(3) }), /Unknown/);
  assert.throws(() => reconcileRefundResult(s, { orderId: "order-1", buyer: "buyer-1", operationId: 1n,
    result: "bounced", returnedNano: 200_000_001n, evidenceHash: H(4) }), /exceeds/);
  const bounced = reconcileRefundResult(s, { orderId: "order-1", buyer: "buyer-1", operationId: 1n,
    result: "bounced", returnedNano: 200_000_000n, evidenceHash: H(5) });
  assert.throws(() => reconcileRefundResult(bounced, { orderId: "order-1", buyer: "buyer-1", operationId: 1n,
    result: "bounced", returnedNano: 200_000_000n, evidenceHash: H(6) }), /already reconciled/);
});
test("credit must equal the exact dispatched amount and cannot also return funds", () => {
  const s = dispatch(start());
  assert.throws(() => reconcileRefundResult(s, { orderId: "order-1", buyer: "buyer-1", operationId: 1n,
    result: "credited", creditedNano: 199_999_999n, evidenceHash: H(7) }), /equal/);
  const paid = reconcileRefundResult(s, { orderId: "order-1", buyer: "buyer-1", operationId: 1n,
    result: "credited", creditedNano: 200_000_000n, evidenceHash: H(8) });
  assert.equal(paid.paidNano, 200_000_000n);
  assert.equal(paid.outstandingNano, 0n);
  assert.throws(() => dispatch(paid), /Refund must settle/);
});
test("two order ledgers cannot spend or observe each other's reserve", () => {
  const a = start("order-A"), b = start("order-B");
  const aSent = dispatch(a);
  const aBounced = reconcileRefundResult(aSent, { orderId: "order-A", buyer: "buyer-1", operationId: 1n,
    result: "bounced", returnedNano: 150_000_000n, evidenceHash: H(9) });
  assert.equal(b.availableNano, 200_000_000n);
  assert.equal(b.outstandingNano, 200_000_000n);
  assert.equal(aBounced.availableNano, 150_000_000n);
  assert.throws(() => dispatchReserveRefund(aBounced, { orderId: "order-B", buyer: "buyer-1",
    amountNano: 200_000_000n, operationId: 1n }), /identity mismatch/);
});

test("ledger rejects corrupted principal conservation and malformed top-up history", () => {
  const s = start();
  assert.throws(() => dispatchReserveRefund(
    { ...s, availableNano: s.availableNano - 1n },
    { orderId: "order-1", buyer: "buyer-1", amountNano: 200_000_000n, operationId: 1n },
  ), /principal conservation/);
  assert.throws(() => dispatchReserveRefund(
    { ...s, operations: [{ kind: "topup", amountNano: -1n }] },
    { orderId: "order-1", buyer: "buyer-1", amountNano: 200_000_000n, operationId: 1n },
  ), /Invalid nano amount/);
});

test("partial return cannot be retried until exact order-local principal is restored", () => {
  const bounced = reconcileRefundResult(dispatch(start()), { orderId: "order-1", buyer: "buyer-1",
    operationId: 1n, result: "bounced", returnedNano: 150_000_000n, evidenceHash: H(11) });
  assert.equal(bounced.shortfallNano, 50_000_000n);
  assert.throws(() => dispatchReserveRefund(bounced, { orderId: "order-1", buyer: "buyer-1",
    amountNano: 200_000_000n, operationId: 2n }), /Insufficient/);
  const topped = topUpReserve(bounced, { orderId: "order-1", buyer: "buyer-1",
    amountNano: 50_000_000n, fundingMessageHash: "funding-partial-1" });
  assert.equal(topped.availableNano + topped.inFlightNano + topped.paidNano + topped.feesNano, 250_000_000n);
  const retry = dispatchReserveRefund(topped, { orderId: "order-1", buyer: "buyer-1",
    amountNano: 200_000_000n, operationId: 2n });
  assert.equal(retry.inFlightNano, 200_000_000n);
  assert.equal(retry.availableNano, 0n);
});

test("zero, negative, non-integer and missing evidence inputs are rejected", () => {
  assert.throws(() => createReserveLedger({ orderId: "x", buyer: "b", principalNano: 0n }));
  assert.throws(() => createReserveLedger({ orderId: "x", buyer: "b", principalNano: -1n }));
  assert.throws(() => createReserveLedger({ orderId: "x", buyer: "b", principalNano: 1 }));
  assert.throws(() => topUpReserve(start(), { orderId: "order-1", buyer: "buyer-1", amountNano: 1n, fundingMessageHash: "" }));
});
