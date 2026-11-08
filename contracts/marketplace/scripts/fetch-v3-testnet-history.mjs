// Public testnet transaction history pagination, read-only and bounded.
// TON Center v3 supports offset and limit; incomplete windows are never finality proof.
export async function fetchTestnetTransactionHistory(account, fetcher = fetch, { maxPages = 20, pageSize = 100 } = {}) {
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100 ||
      !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)
    throw new Error("Invalid bounded history pagination");
  const transactions = [];
  const seen = new Set();
  for (let page = 0; page < maxPages; page++) {
    const url = new URL("https://testnet.toncenter.com/api/v3/transactions");
    url.searchParams.set("account", account);
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(page * pageSize));
    const response = await fetcher(url.toString(), { method: "GET", redirect: "error" });
    if (!response.ok) throw new Error("Testnet history HTTP " + response.status);
    const data = await response.json();
    if (!Array.isArray(data.transactions) || data.transactions.length > pageSize)
      throw new Error("Malformed testnet history page");
    for (const tx of data.transactions) {
      const identity = String(tx?.hash ?? "") + ":" + String(tx?.lt ?? "");
      if (!tx?.hash || tx.lt == null || seen.has(identity))
        throw new Error("Duplicate or unidentified testnet transaction");
      seen.add(identity);
      transactions.push(tx);
    }
    if (data.transactions.length < pageSize)
      return { transactions, pageComplete: true, pagesFetched: page + 1 };
  }
  return { transactions, pageComplete: false, pagesFetched: maxPages };
}
