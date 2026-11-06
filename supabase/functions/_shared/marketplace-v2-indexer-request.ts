export type MarketplaceV2IndexerPageRequest = {
  account: string;
  limit: number;
  offset: number;
  startLt?: string;
};

export function parseMarketplaceV2IndexerPageRequest(input: unknown): MarketplaceV2IndexerPageRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Request body must be an object");
  }
  const body = input as Record<string, unknown>;
  if (typeof body.account !== "string" || body.account.length > 128) {
    throw new Error("A valid Marketplace V2 account is required");
  }
  const limit = body.limit === undefined ? 100 : body.limit;
  const offset = body.offset === undefined ? 0 : body.offset;
  if (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > 1000) {
    throw new Error("limit must be an integer between 1 and 1000");
  }
  if (!Number.isSafeInteger(offset) || (offset as number) < 0 || (offset as number) > 100_000) {
    throw new Error("offset must be an integer between 0 and 100000");
  }
  let startLt: string | undefined;
  if (body.start_lt !== undefined) {
    if (typeof body.start_lt !== "string" || !/^(0|[1-9][0-9]*)$/.test(body.start_lt) ||
      BigInt(body.start_lt) > 18_446_744_073_709_551_615n) {
      throw new Error("start_lt must be an unsigned 64-bit decimal string");
    }
    startLt = body.start_lt;
  }
  return { account: body.account, limit: limit as number, offset: offset as number, startLt };
}

export function buildMarketplaceV2TransactionsUrl(
  request: MarketplaceV2IndexerPageRequest,
  normalizedAccount: string,
): URL {
  const url = new URL("https://toncenter.com/api/v3/transactions");
  url.searchParams.set("account", normalizedAccount);
  url.searchParams.set("limit", String(request.limit));
  url.searchParams.set("offset", String(request.offset));
  url.searchParams.set("sort", "asc");
  if (request.startLt !== undefined) url.searchParams.set("start_lt", request.startLt);
  return url;
}
