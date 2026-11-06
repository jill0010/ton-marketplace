import {
  buildMarketplaceV2TransactionsUrl,
  parseMarketplaceV2IndexerPageRequest,
} from "./marketplace-v2-indexer-request.ts";

Deno.test("uses bounded ascending TON Center pagination with an optional start_lt cursor", () => {
  const request = parseMarketplaceV2IndexerPageRequest({
    account: "0:" + "a".repeat(64),
    limit: 250,
    offset: 500,
    start_lt: "18446744073709551615",
  });
  const url = buildMarketplaceV2TransactionsUrl(request, request.account);
  if (url.searchParams.get("limit") !== "250" ||
      url.searchParams.get("offset") !== "500" ||
      url.searchParams.get("sort") !== "asc" ||
      url.searchParams.get("start_lt") !== "18446744073709551615") {
    throw new Error("TON Center pagination parameters were not preserved");
  }
});

Deno.test("applies safe defaults and rejects unbounded or unsafe pagination", () => {
  const defaults = parseMarketplaceV2IndexerPageRequest({ account: "wallet" });
  if (defaults.limit !== 100 || defaults.offset !== 0 || defaults.startLt !== undefined) {
    throw new Error("Indexer page defaults are incorrect");
  }
  const invalid = [
    { account: "wallet", limit: 0 },
    { account: "wallet", limit: 1001 },
    { account: "wallet", offset: -1 },
    { account: "wallet", offset: 100001 },
    { account: "wallet", limit: 1.5 },
    { account: "wallet", start_lt: "-1" },
    { account: "wallet", start_lt: "18446744073709551616" },
    { account: "wallet", start_lt: 10 },
  ];
  for (const input of invalid) {
    let rejected = false;
    try { parseMarketplaceV2IndexerPageRequest(input); } catch { rejected = true; }
    if (!rejected) throw new Error("Unsafe pagination input was accepted");
  }
});
