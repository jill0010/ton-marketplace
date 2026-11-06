// Investigative only: correlate outbound V3 refund messages with the buyer's
// inbound TON Center v2 transaction records. API responses are not chain proofs.
import { findV3RefundMessageCandidates } from "./v3-refund-message-matcher.mjs";

const raw = (x) => typeof x === "string" && /^(?:-?1|0):[a-fA-F0-9]{64}$/.test(x);
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
  const recipientCandidates = [];
  for (const match of outbound.matches) {
    for (const tx of buyerResponse.transactions) {
      const inbound = tx?.in_msg;
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
      recipientCandidates.push({
        outboundTransactionHash: match.transactionHash,
        inboundTransactionHash: typeof tx?.transaction_id?.hash === "string"
          ? tx.transaction_id.hash : null,
        orderId: match.orderId,
        queryId: match.queryId,
        amountNano: match.amountNano,
        verified: false,
        finalized: false,
      });
    }
  }
  return {
    recipientCandidates,
    proofStatus: "UNVERIFIED",
    mayRetry: false,
  };
}
