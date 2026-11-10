import { observeMarketplaceV2Buys } from "./marketplace-v2-chain-observation.ts";

/**
 * S06-P003: verify a TON Testnet V3 purchase transaction against the
 * independently read on-chain order binding BEFORE persisting a receipt.
 * This pure verifier has no RPC, database or signing capability.
 *
 * It deliberately does not mark a payment as finalized: transaction
 * inclusion is not enough to prove the buyer's root wallet transaction,
 * successful NFT delivery, payout or reserve settlement.
 */
export type V3TestnetOrderBinding = Readonly<{
  network: "-3";
  marketplaceRaw: string;
  orderId: string;
  productId: string;
  paymentQueryId: string;
  buyerRaw: string;
  priceNano: string;
  reserveNano: "200000000";
  onChainOrderIdForProduct: string;
  onChainProductStatus: string;
}>;

export type V3TestnetPaymentEvidence = Readonly<{
  network: "-3";
  marketplaceRaw: string;
  orderId: string;
  productId: string;
  paymentQueryId: string;
  buyerRaw: string;
  priceNano: string;
  reserveNano: "200000000";
  paymentTxHash: string;
  inboundMessageHash: string;
  parentTransactionHash: string;
  transactionLt: string;
  blockSeqno: number;
  state: "observed_unfinalized";
}>;

const UINT64 = 18446744073709551615n;
function validUint64(value: string): boolean {
  return /^(?:[1-9][0-9]*)$/.test(value) && BigInt(value) <= UINT64;
}
function validRaw(value: string): boolean {
  return /^0:[0-9a-f]{64}$/.test(value);
}

/**
 * Returns a unique matching chain observation or null.
 * Throws on ambiguous/replayed evidence, malformed bindings or conflicts.
 */
export function reconcileV3TestnetPurchaseObservation(
  transactions: unknown,
  binding: V3TestnetOrderBinding,
): V3TestnetPaymentEvidence | null {
  if (binding.network !== "-3" ||
      !validRaw(binding.marketplaceRaw) ||
      !validRaw(binding.buyerRaw) ||
      !validUint64(binding.orderId) ||
      !validUint64(binding.productId) ||
      !validUint64(binding.paymentQueryId) ||
      !/^[1-9][0-9]*$/.test(binding.priceNano) ||
      binding.reserveNano !== "200000000" ||
      binding.onChainOrderIdForProduct !== binding.orderId ||
      !["3", "5"].includes(binding.onChainProductStatus)) {
    throw new Error("V3 Testnet chain order binding is missing or inconsistent");
  }
  const observed = observeMarketplaceV2Buys(transactions, binding.marketplaceRaw);
  const productTransactions = observed.filter(x => x.productId === binding.productId);
  if (productTransactions.some(x =>
    x.paymentQueryId !== binding.paymentQueryId ||
    x.buyerRaw !== binding.buyerRaw ||
    x.expectedPriceNano !== binding.priceNano ||
    x.reserveNano !== binding.reserveNano)) {
    throw new Error("Conflicting V3 Testnet purchase transaction for product");
  }
  const matching = productTransactions.filter(x =>
    x.paymentQueryId === binding.paymentQueryId &&
    x.buyerRaw === binding.buyerRaw &&
    x.expectedPriceNano === binding.priceNano &&
    x.reserveNano === binding.reserveNano);
  if (matching.length === 0) return null;
  if (matching.length !== 1) {
    throw new Error("Ambiguous V3 Testnet payment evidence");
  }
  const match = matching[0];
  if (!match.parentTransactionHash || !match.masterchainBlockSeqno ||
      BigInt(match.transactionLt) <= 0n) {
    throw new Error("Incomplete V3 Testnet payment trace");
  }
  return Object.freeze({
    network: "-3",
    marketplaceRaw: binding.marketplaceRaw,
    orderId: binding.orderId,
    productId: binding.productId,
    paymentQueryId: binding.paymentQueryId,
    buyerRaw: binding.buyerRaw,
    priceNano: binding.priceNano,
    reserveNano: binding.reserveNano,
    paymentTxHash: match.marketplaceTransactionHash,
    inboundMessageHash: match.inboundMessageHash,
    parentTransactionHash: match.parentTransactionHash,
    transactionLt: match.transactionLt,
    blockSeqno: match.masterchainBlockSeqno,
    state: "observed_unfinalized",
  });
}
