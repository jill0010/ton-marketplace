// Independent settlement proof boundary. This module does NOT verify TON block
// signatures or transaction inclusion. Until a separately audited lite-client
// verifier is integrated, no caller-provided RPC JSON can authorize money moves.
// The classifications distinguish reported buyer credit, reported bounce, and
// conflicts without promoting any provider's claims to finality.
import { auditV3RefundSettlement } from "./v3-refund-settlement-audit.mjs";

const raw = (x) => typeof x === "string" && /^(?:-1|0):[a-fA-F0-9]{64}$/.test(x);
const decimal = (x) => typeof x === "string" && /^(0|[1-9][0-9]*)$/.test(x);
const key = (x) => typeof x === "string" ? x.toLowerCase() : "";

export function assessV3IndependentSettlement({
  network, vault, buyer, orderId, queryId, observations, externallyCompensated = false,
}) {
  if (network !== "testnet" || !raw(vault) || !raw(buyer) ||
      key(vault) === key(buyer) || !decimal(orderId) ||
      !decimal(queryId) || BigInt(queryId) === 0n ||
      !Array.isArray(observations) || observations.length !== 2 ||
      observations.some((o) => !o || typeof o !== "object" ||
        !o.vaultResponse || !o.buyerResponse)) {
    throw new TypeError("Invalid independent settlement assessment inputs");
  }
  const reports = observations.map((o) => {
    if (o.vaultResponse.network !== "testnet" ||
        o.buyerResponse.network !== "testnet") {
      throw new TypeError("Testnet-only observations required");
    }
    return auditV3RefundSettlement({
      vaultResponse: o.vaultResponse, buyerResponse: o.buyerResponse,
      vault, buyer, orderId, queryId, externallyCompensated,
    });
  });
  const signature = (r) => JSON.stringify({
    receipt: r.outboundToBuyerCandidateCount,
    bounce: r.returnedToVaultCandidateCount,
    conflict: r.conflictingEvidence,
    ambiguous: r.ambiguousEvidence,
  });
  // Equal candidate counts are not agreement on transaction identity.
  // Compare exact candidate identities from both providers as well.
  const identities = observations.map((o) => {
    const outgoing = o.vaultResponse.transactions.flatMap((tx) =>
      (tx?.out_msgs ?? []).map((msg) => [tx?.transaction_id?.hash, msg?.hash]));
    const incoming = o.buyerResponse.transactions.map((tx) =>
      [tx?.transaction_id?.hash, tx?.in_msg?.hash]);
    return JSON.stringify({ outgoing: outgoing.sort(), incoming: incoming.sort() });
  });
  const sameObservation = signature(reports[0]) === signature(reports[1]) &&
    identities[0] === identities[1];
  const candidateCredit = reports.every((r) =>
    r.outboundToBuyerCandidateCount === 1 &&
    r.returnedToVaultCandidateCount === 0 && !r.ambiguousEvidence);
  const candidateReturn = reports.every((r) =>
    r.returnedToVaultCandidateCount === 1 &&
    r.outboundToBuyerCandidateCount === 0 && !r.ambiguousEvidence);
  const conflict = reports.some((r) => r.conflictingEvidence || r.ambiguousEvidence) ||
    !sameObservation || (candidateCredit && candidateReturn);
  const observedStatus = externallyCompensated ? "EXTERNALLY_COMPENSATED" :
    conflict ? "CONFLICTING_UNVERIFIED_OBSERVATIONS" :
    candidateCredit ? "BUYER_CREDIT_CANDIDATE" :
    candidateReturn ? "BOUNCE_RETURN_CANDIDATE" : "NO_SETTLEMENT_CANDIDATE";
  return {
    network, vault, buyer, orderId, queryId, observedStatus,
    observationAgreement: sameObservation,
    // Even two agreeing RPCs are not independent chain proofs. No finality
    // assertion, no verified credit, and no spend permission.
    cryptographicInclusionVerified: false,
    finalized: false,
    verifiedBuyerCreditNano: "0",
    verifiedReturnedToVaultNano: "0",
    proofStatus: "UNVERIFIED",
    reasons: externallyCompensated ? ["EXTERNAL_COMPENSATION_NO_REPAYMENT"] :
      ["MISSING_CRYPTOGRAPHIC_TRANSACTION_INCLUSION_AND_FINALITY_PROOF"],
    mayConfirmReceipt: false,
    mayConfirmBounce: false,
    mayRetry: false,
    mayReleaseFunds: false,
    mayDeployMainnet: false,
  };
}
