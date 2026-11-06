import test from "node:test";
import assert from "node:assert/strict";
import { createLiability, approveReconciliation, beginDispatch, observeResult } from "./reserve-refund-model.mjs";
const H = "a".repeat(64), E = "b".repeat(64), M = "c".repeat(64), N = "d".repeat(64);
const identity = { network: "-3", orderId: "1", buyer: "buyer", marketplace: "market", paymentHash: H };
const reconciliation = { ...identity, terminalState: "delivered", fundingModel: "isolated-order-ledger-v3",
  evidenceKind: "reviewed-isolated-ledger", fundedNano: 200000000n, attributedFeesNano: 6000000n,
  residualNano: 194000000n, openLiabilitiesNano: 0n, escrowExcessPending: false, evidenceHash: E };
const approve = (overrides = {}) => approveReconciliation(createLiability(identity), { ...reconciliation, ...overrides });
const dispatch = (state = approve(), overrides = {}) => beginDispatch(state, {
  orderId: "1", buyer: "buyer", evidenceHash: E, amountNano: 194000000n,
  attempt: state.attempt + 1, messageHash: state.attempt === 0 ? M : N, ...overrides });
const receipt = (overrides = {}) => ({ orderId: "1", buyer: "buyer", amountNano: 194000000n,
  messageHash: M, attempt: 1, kind: "credited", receiverSuccess: true, creditNano: 194000000n, ...overrides });
test("prototype rejects Mainnet", () => assert.throws(() => createLiability({ ...identity, network: "-239" })));
test("conserves isolated reserve and binds reviewed evidence", () => {
  const state = approve(); assert.equal(state.refundNano, 194000000n); assert.equal(state.evidenceHash, E);
  assert.equal(createLiability(identity).phase, "unreconciled");
});
test("externally compensated order cannot trigger a second reserve refund", () => {
  assert.throws(() => approve({ terminalState: "compensated" }));
});
test("rejects pooled trace fees and unfinished excesses", () => {
  for (const change of [{ fundingModel: "pooled-v2" }, { evidenceKind: "trace-total-fees" },
    { escrowExcessPending: true }, { openLiabilitiesNano: 1n }, { terminalState: "pending" }]) {
    assert.throws(() => approve(change));
  }
});
test("rejects identity substitutions", () => {
  for (const field of ["network", "orderId", "buyer", "marketplace", "paymentHash"]) {
    assert.throws(() => approve({ [field]: "different" }));
  }
});
test("rejects invalid and nonconserving amounts", () => {
  for (const change of [{ fundedNano: 0n }, { residualNano: -1n }, { attributedFeesNano: 6000001n },
    { residualNano: 194000000 }, { attributedFeesNano: 200000001n, residualNano: 0n }]) {
    assert.throws(() => approve(change));
  }
});
test("zero balance closes without a transfer", () => {
  const zero = approve({ attributedFeesNano: 200000000n, residualNano: 0n });
  assert.equal(zero.phase, "closed-zero"); assert.throws(() => dispatch(zero));
});
test("dispatch cannot alter buyer, amount, evidence or attempt", () => {
  for (const change of [{ buyer: "attacker" }, { amountNano: 1n }, { evidenceHash: H }, { attempt: 0 }]) {
    assert.throws(() => dispatch(approve(), change));
  }
});
test("in-flight and paid refunds cannot be dispatched twice", () => {
  const flying = dispatch(); assert.throws(() => dispatch(flying));
  const paid = observeResult(flying, receipt()); assert.equal(paid.phase, "paid");
  assert.throws(() => dispatch(paid)); assert.throws(() => observeResult(paid, receipt()));
});
test("rejects unrelated or unsuccessful receipts", () => {
  for (const change of [{ messageHash: N }, { attempt: 2 }, { creditNano: 1n }, { receiverSuccess: false },
    { buyer: "attacker" }, { orderId: "2" }]) assert.throws(() => observeResult(dispatch(), receipt(change)));
});
test("bounce requires exact principal return and retry preserves amount", () => {
  const bad = receipt({ kind: "bounced", returnVerified: false, returnedPrincipalNano: 194000000n });
  assert.throws(() => observeResult(dispatch(), bad));
  const bounced = observeResult(dispatch(), { ...bad, returnVerified: true });
  const retry = dispatch(bounced); assert.equal(retry.attempt, 2); assert.equal(retry.refundNano, bounced.refundNano);
  assert.throws(() => observeResult(retry, receipt()));
  assert.equal(observeResult(retry, receipt({ messageHash: N, attempt: 2 })).phase, "paid");
});

test("rejects malformed liability identities and payment evidence", () => {
  for (const change of [
    { orderId: "" }, { buyer: "" }, { marketplace: "" },
    { paymentHash: "not-a-hash" }, { paymentHash: "A".repeat(64) },
  ]) assert.throws(() => createLiability({ ...identity, ...change }));
});
test("review cannot be repeated or replaced after approval", () => {
  const approved = approve();
  assert.throws(() => approveReconciliation(approved, reconciliation));
  assert.throws(() => approveReconciliation(approved, { ...reconciliation, evidenceHash: H }));
});
test("dispatch rejects malformed and previously used message hashes", () => {
  assert.throws(() => dispatch(approve(), { messageHash: "invalid" }));
  const bounced = observeResult(dispatch(), receipt({
    kind: "bounced", returnVerified: true, returnedPrincipalNano: 194000000n,
  }));
  assert.throws(() => dispatch(bounced, { messageHash: M }));
});
test("bounce without exact returned principal blocks retry", () => {
  for (const change of [
    { returnedPrincipalNano: 193999999n },
    { returnedPrincipalNano: 194000001n },
    { returnVerified: false },
  ]) {
    assert.throws(() => observeResult(dispatch(), receipt({
      kind: "bounced", returnVerified: true, returnedPrincipalNano: 194000000n, ...change,
    })));
  }
});
test("nonterminal or unsupported receipts never finalize liability", () => {
  for (const change of [
    { kind: "pending" }, { kind: "failed" },
    { kind: "credited", creditNano: 0n },
  ]) assert.throws(() => observeResult(dispatch(), receipt(change)));
});
