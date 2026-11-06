// Read-only TON Center v2 transaction transport for V3 investigation.
// Raw API results are UNTRUSTED. Never classify them as finalized proof or retry permission.
// No wallet keys, transaction signing, or network calls during import.
const MAX_LIMIT = 20;
export async function fetchReserveVaultTransactions({
  address,
  apiBase = "https://testnet.toncenter.com/api/v2",
  apiKey,
  limit = 10,
  fetchImpl = fetch,
}) {
  if (typeof address !== "string" || !/^(?:-?1|0):[a-fA-F0-9]{64}$/.test(address)) {
    throw new TypeError("Expected a raw TON workchain:64-hex vault address");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new RangeError("Transaction limit must be between 1 and 20");
  }
  const base = new URL(apiBase);
  if (base.protocol !== "https:" || base.username || base.password ||
      base.search || base.hash || !["testnet.toncenter.com", "toncenter.com"].includes(base.hostname)) {
    throw new TypeError("Only official TON Center HTTPS endpoints are allowed");
  }
  const url = new URL(base.href.replace(/\/$/, "") + "/getTransactions");
  url.searchParams.set("address", address);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("archival", "true");
  const headers = {};
  if (apiKey != null) {
    if (typeof apiKey !== "string" || !apiKey.trim()) throw new TypeError("Invalid API key");
    headers["X-API-Key"] = apiKey;
  }
  const response = await fetchImpl(url, { method: "GET", headers, redirect: "error" });
  if (!response?.ok) throw new Error("TON Center request failed");
  const body = await response.json();
  if (body?.ok !== true || !Array.isArray(body.result)) {
    throw new Error("Unexpected TON Center transaction response");
  }
  return {
    source: "toncenter-v2-unverified",
    trusted: false,
    network: base.hostname === "testnet.toncenter.com" ? "testnet" : "mainnet",
    address,
    transactions: body.result,
  };
}
