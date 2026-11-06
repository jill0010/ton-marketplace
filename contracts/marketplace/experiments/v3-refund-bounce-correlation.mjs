// Offline correlation of a provider-reported bounce with a specific outgoing
// refund. This is an investigative hint only, not proof of principal recovery.
import { findV3RefundMessageCandidates } from "./v3-refund-message-matcher.mjs";
import { findV3RefundBounceCandidates } from "./v3-refund-bounce-candidates.mjs";

const decimal = (x) => typeof x === "string" && /^[0-9]+$/.test(x);

export function correlateV3RefundBounce({
  vaultResponse, vault, buyer, orderId, queryId,
}) {
  const outgoing = findV3RefundMessageCandidates(vaultResponse, {
    vault, buyer, orderId, queryId,
  });
  const incoming = findV3RefundBounceCandidates({
    vaultResponse, vault, buyer,
  });
  // A large cross-product of unrelated messages is an ambiguity signal, not
  // evidence. Refuse to correlate beyond a small bounded investigation set.
  if (outgoing.matches.length > 20 || incoming.candidates.length > 20) {
    return {
      candidates: [],
      ambiguous: true,
      verifiedReturnedNano: "0",
      accountingStatus: "NO_VERIFIED_PRINCIPAL",
      mayConfirmBounce: false,
      proofStatus: "UNVERIFIED",
      mayRetry: false,
      reason: "TOO_MANY_UNVERIFIED_CANDIDATES",
    };
  }
  const candidates = [];
  const transactionHashes = vaultResponse.transactions.map((tx) => tx?.transaction_id?.hash);
  const uniqueTransactionHash = (hash) => typeof hash === "string" && hash.length > 0 &&
    transactionHashes.filter((candidate) => candidate === hash).length === 1;
  const bounceMessageHashes = incoming.candidates.map((candidate) => candidate.messageHash);
  const uniqueBounceMessageHash = (hash) => typeof hash === "string" && hash.length > 0 &&
    bounceMessageHashes.filter((candidate) => candidate === hash).length === 1;
  let identityConflict = false;
  for (const sent of outgoing.matches) {
    if (!uniqueTransactionHash(sent.transactionHash)) {
      identityConflict = true;
      continue;
    }
    if (!decimal(sent.amountNano)) continue;
    for (const bounce of incoming.candidates) {
      if (!uniqueTransactionHash(bounce.transactionHash) ||
          !uniqueBounceMessageHash(bounce.messageHash)) {
        identityConflict = true;
        continue;
      }
      if (!decimal(bounce.amountNano) ||
          BigInt(bounce.amountNano) > BigInt(sent.amountNano)) continue;
      // Match the experimental contract's maximum 0.01 TON bounce fee loss.
      const allowance = 10000000n;
      const amount = BigInt(sent.amountNano);
      const minimum = amount > allowance ? amount - allowance : amount;
      if (BigInt(bounce.amountNano) < minimum) continue;
      // The provider's bounce message hash is not the original outbound
      // message hash. No unique linkage is inferred from address/amount.
      candidates.push({
        outgoingTransactionHash: sent.transactionHash,
        bounceTransactionHash: bounce.transactionHash,
        orderId: sent.orderId,
        queryId: sent.queryId,
        outgoingAmountNano: sent.amountNano,
        bouncedAmountNano: bounce.amountNano,
        linkageStatus: "UNPROVEN",
        principalVerified: false,
        mayRetry: false,
      });
    }
  }
  // Candidate values must never be summed as verified recovered principal.
  const ambiguous = identityConflict || candidates.length > 1 ||
    new Set(candidates.map((c) => c.bounceTransactionHash)).size !== candidates.length ||
    new Set(candidates.map((c) => c.outgoingTransactionHash)).size !== candidates.length;
  return {
    candidates: candidates.map((candidate) => ({
      ...candidate,
      linkageStatus: ambiguous ? "AMBIGUOUS_UNPROVEN" : "UNPROVEN",
    })),
    ambiguous,
    identityConflict,
    verifiedReturnedNano: "0",
    accountingStatus: "NO_VERIFIED_PRINCIPAL",
    // Do not use any of these candidates to mutate vault state or release funds.
    mayConfirmBounce: false,
    proofStatus: "UNVERIFIED",
    mayRetry: false,
  };
}
