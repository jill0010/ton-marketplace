// Strictly read-only historical payment inspection; no wallet, signer or transfer.
import { normalizeV3TestnetAddress } from "./verify-v3-testnet.mjs";
import { pathToFileURL } from "node:url";
export const HISTORICAL_PAYMENT = Object.freeze({
  marketplace: "kQDC5qBHrvcwaJamwEzZTbuI4YjKX3fEegQHV2IXgu9Fro8Y",
  hash: "e7a04f5f059ae336811a4b135231a5ad5785743c08e01098b34788c18d527e9f",
  amountNano: "210000000",
});
function hashHex(value) {
  if (typeof value !== "string") return null;
  if (/^[a-f0-9]{64}$/i.test(value)) return value.toLowerCase();
  try {
    const bytes = Buffer.from(value, "base64");
    if (bytes.length === 32) return bytes.toString("hex");
  } catch {}
  return null;
}
export function classifyHistoricalPayment(txs, payment = HISTORICAL_PAYMENT) {
  if (!Array.isArray(txs)) throw new TypeError("Expected transactions array");
  const matches = txs.filter(t => hashHex(t.transaction_id?.hash) === payment.hash);
  if (matches.length !== 1) return { state: "UNRESOLVED", reason: matches.length ? "DUPLICATE_TRANSACTION" : "TRANSACTION_NOT_IN_PAGE", refundConfirmed: false, retryAuthorized: false };
  const tx = matches[0];
  const inbound = tx.in_msg;
  const inboundValue = String(inbound?.value ?? "");
  const outbound = Array.isArray(tx.out_msgs) ? tx.out_msgs : null;
  const inboundMatches = inboundValue === payment.amountNano;
  // TON transaction fees, storage charges and balance changes require independent
  // ledger reconciliation. A missing outbound message does NOT prove custody.
  return {
    state: "UNRESOLVED", reason: inboundMatches ? "INBOUND_FOUND_OUTBOUND_FINALITY_UNVERIFIED" : "INBOUND_AMOUNT_MISMATCH",
    transactionHash: payment.hash, inboundNano: inboundValue,
    inboundMatches, outboundCount: outbound?.length ?? null,
    aborted: tx.description?.compute_ph?.success === false || tx.compute_phase?.exit_code === 212,
    refundConfirmed: false, retryAuthorized: false, mainnetApproved: false,
    requiresIndependentBalanceAndRecipientTrace: true,
  };
}
// API v3 indexes transactions by exact hash, avoiding overloaded archival
// liteservers. Treat indexer output as reported evidence, NOT a verified refund.
export async function inspectHistoricalByHashV3(fetcher = fetch) {
  const account = normalizeV3TestnetAddress(HISTORICAL_PAYMENT.marketplace);
  const url = new URL("https://testnet.toncenter.com/api/v3/transactions");
  url.searchParams.set("account", account);
  url.searchParams.set("hash", HISTORICAL_PAYMENT.hash);
  url.searchParams.set("limit", "10");
  const response = await fetcher(url.toString(), {
    method: "GET", redirect: "error",
    headers: process.env.TONCENTER_API_KEY ? { "X-API-Key": process.env.TONCENTER_API_KEY } : {},
  });
  if (!response.ok) throw new Error("Historical indexed RPC HTTP " + response.status);
  const body = await response.json();
  if (!Array.isArray(body.transactions)) throw new Error("Invalid indexed transaction response");
  const matches = body.transactions.filter(tx => hashHex(tx.hash) === HISTORICAL_PAYMENT.hash);
  if (matches.length !== 1) {
    let identity = { kind: "unidentified", accounts: [] };
    if (matches.length === 0) {
      // A URL copied from a wallet trace can contain a message hash or a
      // transaction hash belonging to the sender, not the Marketplace.
      // Check both identities before saying the archival hash is missing.
      const lookups = [
        ["transaction", "transactions", "hash"],
        ["message", "transactionsByMessage", "msg_hash"],
      ];
      for (const [kind, endpoint, parameter] of lookups) {
        const lookup = new URL("https://testnet.toncenter.com/api/v3/" + endpoint);
        lookup.searchParams.set(parameter, HISTORICAL_PAYMENT.hash);
        lookup.searchParams.set("limit", "10");
        const found = await fetcher(lookup.toString(), {
          method: "GET", redirect: "error",
          headers: process.env.TONCENTER_API_KEY ? { "X-API-Key": process.env.TONCENTER_API_KEY } : {},
        });
        if (!found.ok) {
          identity = { kind: "lookup_failed", endpoint, httpStatus: found.status, accounts: [] };
          break;
        }
        const data = await found.json();
        if (!Array.isArray(data.transactions)) throw new Error("Invalid " + kind + " hash lookup response");
        if (data.transactions.length > 0) {
          identity = { kind, accounts: [...new Set(data.transactions.map(item => item.account).filter(value => typeof value === "string"))],
            returnedTransactions: data.transactions.length };
          break;
        }
      }
    }
    return {
      network: "testnet", marketplace: account, source: "TON Center v3 indexed",
      state: "UNRESOLVED", reason: matches.length ? "DUPLICATE_TRANSACTION" : "HASH_NOT_FOUND_FOR_MARKETPLACE",
      hashIdentity: identity,
      refundConfirmed: false, retryAuthorized: false, mainnetApproved: false, readOnly: true,
    };
  }
  const tx = matches[0];
  if (typeof tx.account !== "string" || normalizeV3TestnetAddress(tx.account) !== account) {
    throw new Error("Indexed transaction account does not match historical Marketplace");
  }
  const inboundNano = String(tx.in_msg?.value ?? "");
  const balances = [tx.account_state_before?.balance, tx.account_state_after?.balance];
  const validBalance = balances.every(n => typeof n === "string" && /^(0|[1-9][0-9]*)$/.test(n));
  const outbound = Array.isArray(tx.out_msgs) ? tx.out_msgs : null;
  return {
    network: "testnet", marketplace: account, source: "TON Center v3 indexed",
    transactionHash: HISTORICAL_PAYMENT.hash,
    state: "UNRESOLVED",
    reason: inboundNano === HISTORICAL_PAYMENT.amountNano ?
      "INDEXED_INBOUND_FOUND_REFUND_UNVERIFIED" : "INDEXED_INBOUND_AMOUNT_MISMATCH",
    inboundNano, inboundMatches: inboundNano === HISTORICAL_PAYMENT.amountNano,
    balanceBeforeNano: validBalance ? balances[0] : null,
    balanceAfterNano: validBalance ? balances[1] : null,
    balanceDeltaNano: validBalance ? String(BigInt(balances[1]) - BigInt(balances[0])) : null,
    totalFeesNano: /^(0|[1-9][0-9]*)$/.test(String(tx.total_fees ?? "")) ? String(tx.total_fees) : null,
    outboundCount: outbound?.length ?? null,
    outbounds: outbound?.map(m => ({ destination: m.destination ?? null, valueNano: String(m.value ?? "") })) ?? null,
    aborted: tx.description?.aborted === true,
    computeExitCode: Number.isInteger(tx.description?.compute_ph?.exit_code) ? tx.description.compute_ph.exit_code : null,
    refundConfirmed: false, retryAuthorized: false, mainnetApproved: false,
    requiresIndependentBalanceAndRecipientTrace: true, readOnly: true,
  };
}

export async function inspectHistoricalTestnetPayment(fetcher = fetch, { maxPages = 10 } = {}) {
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 50) {
    throw new RangeError("maxPages must be between 1 and 50");
  }
  const address = normalizeV3TestnetAddress(HISTORICAL_PAYMENT.marketplace);
  let cursor = null;
  let inspectedTransactions = 0;
  const seenCursors = new Set();
  for (let page = 1; page <= maxPages; page++) {
    const url = new URL("https://testnet.toncenter.com/api/v2/getTransactions");
    url.searchParams.set("address", address);
    url.searchParams.set("limit", "100");
    url.searchParams.set("archival", "true");
    if (cursor) {
      url.searchParams.set("lt", cursor.lt);
      url.searchParams.set("hash", cursor.hash);
      url.searchParams.set("to_lt", "0");
    }
    // Historical reads may fail when archival liteservers are overloaded.
    // Retry a bounded number of transient HTTP responses without changing
    // the read-only request or authorizing any financial operation.
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetcher(url.toString(), {
        method: "GET", redirect: "error",
        headers: process.env.TONCENTER_API_KEY ? { "X-API-Key": process.env.TONCENTER_API_KEY } : {},
      });
      if (response.ok || ![429, 500, 502, 503, 504, 542].includes(response.status)) break;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 600 * (attempt + 1)));
    }
    if (!response.ok) {
      // Only use v3 fallback for transient upstream failures; strict
      // validation still prevents treating incomplete records as settlement.
      if ([429, 500, 502, 503, 504, 542].includes(response.status)) {
        try {
          const indexed = await inspectHistoricalByHashV3(fetcher);
          return { ...indexed, archivalV2FailureStatus: response.status };
        } catch (error) {
          throw new Error("Historical transaction RPC HTTP " + response.status +
            "; indexed hash fallback also failed: " + error.message);
        }
      }
      throw new Error("Historical transaction RPC HTTP " + response.status);
    }
    const body = await response.json();
    if (body.ok !== true || !Array.isArray(body.result)) throw new Error("Invalid historical transaction RPC response");
    const transactions = body.result;
    inspectedTransactions += transactions.length;
    const result = classifyHistoricalPayment(transactions);
    if (result.transactionHash) return { network: "testnet", marketplace: address,
      ...result, inspectedTransactions, pagesInspected: page, readOnly: true };
    if (transactions.length < 100) break;
    const oldest = transactions.at(-1)?.transaction_id;
    if (!oldest || !/^[1-9][0-9]*$/.test(String(oldest.lt ?? "")) ||
        typeof oldest.hash !== "string" || !hashHex(oldest.hash)) {
      throw new Error("Missing or invalid historical pagination cursor");
    }
    const next = { lt: String(oldest.lt), hash: oldest.hash };
    const key = next.lt + ":" + hashHex(next.hash);
    if (seenCursors.has(key)) throw new Error("Repeated historical pagination cursor");
    seenCursors.add(key);
    cursor = next;
  }
  return { network: "testnet", marketplace: address, state: "UNRESOLVED",
    reason: "TRANSACTION_NOT_FOUND_IN_BOUNDED_HISTORY", inspectedTransactions,
    maxPages, readOnly: true, refundConfirmed: false, retryAuthorized: false,
    mainnetApproved: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await inspectHistoricalTestnetPayment();
    console.log(JSON.stringify(result, null, 2));
    if (!result.inboundMatches) process.exitCode = 1;
  } catch (error) {
    console.error("HISTORICAL_PAYMENT_UNRESOLVED:", error.message);
    process.exitCode = 1;
  }
}
