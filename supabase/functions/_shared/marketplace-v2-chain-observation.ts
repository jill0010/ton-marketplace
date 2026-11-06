import { validateBuyProductV2Transaction } from "./marketplace-v2-buy-message.ts";

type ToncenterV3Transaction = {
  hash?: unknown;
  lt?: unknown;
  mc_block_seqno?: unknown;
  emulated?: unknown;
  description?: {
    aborted?: unknown;
    compute_ph?: { success?: unknown };
    action?: { success?: unknown };
  };
  in_msg?: {
    hash?: unknown;
    in_msg_tx_hash?: unknown;
    source?: unknown;
    destination?: unknown;
    value?: unknown;
    message_content?: { body?: unknown };
  } | null;
};

export type MarketplaceV2BuyObservation = {
  productId: string;
  expectedPriceNano: string;
  reserveNano: string;
  totalPaymentNano: string;
  paymentQueryId: string;
  deadline: number;
  buyerRaw: string;
  marketplaceTransactionHash: string;
  inboundMessageHash: string;
  parentTransactionHash: string;
  transactionLt: string;
  masterchainBlockSeqno: number;
};

/**
 * Extract only finalized, successful BuyProductV2 contract transactions from
 * a TON Center V3 transaction page. No persistence or transaction sending.
 */
export function observeMarketplaceV2Buys(
  transactions: unknown,
  expectedMarketplaceAddress: string,
): MarketplaceV2BuyObservation[] {
  if (!Array.isArray(transactions)) throw new Error("TON Center transaction page is not an array");
  const observations: MarketplaceV2BuyObservation[] = [];

  for (const value of transactions) {
    if (!value || typeof value !== "object") continue;
    const tx = value as ToncenterV3Transaction;
    const msg = tx.in_msg;
    if (!msg || typeof msg !== "object") continue;
    if (typeof msg.message_content?.body !== "string") continue;
    if (typeof msg.source !== "string" || typeof msg.destination !== "string") continue;
    if (typeof msg.value !== "string" || !/^(0|[1-9][0-9]*)$/.test(msg.value)) continue;
    if (typeof tx.hash !== "string" || typeof msg.hash !== "string") continue;
    if (typeof tx.mc_block_seqno !== "number" || typeof tx.lt !== "string") continue;
    if (typeof msg.in_msg_tx_hash !== "string" ||
      !/^[0-9a-f]{64}$/i.test(msg.in_msg_tx_hash)) continue;

    try {
      const decoded = validateBuyProductV2Transaction({
        bodyBocBase64: msg.message_content.body,
        destination: msg.destination,
        expectedMarketplaceAddress,
        source: msg.source,
        transactionValueNano: msg.value,
        transactionHash: tx.hash,
        messageHash: msg.hash,
        masterchainBlockSeqno: tx.mc_block_seqno,
        emulated: tx.emulated === true,
        aborted: tx.description?.aborted !== false,
        computeSuccess: tx.description?.compute_ph?.success === true,
        actionSuccess: tx.description?.action?.success === true,
      });
      if (!/^(0|[1-9][0-9]*)$/.test(tx.lt)) continue;
      observations.push({
        productId: decoded.productId.toString(),
        expectedPriceNano: decoded.expectedPriceNano.toString(),
        reserveNano: decoded.reserveNano.toString(),
        totalPaymentNano: decoded.totalPaymentNano.toString(),
        paymentQueryId: decoded.queryId.toString(),
        deadline: decoded.deadline,
        buyerRaw: decoded.buyerRaw,
        marketplaceTransactionHash: decoded.marketplaceTransactionHash,
        inboundMessageHash: decoded.inboundMessageHash,
        // This is only the transaction that emitted the inbound message.
        // It must be followed and verified before being treated as a wallet root.
        parentTransactionHash: msg.in_msg_tx_hash.toLowerCase(),
        transactionLt: tx.lt,
        masterchainBlockSeqno: tx.mc_block_seqno,
      });
    } catch {
      // A V3 page can contain unrelated messages, malformed rows or failed
      // candidate purchases. They are intentionally excluded from observations.
    }
  }
  return observations;
}
