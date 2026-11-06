const DECIMAL_NANO = /^(0|[1-9][0-9]*)$/;
const RAW_ADDRESS = /^-?[0-9]+:[0-9a-f]{64}$/i;
const HASH = /^[0-9a-f]{64}$/i;

function parseNano(value, label) {
  if (typeof value !== "string" || !DECIMAL_NANO.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return BigInt(value);
}

function normalizeHash(value) {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new Error("Invalid root transaction hash");
  }
  return value.toLowerCase();
}

function normalizeRawAddress(value, label) {
  if (typeof value !== "string" || !RAW_ADDRESS.test(value)) {
    throw new Error(`Invalid ${label} account address`);
  }
  return value.toLowerCase();
}

function getTransactions(trace) {
  if (trace.transactions && typeof trace.transactions === "object" &&
    !Array.isArray(trace.transactions)) {
    return Object.entries(trace.transactions).map(([hash, tx]) => ({
      ...tx,
      hash: typeof tx?.hash === "string" ? tx.hash : hash,
    }));
  }
  if (Array.isArray(trace.transactions_full)) return trace.transactions_full;
  throw new Error("Trace is missing its full transaction set");
}

/**
 * Reports observed fees paid by Marketplace, Escrow and NFT Item accounts in
 * one complete TON trace. This is diagnostic only: account total_fees do not
 * prove that those fees consumed this order's reserve, because contract
 * balances and internal message values may be pooled across orders.
 *
 * Consequently this function never calculates a customer refund amount and
 * never marks reserve attribution as verified. It is read-only and cannot
 * authorize or send a refund.
 */
export function calculateMarketplaceProcessingReserve(trace, input) {
  if (!trace || typeof trace !== "object" || Array.isArray(trace)) {
    throw new Error("Invalid TON trace");
  }
  if (trace.is_incomplete !== false) {
    throw new Error("TON trace is incomplete");
  }
  if (!trace.trace_info || trace.trace_info.pending_messages !== 0) {
    throw new Error("TON trace still has pending messages");
  }
  if (typeof trace.trace_id !== "string" || trace.trace_id.length === 0) {
    throw new Error("TON trace has no trace ID");
  }
  const mcSeqnoEnd = parseNano(String(trace.mc_seqno_end ?? ""), "trace final masterchain sequence");
  if (mcSeqnoEnd <= 0n) throw new Error("TON trace is not finalized");

  const rootHash = normalizeHash(input.rootTransactionHash);
  const reserve = parseNano(input.reserveNano, "processing reserve");
  const marketplace = normalizeRawAddress(input.marketplaceAddress, "Marketplace");
  const escrow = normalizeRawAddress(input.escrowAddress, "Escrow");
  const nftItem = normalizeRawAddress(input.nftItemAddress, "NFT Item");
  const buyer = normalizeRawAddress(input.buyerAddress, "buyer");
  const seller = normalizeRawAddress(input.sellerAddress, "seller");
  const treasury = normalizeRawAddress(input.treasuryAddress, "treasury");

  const feeAccounts = new Set([marketplace, escrow, nftItem]);
  const allowedAccounts = new Set([marketplace, escrow, nftItem, buyer, seller, treasury]);
  const transactions = getTransactions(trace);
  if (transactions.length === 0) throw new Error("TON trace contains no transactions");

  let rootFound = false;
  let observedFees = 0n;
  const feesByAccount = new Map();
  const seenTransactions = new Set();

  for (const tx of transactions) {
    if (!tx || typeof tx !== "object") throw new Error("TON trace contains an invalid transaction");
    const txHash = normalizeHash(tx.hash);
    if (seenTransactions.has(txHash)) throw new Error("TON trace contains a duplicate transaction");
    seenTransactions.add(txHash);
    if (txHash === rootHash) rootFound = true;

    const account = normalizeRawAddress(tx.account, "transaction");
    if (!allowedAccounts.has(account)) {
      throw new Error("TON trace contains an unexpected account; manual review required");
    }
    const fee = parseNano(tx.total_fees, "transaction total fee");
    if (feeAccounts.has(account)) {
      observedFees += fee;
      feesByAccount.set(account, (feesByAccount.get(account) ?? 0n) + fee);
    }
  }

  if (!rootFound) throw new Error("Payment transaction is not part of the returned trace");
  if (!transactions.some((tx) => tx.account?.toLowerCase?.() === marketplace)) {
    throw new Error("TON trace does not include a Marketplace transaction");
  }
  if (!transactions.some((tx) => tx.account?.toLowerCase?.() === escrow)) {
    throw new Error("TON trace does not include an Escrow transaction");
  }

  // Transaction total_fees show what each account paid, but they do not prove
  // which nanotons came from this order's 0.2 TON reserve. The reserve is mixed
  // with contract balances and fixed-value internal messages (e.g. 0.05/0.03 TON).
  // Until a per-order value-flow ledger and terminal balance reconciliation exist,
  // never turn observed fees into a customer refund amount.
  return {
    traceId: trace.trace_id,
    transactionCount: transactions.length,
    reserveNano: reserve.toString(),
    observedContractFeesNano: observedFees.toString(),
    refundableNano: null,
    shortfallNano: null,
    status: "manual_review_attribution_unproven",
    attributionVerified: false,
    feesByAccount: Object.fromEntries(
      [...feesByAccount.entries()].map(([account, fee]) => [account, fee.toString()]),
    ),
    previewOnly: true,
    refundAuthorized: false,
  };
}
