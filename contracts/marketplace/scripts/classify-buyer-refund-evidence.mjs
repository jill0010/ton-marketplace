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
