// Design prototype only. Not a signer, persistence layer, chain proof verifier,
// transaction sender, or implementation of the deployed Marketplace V2.
// Calls represent events authenticated/verified elsewhere; never expose these
// functions as an authorization endpoint or infer evidence from pooled fees.
function check(ok, message) {
  if (!ok) throw new Error(message);
}
function amount(value) {
  check(typeof value === "bigint" && value >= 0n, "Invalid nano amount");
  return value;
}
function hash(value) {
  check(typeof value === "string" && /^[a-f0-9]{64}$/.test(value), "Invalid evidence hash");
  return value;
}
export function createLiability(identity) {
  check(identity.network === "-3", "Testnet prototype only");
  for (const key of ["orderId", "buyer", "marketplace"]) {
    check(typeof identity[key] === "string" && identity[key].length > 0, "Missing identity");
  }
  hash(identity.paymentHash);
  return Object.freeze({
    ...identity, reserveNano: 200000000n, phase: "unreconciled",
    refundNano: null, evidenceHash: null, attempt: 0, messageHash: null, messageHashes: Object.freeze([]),
  });
}
export function approveReconciliation(state, reconciliation) {
  check(state.phase === "unreconciled", "Liability already reviewed");
  for (const key of ["network", "orderId", "buyer", "marketplace", "paymentHash"]) {
    check(reconciliation[key] === state[key], "Reconciliation identity mismatch");
  }
  check(["delivered", "compensated"].includes(reconciliation.terminalState), "Order not terminal");
  // A required input, NOT evidence this model can independently establish.
  check(reconciliation.fundingModel === "isolated-order-ledger-v3", "Pooled funding cannot authorize a refund");
  check(reconciliation.evidenceKind === "reviewed-isolated-ledger", "Trace fees alone are insufficient");
  const funded = amount(reconciliation.fundedNano);
  const fees = amount(reconciliation.attributedFeesNano);
  const residual = amount(reconciliation.residualNano);
  check(funded === state.reserveNano, "Reserve funding mismatch");
  check(fees + residual === funded, "Reserve conservation mismatch");
  check(reconciliation.openLiabilitiesNano === 0n, "Order still has unsettled obligations");
  check(reconciliation.escrowExcessPending === false, "Escrow funds not reconciled");
  const evidenceHash = hash(reconciliation.evidenceHash);
  return Object.freeze({
    ...state, phase: residual === 0n ? "closed-zero" : "approved",
    refundNano: residual, evidenceHash,
  });
}
export function beginDispatch(state, identity) {
  check(["approved", "bounced"].includes(state.phase), "Refund cannot be dispatched");
  check(identity.buyer === state.buyer && identity.orderId === state.orderId, "Wrong beneficiary or order");
  check(identity.evidenceHash === state.evidenceHash, "Changed evidence");
  check(identity.amountNano === state.refundNano, "Changed refund amount");
  check(identity.attempt === state.attempt + 1, "Stale dispatch attempt");
  const messageHash = hash(identity.messageHash);
  check(!state.messageHashes.includes(messageHash), "Reused message hash");
  return Object.freeze({ ...state, phase: "in-flight", attempt: identity.attempt, messageHash,
    messageHashes: Object.freeze([...state.messageHashes, messageHash]) });
}
export function observeResult(state, observation) {
  check(state.phase === "in-flight", "No pending refund");
  check(observation.messageHash === state.messageHash && observation.attempt === state.attempt, "Stale or unrelated receipt");
  check(observation.orderId === state.orderId && observation.buyer === state.buyer, "Wrong receipt identity");
  check(observation.amountNano === state.refundNano, "Wrong receipt amount");
  check(["credited", "bounced"].includes(observation.kind), "Receipt is not terminal");
  if (observation.kind === "credited") {
    check(observation.receiverSuccess === true, "Receiver did not complete");
    check(observation.creditNano === state.refundNano, "Receiver credit mismatch");
  } else {
    // A failed transaction by itself is not proof funds returned.
    check(observation.returnVerified === true && observation.returnedPrincipalNano === state.refundNano,
      "Returned principal not proven; retry blocked");
  }
  return Object.freeze({ ...state, phase: observation.kind === "credited" ? "paid" : "bounced" });
}
