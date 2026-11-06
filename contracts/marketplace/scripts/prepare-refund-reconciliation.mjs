import { validateRefundChainRecord } from "./validate-refund-chain-record.mjs";

// Read-only adapter. Untrusted RPC/indexer JSON is not a chain proof.
// Verification must be independently implemented and audited before any
// evidence flag can be promoted. No signing or transfer authorization.
export function prepareRefundReconciliation({ orderId, records }) {
  if (typeof orderId !== "string" || !orderId || !Array.isArray(records) || !records.length) {
    throw new TypeError("Order ID and records are required");
  }
  const seen = new Set();
  const diagnostics = [];
  for (const record of records) {
    let check;
    try {
      check = validateRefundChainRecord(record);
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      diagnostics.push("MALFORMED_CHAIN_RECORD");
      continue;
    }
    if (!check.valid) {
      diagnostics.push(check.reason);
      continue;
    }
    if (record.orderId !== orderId) {
      diagnostics.push("ORDER_MISMATCH");
      continue;
    }
    const key = record.transactionId.toLowerCase();
    if (seen.has(key)) diagnostics.push("DUPLICATE_TRANSACTION");
    seen.add(key);
    // Deliberately ignore record.verified, record.evidence, and any
    // asserted return/receipt status from untrusted inputs.
    diagnostics.push("UNVERIFIED_CHAIN_RECORD");
  }
  // The reconciliation engine is intentionally not called with promoted
  // evidence: no independent chain proof verifier exists in this adapter.
  // A separate audited verifier must bind order, operation, amount,
  // sender, recipient, message, and transaction finality.
  return {
    state: diagnostics.some(reason => reason !== "UNVERIFIED_CHAIN_RECORD")
      ? "CONFLICT" : "UNKNOWN",
    retryAuthorized: false,
    requiresManualReview: true,
    diagnostics,
  };
}
