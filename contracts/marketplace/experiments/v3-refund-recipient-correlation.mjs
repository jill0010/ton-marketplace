// Investigative only: correlate outbound V3 refund messages with the buyer's
// inbound TON Center v2 transaction records. API responses are not chain proofs.
import { findV3RefundMessageCandidates } from "./v3-refund-message-matcher.mjs";

const raw = (x) => typeof x === "string" && /^(?:-1|0):[a-fA-F0-9]{64}$/.test(x);
const normalize = (x) => typeof x === "string" ? x.toLowerCase() : "";
const decimal = (x) => typeof x === "string" && /^[0-9]+$/.test(x);

export function correlateV3RefundRecipient({
  vaultResponse, buyerResponse, vault, buyer, orderId, queryId,
}) {
  const outbound = findV3RefundMessageCandidates(vaultResponse, {
    vault, buyer, orderId, queryId,
  });
  if (!raw(buyer) || buyerResponse?.source !== "toncenter-v2-unverified" ||
      buyerResponse?.trusted !== false ||
      normalize(buyerResponse.address) !== normalize(buyer) ||
      !Array.isArray(buyerResponse.transactions)) {
    throw new TypeError("Invalid buyer transaction evidence");
  }
  // Bound the cross-product of untrusted provider records before matching.
  if (outbound.matches.length > 20 || buyerResponse.transactions.length > 200) {
    return {
      recipientCandidates: [], ambiguous: true, proofStatus: "UNVERIFIED",
      mayRetry: false, reason: "TOO_MANY_UNVERIFIED_CANDIDATES",
    };
  }
  const recipientCandidates = [];
  for (const match of outbound.matches) {
    for (const tx of buyerResponse.transactions) {
      const inbound = tx?.in_msg;
      // A bounced inbound message is a return path, never buyer credit.
      if (inbound?.bounced === true) continue;
      if (normalize(inbound?.source) !== normalize(vault) ||
          normalize(inbound?.destination) !== normalize(buyer) ||
          !decimal(inbound?.value) ||
          inbound.value !== match.amountNano) continue;
      const body = inbound?.msg_data?.["@type"] === "msg.dataRaw" ? inbound.msg_data.body : null;
      // Reuse strict opcode/order/query matching on a one-message synthetic
      // response. This confirms message structure, NOT transaction identity.
      const synthetic = {
        source: "toncenter-v2-unverified", trusted: false, address: vault,
        transactions: [{ transaction_id: tx.transaction_id, out_msgs: [inbound] }],
      };
      const correlated = findV3RefundMessageCandidates(synthetic, {
        vault, buyer, orderId, queryId,
      });
      if (!body || correlated.matches.length !== 1) continue;
      // TON Center v2 may expose a message hash on both sides. Require an
      // exact nonempty match when present, but never infer it from body bytes.
      // The outbound message must be recovered from the same vault transaction.
      if (typeof match.transactionHash !== "string" || !match.transactionHash) continue;
      const matchingVaultTransactions = vaultResponse.transactions.filter((row) =>
        row?.transaction_id?.hash === match.transactionHash);
      // Repeated or missing transaction identities cannot prove a unique path.
      if (matchingVaultTransactions.length !== 1) continue;
      const vaultTx = matchingVaultTransactions[0];
      const matchingOut = vaultTx?.out_msgs?.filter((msg) =>
        normalize(msg?.source) === normalize(vault) &&
        normalize(msg?.destination) === normalize(buyer) &&
        msg?.value === match.amountNano &&
        msg?.msg_data?.["@type"] === "msg.dataRaw" &&
        msg?.msg_data?.body === body) ?? [];
      if (matchingOut.length !== 1) continue;
      const outboundHash = matchingOut[0]?.hash;
      const inboundHash = inbound?.hash;
      if (typeof outboundHash !== "string" || !outboundHash ||
          typeof inboundHash !== "string" || outboundHash !== inboundHash) continue;
      // The receiving transaction must have one unique, nonempty identity.
      const recipientTxHash = tx?.transaction_id?.hash;
      if (typeof recipientTxHash !== "string" || !recipientTxHash ||
          buyerResponse.transactions.filter((row) =>
            row?.transaction_id?.hash === recipientTxHash).length !== 1) continue;
      // A transaction reported as aborted or unsuccessful is not a receipt.
      // Absence of these fields remains unverified, never a success claim.
      if (tx?.description?.aborted === true || tx?.description?.compute_ph?.success === false ||
          tx?.description?.action?.success === false ||
          tx?.description?.bounce?.type === "ok" ||
          tx?.description?.bounce?.type === "no-funds") continue;
      recipientCandidates.push({
        outboundTransactionHash: match.transactionHash,
        inboundTransactionHash: recipientTxHash,
        orderId: match.orderId,
        queryId: match.queryId,
        amountNano: match.amountNano,
        messageHash: outboundHash,
        executionStatus: tx?.description?.aborted === false &&
          tx?.description?.compute_ph?.success === true ? "REPORTED_SUCCESS" : "UNKNOWN",
        verified: false,
        finalized: false,
      });
    }
  }
  const ambiguous = recipientCandidates.length > 1;
  return {
    recipientCandidates: ambiguous ? [] : recipientCandidates,
    ambiguous,
    proofStatus: "UNVERIFIED",
    mayRetry: false,
  };
}
