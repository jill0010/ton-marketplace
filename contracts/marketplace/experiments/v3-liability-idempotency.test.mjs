import test from "node:test";
import assert from "node:assert/strict";
import { applyV3LiabilityEvent } from "./v3-liability-idempotency.mjs";

const initial = () => ({
  orderId: "order-2", version: 0, status: "RESERVED",
  fundedNano: "200000000", remainingNano: "200000000",
  pendingNano: "0", creditedNano: "0", feesNano: "0",
  externalCompensationNano: "0", processedEventIds: [],
});
const event = (action, eventId, expectedVersion, amountNano = "200000000") =>
  ({ orderId: "order-2", action, eventId, expectedVersion, amountNano });

test("one dispatch reserves liability and cannot be replayed or dispatched twice", () => {
  const first = applyV3LiabilityEvent(initial(), event("DISPATCH", "send-1", 0));
  assert.equal(first.accepted, true);
  assert.equal(first.mayTransfer, false);
  assert.equal(first.next.remainingNano, "0");
  assert.equal(first.next.pendingNano, "200000000");
  const replay = applyV3LiabilityEvent(first.next, event("DISPATCH", "send-1", 1));
  assert.equal(replay.reason, "REPLAYED_EVENT");
  assert.equal(replay.accepted, false);
  const duplicate = applyV3LiabilityEvent(first.next, event("DISPATCH", "send-2", 1));
  assert.equal(duplicate.reason, "DISPATCH_NOT_ALLOWED");
  assert.equal(duplicate.mayTransfer, false);
});
test("unverified return quarantines liability and never permits retry", () => {
  const first = applyV3LiabilityEvent(initial(), event("DISPATCH", "send-1", 0));
  const returned = applyV3LiabilityEvent(first.next,
    event("OBSERVE_RETURN", "bounce-1", 1, "198000000"));
  assert.equal(returned.accepted, true);
  assert.equal(returned.next.status, "RETURN_QUARANTINED");
  assert.equal(returned.next.pendingNano, "200000000");
  assert.equal(returned.mayRetry, false);
  assert.equal(applyV3LiabilityEvent(returned.next,
    event("DISPATCH", "send-2", 2)).accepted, false);
});
test("external compensation blocks all further dispatches", () => {
  const paid = applyV3LiabilityEvent(initial(),
    event("EXTERNAL_COMPENSATION", "compensate-1", 0));
  assert.equal(paid.next.status, "COMPENSATED");
  assert.equal(applyV3LiabilityEvent(paid.next,
    event("DISPATCH", "send-1", 1)).accepted, false);
});
test("stale writes and unbalanced starting funds fail closed", () => {
  assert.throws(() => applyV3LiabilityEvent(initial(),
    event("DISPATCH", "send-1", 1)), TypeError);
  const broken = initial();
  broken.remainingNano = "200000001";
  assert.throws(() => applyV3LiabilityEvent(broken,
    event("DISPATCH", "send-1", 0)), TypeError);
  const result = applyV3LiabilityEvent(initial(),
    event("OBSERVE_CREDIT", "claim-1", 0));
  assert.equal(result.reason, "UNVERIFIED_BUYER_CREDIT");
  assert.equal(result.mayTransfer, false);
});
