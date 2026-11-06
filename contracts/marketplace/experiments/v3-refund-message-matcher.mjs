// Correlate untrusted TON Center outgoing messages with an experimental V3
// refund order/query body. Matches are INVESTIGATION CANDIDATES, not proof.
import { decodeTestReserveBuyerPaymentBody } from "./v3-refund-body-decoder.mjs";

const raw = (value) => typeof value === "string" && /^(?:-?1|0):[0-9a-fA-F]{64}$/.test(value);
const decimal = (value) => typeof value === "string" && /^[0-9]+$/.test(value);

export function findV3RefundMessageCandidates(response, { vault, buyer, orderId, queryId }) {
  if (response?.source !== "toncenter-v2-unverified" ||
      response?.trusted !== false || !Array.isArray(response.transactions) ||
      !raw(vault) || !raw(buyer) ||
      response.address?.toLowerCase() !== vault.toLowerCase() ||
      !decimal(orderId) || !decimal(queryId) || BigInt(queryId) === 0n) {
    throw new TypeError("Invalid V3 investigation input");
  }
  const matches = [];
  for (const tx of response.transactions) {
    if (!Array.isArray(tx?.out_msgs)) continue;
    for (const msg of tx.out_msgs) {
      if (msg?.source?.toLowerCase() !== vault.toLowerCase() ||
          msg?.destination?.toLowerCase() !== buyer.toLowerCase() ||
          !decimal(msg?.value) || BigInt(msg.value) === 0n) continue;
      // TON Center v2 may supply msg_data.body as a base64 BOC. Other
      // encodings are deliberately unsupported until separately audited.
      const body = msg?.msg_data?.["@type"] === "msg.dataRaw" ? msg.msg_data.body : null;
      const decoded = decodeTestReserveBuyerPaymentBody(body);
      if (!decoded || decoded.orderId !== BigInt(orderId).toString() ||
          decoded.queryId !== BigInt(queryId).toString() ||
          decoded.amountNano !== BigInt(msg.value).toString()) continue;
      matches.push({
        transactionLt: decimal(tx?.transaction_id?.lt) ? tx.transaction_id.lt : null,
        transactionHash: typeof tx?.transaction_id?.hash === "string" ? tx.transaction_id.hash : null,
        amountNano: decoded.amountNano,
        orderId: decoded.orderId,
        queryId: decoded.queryId,
        verified: false,
        finalized: false,
      });
    }
  }
  return { matches, proofStatus: "UNVERIFIED", mayRetry: false };
}
