// Offline, fail-closed accounting report. Candidate API data never becomes
// spendable funds or authorizes an on-chain retry.
import { correlateV3RefundBounce } from "./v3-refund-bounce-correlation.mjs";
import { correlateV3RefundRecipient } from "./v3-refund-recipient-correlation.mjs";

export function auditV3RefundSettlement({
  vaultResponse, buyerResponse, vault, buyer, orderId, queryId,
  externallyCompensated = false,
}) {
  const input = { vaultResponse, vault, buyer, orderId, queryId };
  const bounce = correlateV3RefundBounce(input);
  const recipient = correlateV3RefundRecipient({
    ...input, buyerResponse,
  });
  const conflicts = bounce.candidates.length > 0 &&
    recipient.recipientCandidates.length > 0;
  const reasons = [];
  if (externallyCompensated) reasons.push("EXTERNALLY_COMPENSATED_NO_REPAYMENT");
  if (bounce.ambiguous) reasons.push("AMBIGUOUS_BOUNCE");
  if (recipient.ambiguous) reasons.push("AMBIGUOUS_BUYER_RECEIPT");
  if (conflicts) reasons.push("BOUNCE_AND_RECEIPT_CONFLICT");
  if (!bounce.candidates.length && !recipient.recipientCandidates.length) {
    reasons.push("NO_CORRELATED_CANDIDATES");
  }
  return {
    orderId: String(orderId),
    queryId: String(queryId),
    outboundToBuyerCandidateCount: recipient.recipientCandidates.length,
    returnedToVaultCandidateCount: bounce.candidates.length,
    conflictingEvidence: conflicts,
    ambiguousEvidence: Boolean(bounce.ambiguous || recipient.ambiguous),
    reasons,
    accountingStatus: "NO_VERIFIED_SETTLEMENT",
    verifiedBuyerCreditNano: "0",
    verifiedReturnedToVaultNano: "0",
    mayConfirmReceipt: false,
    mayConfirmBounce: false,
    mayRetry: false,
    mayReleaseFunds: false,
    proofStatus: "UNVERIFIED",
  };
}
