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
  const candidates = [];
  for (const sent of outgoing.matches) {
    if (!sent.transactionHash || !decimal(sent.amountNano)) continue;
    for (const bounce of incoming.candidates) {
      if (!bounce.transactionHash || !bounce.messageHash ||
          !decimal(bounce.amountNano) ||
          BigInt(bounce.amountNano) > BigInt(sent.amountNano)) continue;
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
  return {
    candidates,
    proofStatus: "UNVERIFIED",
    mayRetry: false,
  };
}
