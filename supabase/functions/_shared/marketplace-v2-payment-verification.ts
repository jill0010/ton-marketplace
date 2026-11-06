import { Address } from "npm:@ton/core@0.63.1";
import type { DecodedBuyProductV2 } from "./marketplace-v2-buy-message.ts";
import type { MarketplaceV2OrderSnapshot } from "./marketplace-v2-order-cell.ts";

function hash256(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (/^[0-9a-f]{64}$/i.test(value)) return value.toLowerCase();
  if (!/^[A-Za-z0-9_+/=-]+$/.test(value) || value.length > 128) return null;
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    if (binary.length !== 32) return null;
    let hex = "";
    for (let i = 0; i < binary.length; i += 1) hex += binary.charCodeAt(i).toString(16).padStart(2, "0");
    return hex;
  } catch { return null; }
}
function rawAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { return Address.parse(value).toRawString().toLowerCase(); } catch { return null; }
}

export type MarketplaceTraceTransaction = {
  account?: unknown;
  hash?: unknown;
  emulated?: unknown;
  mc_block_seqno?: unknown;
  description?: {
    aborted?: unknown;
    compute_ph?: { success?: unknown };
    action?: { success?: unknown };
  };
  in_msg?: {
    hash?: unknown;
    source?: unknown;
    destination?: unknown;
    value?: unknown;
    message_content?: { body?: unknown };
  } | null;
};

export function findFinalizedMarketplaceBuyInTrace(
  trace: unknown,
  input: {
    buyerRootTransactionHash: string;
    inboundMessageHash: string;
    buyerAddress: string;
    marketplaceAddress: string;
  },
): { traceId: string; marketplaceTransaction: MarketplaceTraceTransaction; marketplaceTransactionHash: string; inboundMessageHash: string } {
  if (!trace || typeof trace !== "object" || Array.isArray(trace)) throw new Error("Invalid TON trace");
  const value = trace as Record<string, unknown>;
  if (value.is_incomplete !== false) throw new Error("TON payment trace is incomplete");
  if (!value.trace_info || typeof value.trace_info !== "object" ||
    (value.trace_info as Record<string, unknown>).pending_messages !== 0) {
    throw new Error("TON payment trace still has pending messages");
  }
  if (typeof value.trace_id !== "string" || value.trace_id.length === 0) throw new Error("TON trace has no trace ID");
  if (!value.transactions || typeof value.transactions !== "object" || Array.isArray(value.transactions)) {
    throw new Error("TON trace is missing its transaction map");
  }

  const rootHash = hash256(input.buyerRootTransactionHash);
  const messageHash = hash256(input.inboundMessageHash);
  const buyer = rawAddress(input.buyerAddress);
  const marketplace = rawAddress(input.marketplaceAddress);
  if (!rootHash || !messageHash || !buyer || !marketplace) throw new Error("Payment trace identity inputs are invalid");

  const txs = Object.values(value.transactions as Record<string, unknown>);
  const rootMatches = txs.filter((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const tx = raw as MarketplaceTraceTransaction;
    return hash256(tx.hash) === rootHash && rawAddress(tx.account) === buyer &&
      tx.emulated === false && tx.description?.aborted === false &&
      tx.description?.compute_ph?.success === true && tx.description?.action?.success === true;
  });
  if (rootMatches.length !== 1) throw new Error("Buyer wallet root transaction is missing or not uniquely finalized in trace");

  const matches: Array<{ tx: MarketplaceTraceTransaction; hash: string }> = [];
  for (const raw of txs) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const tx = raw as MarketplaceTraceTransaction;
    const hash = hash256(tx.hash);
    const msg = tx.in_msg;
    if (!hash || !msg || typeof msg !== "object") continue;
    if (rawAddress(tx.account) !== marketplace || hash256(msg.hash) !== messageHash) continue;
    if (rawAddress(msg.source) !== buyer || rawAddress(msg.destination) !== marketplace) continue;
    if (typeof msg.value !== "string" || !/^(0|[1-9][0-9]*)$/.test(msg.value)) continue;
    if (typeof msg.message_content?.body !== "string") continue;
    if (tx.emulated !== false || tx.description?.aborted !== false ||
      tx.description?.compute_ph?.success !== true || tx.description?.action?.success !== true) continue;
    matches.push({ tx, hash });
  }
  if (matches.length !== 1) throw new Error("Trace does not contain exactly one finalized Marketplace transaction for the buyer message");
  return {
    traceId: value.trace_id,
    marketplaceTransaction: matches[0].tx,
    marketplaceTransactionHash: matches[0].hash,
    inboundMessageHash: messageHash,
  };
}

export function verifyMarketplaceV2OrderPaymentIdentity(
  order: MarketplaceV2OrderSnapshot,
  payment: DecodedBuyProductV2 & { buyerRaw: string },
): void {
  if (order.productId !== payment.productId.toString()) throw new Error("On-chain order product ID does not match BuyProductV2");
  if (order.buyer !== payment.buyerRaw) throw new Error("On-chain order buyer does not match the authenticated buyer wallet");
  if (order.grossNano !== payment.expectedPriceNano.toString()) throw new Error("On-chain order gross price does not match BuyProductV2");
  if (order.processingReserveNano !== payment.reserveNano.toString()) throw new Error("On-chain order reserve does not match the exact 0.2 TON payment reserve");
  if (order.paymentQueryId !== payment.queryId.toString()) throw new Error("On-chain order payment query ID does not match BuyProductV2");
}
