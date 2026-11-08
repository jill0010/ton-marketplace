// Public testnet transaction history pagination, read-only and bounded.
// TON Center v3 supports offset and limit; incomplete windows are never finality proof.
import { normalizeV3TestnetAddress } from "./verify-v3-testnet.mjs";

export async function fetchTestnetTransactionHistory(account, fetcher = fetch, { maxPages = 20, pageSize = 100 } = {}) {
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100 ||
      !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)
    throw new Error("Invalid bounded history pagination");
  const normalizedAccount = normalizeV3TestnetAddress(account);
  const transactions = [];
  const seen = new Set();
  for (let page = 0; page < maxPages; page++) {
    const url = new URL("https://testnet.toncenter.com/api/v3/transactions");
    url.searchParams.set("account", normalizedAccount);
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(page * pageSize));
    const response = await fetcher(url.toString(), { method: "GET", redirect: "error" });
    if (!response.ok) throw new Error("Testnet history HTTP " + response.status);
    const data = await response.json();
    if (!data || !Array.isArray(data.transactions) || data.transactions.length > pageSize)
      throw new Error("Malformed testnet history page");
    for (const tx of data.transactions) {
      const identity = String(tx?.hash ?? "") + ":" + String(tx?.lt ?? "");
      if (!/^[0-9a-f]{64}$/i.test(String(tx?.hash ?? "")) && !/^[A-Za-z0-9+/]{43}=$/.test(String(tx?.hash ?? "")))
        throw new Error("Invalid testnet transaction hash");
      if (!/^(0|[1-9][0-9]*)$/.test(String(tx?.lt ?? "")) || seen.has(identity))
        throw new Error("Duplicate or unidentified testnet transaction");
      seen.add(identity);
      transactions.push(tx);
    }
    if (data.transactions.length < pageSize)
      return { transactions, pageComplete: true, pagesFetched: page + 1 };
  }
  return { transactions, pageComplete: false, pagesFetched: maxPages };
}
