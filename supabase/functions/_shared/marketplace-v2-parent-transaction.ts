import { Address } from "npm:@ton/core@0.63.1";

type MessageRow = {
  hash?: unknown;
  source?: unknown;
  destination?: unknown;
};
type WalletTransaction = {
  account?: unknown;
  hash?: unknown;
  mc_block_seqno?: unknown;
  emulated?: unknown;
  description?: {
    aborted?: unknown;
    compute_ph?: { success?: unknown };
    action?: { success?: unknown };
  };
  out_msgs?: unknown;
};

function normalizeHash(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (/^[0-9a-f]{64}$/i.test(value)) return value.toLowerCase();
  if (!/^[A-Za-z0-9_+/=-]+$/.test(value) || value.length > 128) return null;
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    if (binary.length !== 32) return null;
    let hex = "";
    for (let i = 0; i < binary.length; i += 1) {
      hex += binary.charCodeAt(i).toString(16).padStart(2, "0");
    }
    return hex;
  } catch { return null; }
}

function rawAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { return Address.parse(value).toRawString().toLowerCase(); } catch { return null; }
}

export function buildTransactionsByMessageUrl(messageHash: string): URL {
  const hash = normalizeHash(messageHash);
  if (!hash) throw new Error("A valid 256-bit inbound message hash is required");
  const url = new URL("https://toncenter.com/api/v3/transactionsByMessage");
  url.searchParams.set("msg_hash", hash);
  url.searchParams.set("direction", "out");
  url.searchParams.set("limit", "10");
  url.searchParams.set("offset", "0");
  return url;
}

export type BuyerRootTransactionResolution =
  | { status: "matched"; buyerWalletRootTransactionHash: string; transactionLt: string; masterchainBlockSeqno: number }
  | { status: "unmatched" | "ambiguous"; candidateCount: number };

export function resolveBuyerWalletRootTransaction(
  transactions: unknown,
  input: { messageHash: string; buyerAddress: string; marketplaceAddress: string },
): BuyerRootTransactionResolution {
  if (!Array.isArray(transactions)) throw new Error("TON Center message lookup is not an array");
  const expectedHash = normalizeHash(input.messageHash);
  const expectedBuyer = rawAddress(input.buyerAddress);
  const expectedMarketplace = rawAddress(input.marketplaceAddress);
  if (!expectedHash || !expectedBuyer || !expectedMarketplace) {
    throw new Error("Buyer root transaction identity inputs are invalid");
  }

  const matches: Array<{ hash: string; lt: string; mc: number }> = [];
  for (const value of transactions) {
    if (!value || typeof value !== "object") continue;
    const tx = value as WalletTransaction;
    if (rawAddress(tx.account) !== expectedBuyer) continue;
    const txHash = normalizeHash(tx.hash);
    if (!txHash || typeof tx.lt !== "string" || !/^(0|[1-9][0-9]*)$/.test(tx.lt)) continue;
    if (typeof tx.mc_block_seqno !== "number" || !Number.isSafeInteger(tx.mc_block_seqno) || tx.mc_block_seqno <= 0) continue;
    if (tx.emulated !== false || tx.description?.aborted !== false ||
      tx.description?.compute_ph?.success !== true || tx.description?.action?.success !== true) continue;
    if (!Array.isArray(tx.out_msgs)) continue;

    const exactOutgoingMessage = tx.out_msgs.some((message) => {
      if (!message || typeof message !== "object") return false;
      const msg = message as MessageRow;
      return normalizeHash(msg.hash) === expectedHash &&
        rawAddress(msg.source) === expectedBuyer &&
        rawAddress(msg.destination) === expectedMarketplace;
    });
    if (exactOutgoingMessage) matches.push({ hash: txHash, lt: tx.lt, mc: tx.mc_block_seqno });
  }

  if (matches.length === 0) return { status: "unmatched", candidateCount: 0 };
  if (matches.length !== 1) return { status: "ambiguous", candidateCount: matches.length };
  return {
    status: "matched",
    buyerWalletRootTransactionHash: matches[0].hash,
    transactionLt: matches[0].lt,
    masterchainBlockSeqno: matches[0].mc,
  };
}
