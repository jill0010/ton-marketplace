// Pure, offline V3 per-order liability state machine.
// No chain verification, signing, wallet operation or permission to transfer.
// Persist the returned next state atomically with compare-and-swap version.
// A successful calculation alone MUST NOT be used as payout authorization.
const amount = (x) => typeof x === "string" && /^(0|[1-9][0-9]*)$/.test(x);
const id = (x) => typeof x === "string" && /^[A-Za-z0-9:_-]{1,128}$/.test(x);
const states = new Set(["RESERVED", "DISPATCH_PENDING", "RETURN_QUARANTINED", "CREDITED", "COMPENSATED"]);
const actions = new Set(["DISPATCH", "OBSERVE_RETURN", "OBSERVE_CREDIT", "EXTERNAL_COMPENSATION"]);
const n = (x) => BigInt(x);

export function applyV3LiabilityEvent(state, event) {
  if (!state || !event || !id(state.orderId) || !id(event.orderId) ||
      state.orderId !== event.orderId || !Number.isSafeInteger(state.version) ||
      state.version < 0 || event.expectedVersion !== state.version ||
      !states.has(state.status) || !actions.has(event.action) ||
      !amount(state.fundedNano) || !amount(state.remainingNano) ||
      !amount(state.pendingNano) || !amount(state.creditedNano) ||
      !amount(state.feesNano) || !amount(state.externalCompensationNano) ||
      !Array.isArray(state.processedEventIds) ||
      state.processedEventIds.length > 128 ||
      !state.processedEventIds.every(id) ||
      new Set(state.processedEventIds).size !== state.processedEventIds.length ||
      !id(event.eventId) || !amount(event.amountNano)) {
    throw new TypeError("Invalid liability state or optimistic concurrency version");
  }
  const funded = n(state.fundedNano);
  const remaining = n(state.remainingNano);
  const pending = n(state.pendingNano);
  const credited = n(state.creditedNano);
  const fees = n(state.feesNano);
  const external = n(state.externalCompensationNano);
  if (funded !== remaining + pending + credited + fees ||
      credited > funded || external > 0n && state.status !== "COMPENSATED") {
    throw new TypeError("Invalid starting reserve conservation");
  }
  if (state.processedEventIds.includes(event.eventId)) {
    return { accepted: false, reason: "REPLAYED_EVENT", next: state, mayTransfer: false };
  }
  const value = n(event.amountNano);
  let next;
  if (event.action === "DISPATCH") {
    if (state.status !== "RESERVED" || pending !== 0n ||
        credited !== 0n || external !== 0n || value === 0n || value > remaining) {
      return { accepted: false, reason: "DISPATCH_NOT_ALLOWED", next: state, mayTransfer: false };
    }
    next = { ...state, status: "DISPATCH_PENDING",
      remainingNano: (remaining - value).toString(),
      pendingNano: value.toString() };
  } else if (event.action === "OBSERVE_RETURN") {
    // Observation is not an independently verified return: keep the
    // outstanding liability pending and quarantine the order.
    if (state.status !== "DISPATCH_PENDING" || value === 0n || value > pending) {
      return { accepted: false, reason: "RETURN_NOT_MATCHED", next: state, mayTransfer: false };
    }
    next = { ...state, status: "RETURN_QUARANTINED" };
  } else if (event.action === "OBSERVE_CREDIT") {
    // A reported credit cannot close the liability without chain proof.
    return { accepted: false, reason: "UNVERIFIED_BUYER_CREDIT", next: state, mayTransfer: false };
  } else {
    if (value === 0n || external > 0n || credited > 0n) {
      return { accepted: false, reason: "COMPENSATION_CONFLICT", next: state, mayTransfer: false };
    }
    next = { ...state, status: "COMPENSATED",
      externalCompensationNano: value.toString() };
  }
  next = { ...next, version: state.version + 1,
    processedEventIds: [...state.processedEventIds, event.eventId] };
  return { accepted: true, reason: "RECORDED_NO_SPEND_AUTHORIZATION",
    next, mayTransfer: false, mayRetry: false };
}
