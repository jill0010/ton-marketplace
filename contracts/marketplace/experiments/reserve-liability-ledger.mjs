// Pure per-order accounting model for the future production Reserve Vault.
// No signer, network, persistence, TON message parser, or chain authorization.
// Callers must supply already-authenticated protocol observations.
function invariant(ok, message) { if (!ok) throw new Error(message); }
function nano(value) {
  invariant(typeof value === "bigint" && value >= 0n, "Invalid nano amount");
  return value;
}
function identity(value) {
  invariant(typeof value === "string" && value.length > 0, "Missing order identity");
  return value;
}
function snapshot(state) {
  const outstandingNano = state.principalNano - state.paidNano;
  return Object.freeze({
    ...state,
    operations: Object.freeze(state.operations.map((op) => Object.freeze({ ...op }))),
    outstandingNano,
    availableNano: state.availableNano,
    inFlightNano: state.inFlightNano,
    paidNano: state.paidNano,
    feesNano: state.feesNano,
    shortfallNano: outstandingNano > state.availableNano + state.inFlightNano
      ? outstandingNano - state.availableNano - state.inFlightNano : 0n,
  });
}
export function createReserveLedger({ orderId, buyer, principalNano }) {
  identity(orderId); identity(buyer); nano(principalNano);
  invariant(principalNano > 0n, "Reserve principal must be positive");
  return snapshot({
    orderId, buyer, principalNano, availableNano: principalNano,
    inFlightNano: 0n, paidNano: 0n, feesNano: 0n,
    nextOperationId: 1n, operations: [],
  });
}
function mutable(state) {
  invariant(state && typeof state === "object", "Invalid ledger");
  identity(state.orderId);
  identity(state.buyer);
  invariant(Array.isArray(state.operations), "Invalid ledger operations");
  for (const field of ["principalNano", "paidNano", "inFlightNano", "availableNano", "feesNano", "nextOperationId"]) {
    invariant(typeof state[field] === "bigint" && state[field] >= 0n, "Invalid ledger amount: " + field);
  }
  invariant(state.principalNano > 0n && state.nextOperationId > 0n, "Invalid ledger principal or operation sequence");

  let fundedTopUps = 0n;
  let operationInFlight = 0n;
  let operationPaid = 0n;
  let operationFees = 0n;
  let maxOperationId = 0n;
  const operationIds = new Set();
  const fundingHashes = new Set();
  const evidenceHashes = new Set();

  for (const op of state.operations) {
    invariant(op && typeof op === "object", "Invalid ledger operation");
    const amount = nano(op.amountNano);
    invariant(amount > 0n, "Ledger operation amount must be positive");
    if (op.kind === "topup") {
      identity(op.fundingMessageHash);
      invariant(!fundingHashes.has(op.fundingMessageHash), "Duplicate top-up funding message");
      fundingHashes.add(op.fundingMessageHash);
      fundedTopUps += amount;
      continue;
    }
    invariant(op.kind === "refund", "Unknown ledger operation kind");
    invariant(typeof op.operationId === "bigint" && op.operationId > 0n, "Invalid refund operation ID");
    invariant(!operationIds.has(op.operationId.toString()), "Duplicate refund operation ID");
    operationIds.add(op.operationId.toString());
    if (op.operationId > maxOperationId) maxOperationId = op.operationId;
    if (op.status === "in-flight") {
      invariant(op.evidenceHash === undefined && op.returnedNano === undefined && op.creditedNano === undefined,
        "In-flight refund has settlement evidence");
      operationInFlight += amount;
    } else if (op.status === "bounced") {
      const returned = nano(op.returnedNano);
      identity(op.evidenceHash);
      invariant(returned <= amount && op.creditedNano === undefined, "Invalid bounced refund accounting");
      invariant(!evidenceHashes.has(op.evidenceHash), "Duplicate settlement evidence");
      evidenceHashes.add(op.evidenceHash);
      operationFees += amount - returned;
    } else if (op.status === "credited") {
      const credited = nano(op.creditedNano);
      identity(op.evidenceHash);
      invariant(credited === amount && op.returnedNano === undefined, "Invalid credited refund accounting");
      invariant(!evidenceHashes.has(op.evidenceHash), "Duplicate settlement evidence");
      evidenceHashes.add(op.evidenceHash);
      operationPaid += credited;
    } else {
      invariant(false, "Unknown refund operation status");
    }
  }

  invariant(state.nextOperationId > maxOperationId, "Stale next refund operation ID");
  invariant(operationInFlight === state.inFlightNano, "In-flight balance does not match refund operations");
  invariant(operationPaid === state.paidNano, "Paid balance does not match refund operations");
  invariant(operationFees === state.feesNano, "Fee balance does not match bounced refund operations");
  const accountedPrincipal = state.principalNano + fundedTopUps;
  invariant(
    state.paidNano + state.inFlightNano + state.availableNano + state.feesNano === accountedPrincipal,
    "Reserve principal conservation invariant violated",
  );
  invariant(state.paidNano + state.inFlightNano <= accountedPrincipal, "Ledger over-allocated");
  return { ...state, operations: state.operations.map((op) => ({ ...op })) };
}
export function topUpReserve(state, { orderId, buyer, amountNano, fundingMessageHash }) {
  const next = mutable(state);
  invariant(orderId === next.orderId && buyer === next.buyer, "Top-up identity mismatch");
  const amount = nano(amountNano);
  invariant(amount > 0n, "Top-up must be positive");
  const outstanding = next.principalNano - next.paidNano;
  const uncovered = outstanding > next.availableNano + next.inFlightNano
    ? outstanding - next.availableNano - next.inFlightNano : 0n;
  invariant(uncovered > 0n, "Top-up is not allowed without an outstanding shortfall");
  invariant(amount === uncovered, "Top-up must equal the exact outstanding shortfall");
  identity(fundingMessageHash);
  invariant(!next.operations.some((op) => op.fundingMessageHash === fundingMessageHash),
    "Funding message already consumed");
  next.availableNano += amount;
  next.operations.push({ kind: "topup", fundingMessageHash, amountNano: amount });
  return snapshot(next);
}
export function dispatchReserveRefund(state, { orderId, buyer, amountNano, operationId }) {
  const next = mutable(state);
  invariant(orderId === next.orderId && buyer === next.buyer, "Refund identity mismatch");
  const amount = nano(amountNano);
  invariant(amount > 0n, "Refund must settle a positive outstanding liability");
  invariant(amount === next.principalNano - next.paidNano, "Refund must settle exact outstanding liability");
  invariant(next.availableNano >= amount, "Insufficient order-isolated available funds");
  invariant(operationId === next.nextOperationId, "Stale or reused operation ID");
  next.availableNano -= amount;
  next.inFlightNano += amount;
  next.operations.push({ kind: "refund", operationId, amountNano: amount, status: "in-flight" });
  next.nextOperationId += 1n;
  return snapshot(next);
}
export function reconcileRefundResult(state, { orderId, buyer, operationId, returnedNano, creditedNano, result, evidenceHash }) {
  const next = mutable(state);
  invariant(orderId === next.orderId && buyer === next.buyer, "Receipt identity mismatch");
  identity(evidenceHash);
  const index = next.operations.findIndex((op) => op.kind === "refund" && op.operationId === operationId);
  invariant(index >= 0, "Unknown refund operation");
  const operation = next.operations[index];
  invariant(operation.status === "in-flight", "Operation already reconciled");
  invariant(!next.operations.some((op) => op.evidenceHash === evidenceHash), "Receipt evidence replay");
  if (result === "bounced") {
    const returned = nano(returnedNano);
    invariant(creditedNano === undefined || creditedNano === 0n, "Bounce cannot credit buyer");
    invariant(returned <= operation.amountNano, "Returned value exceeds original dispatch");
    next.inFlightNano -= operation.amountNano;
    next.availableNano += returned;
    next.feesNano += operation.amountNano - returned;
    operation.status = "bounced";
    operation.returnedNano = returned;
  } else if (result === "credited") {
    const credited = nano(creditedNano);
    invariant(returnedNano === undefined || returnedNano === 0n, "Credit cannot also return principal");
    invariant(credited === operation.amountNano, "Buyer credit must equal dispatched amount");
    next.inFlightNano -= operation.amountNano;
    next.paidNano += credited;
    operation.status = "credited";
    operation.creditedNano = credited;
  } else {
    invariant(false, "Unsupported refund result");
  }
  operation.evidenceHash = evidenceHash;
  return snapshot(next);
}
