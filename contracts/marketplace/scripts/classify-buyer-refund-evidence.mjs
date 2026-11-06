// Read-only refund triage. Caller MUST independently verify chain evidence.
// This module never authorizes a transfer or retries a payout.
export function classifyBuyerRefundEvidence(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Refund evidence must be an object");
  }
  const { outboundVerified, recipientReceiptVerified, bounceVerified,
    returnedPrincipalVerified, sameOperationVerified, conflictingEvidence } = input;
  for (const value of [outboundVerified, recipientReceiptVerified, bounceVerified,
    returnedPrincipalVerified, sameOperationVerified, conflictingEvidence]) {
    if (typeof value !== "boolean") throw new TypeError("All evidence flags must be explicit booleans");
  }
  if (conflictingEvidence || (recipientReceiptVerified && (bounceVerified || returnedPrincipalVerified))) {
    return { state: "CONFLICT", retryAuthorized: false, requiresManualReview: true };
  }
  if (!outboundVerified || !sameOperationVerified) {
    return { state: "UNKNOWN", retryAuthorized: false, requiresManualReview: true };
  }
  if (recipientReceiptVerified) {
    return { state: "RECEIVED", retryAuthorized: false, requiresManualReview: false };
  }
  if (bounceVerified && returnedPrincipalVerified) {
    return { state: "RETURNED", retryAuthorized: false, requiresManualReview: true };
  }
  return { state: "UNKNOWN", retryAuthorized: false, requiresManualReview: true };
}

/**
 * Read-only, conservative order-level reconciliation.
 * The caller must supply independently verified operation and transaction IDs.
 * No state transition here authorizes an on-chain transfer.
 */
export function reconcileBuyerRefundOperations({ orderId, operations }) {
  if (typeof orderId !== "string" || !orderId || !Array.isArray(operations) || operations.length === 0) {
    throw new TypeError("Order ID and nonempty operations are required");
  }
  const operationIds = new Set();
  const transactionIds = new Set();
  let hasReceived = false;
  let hasReturned = false;
  let hasUnknown = false;
  let hasConflict = false;
  for (const entry of operations) {
    if (!entry || entry.orderId !== orderId ||
        typeof entry.operationId !== "string" || !entry.operationId ||
        typeof entry.transactionId !== "string" || !entry.transactionId) {
      return { state: "CONFLICT", retryAuthorized: false, requiresManualReview: true };
    }
    if (operationIds.has(entry.operationId) || transactionIds.has(entry.transactionId)) {
      return { state: "CONFLICT", retryAuthorized: false, requiresManualReview: true };
    }
    operationIds.add(entry.operationId);
    transactionIds.add(entry.transactionId);
    const result = classifyBuyerRefundEvidence(entry.evidence);
    if (result.state === "RECEIVED") hasReceived = true;
    else if (result.state === "RETURNED") hasReturned = true;
    else if (result.state === "CONFLICT") hasConflict = true;
    else hasUnknown = true;
  }
  if (hasConflict || (hasReceived && hasReturned) || (hasReceived && hasUnknown)) {
    return { state: "CONFLICT", retryAuthorized: false, requiresManualReview: true };
  }
  if (hasReceived) return { state: "RECEIVED", retryAuthorized: false, requiresManualReview: false };
  if (hasReturned && !hasUnknown) return { state: "RETURNED", retryAuthorized: false, requiresManualReview: true };
  return { state: "UNKNOWN", retryAuthorized: false, requiresManualReview: true };
}
