// Combined investigative report: never turn API candidates or caller-supplied
// accounting into verified chain proof or authorization to spend.
import { auditV3RefundSettlement } from "./v3-refund-settlement-audit.mjs";
import { auditV3ReserveConservation } from "./v3-reserve-conservation.mjs";

export function auditV3RefundReleaseGate({ settlement, ledger }) {
  if (!settlement || !ledger || typeof settlement !== "object" ||
      typeof ledger !== "object") throw new TypeError("Missing V3 evidence inputs");
  const chain = auditV3RefundSettlement(settlement);
  const accounting = auditV3ReserveConservation(ledger);
  const reasons = [...new Set([...chain.reasons, ...accounting.reasons])];
  if (!accounting.balanced) reasons.push("RESERVE_LEDGER_UNBALANCED");
  if (settlement.externallyCompensated === true ||
      BigInt(ledger.externalCompensationNano) > 0n) {
    if (!reasons.includes("EXTERNAL_COMPENSATION_NO_REPAYMENT")) {
      reasons.push("EXTERNAL_COMPENSATION_NO_REPAYMENT");
    }
  }
  // Both sources are observational/unverified. This integration gate is
  // intentionally permanently closed, including for balanced arithmetic.
  return {
    orderId: chain.orderId,
    queryId: chain.queryId,
    accountingBalanced: accounting.balanced,
    recipientCandidateCount: chain.outboundToBuyerCandidateCount,
    bounceCandidateCount: chain.returnedToVaultCandidateCount,
    conflictingEvidence: chain.conflictingEvidence,
    ambiguousEvidence: chain.ambiguousEvidence,
    reasons,
    releaseStatus: "BLOCKED_UNVERIFIED",
    proofStatus: "UNVERIFIED",
    verifiedBuyerCreditNano: "0",
    verifiedReturnedToVaultNano: "0",
    mayConfirmReceipt: false,
    mayConfirmBounce: false,
    mayRetry: false,
    mayReleaseFunds: false,
    mayDeployMainnet: false,
  };
}
