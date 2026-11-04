import { handleCors, jsonResponse } from "./http.ts";

const TONCENTER_RUN_GET_URL = "https://toncenter.com/api/v2/runGetMethod";
const UINT64_MAX = (1n << 64n) - 1n;

type ToncenterRunGetResponse = {
  ok?: boolean;
  error?: string;
  stack?: unknown[];
  result?: {
    stack?: unknown[];
  };
};

function parseNumericStackValue(entry: unknown): bigint {
  let raw: unknown;

  if (Array.isArray(entry) && entry.length >= 2 && entry[0] === "num") {
    raw = entry[1];
  } else if (
    entry !== null &&
    typeof entry === "object" &&
    "type" in entry &&
    entry.type === "num" &&
    "value" in entry
  ) {
    raw = entry.value;
  }

  if (typeof raw !== "string") {
    throw new Error("TONCENTER returned an unexpected getter stack value");
  }

  try {
    return BigInt(raw);
  } catch {
    throw new Error("TONCENTER returned an invalid numeric getter value");
  }
}

async function runGetMethod(
  address: string,
  method: string,
  stack: unknown[] = [],
): Promise<bigint> {
  const apiKey = Deno.env.get("TONCENTER_API_KEY");
  if (!apiKey) {
    throw new Error("TONCENTER server configuration unavailable");
  }

  const response = await fetch(TONCENTER_RUN_GET_URL, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({ address, method, stack }),
  });

  if (!response.ok) {
    throw new Error(`TONCENTER getter request failed (${response.status})`);
  }

  const result = await response.json() as ToncenterRunGetResponse;
  if (result.ok !== true) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "TONCENTER getter execution failed",
    );
  }

  const values = result.stack ?? result.result?.stack;
  if (!Array.isArray(values) || values.length !== 1) {
    throw new Error("TONCENTER getter returned an unexpected stack");
  }

  return parseNumericStackValue(values[0]);
}

function requireConfiguredAddress(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

Deno.serve(async (request: Request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({ error: "Invalid request body" }, 400);
    }

    if (body.action === "next-listing-ids") {
      const marketplace = requireConfiguredAddress("MARKETPLACE_V2_ADDRESS");
      const escrow = requireConfiguredAddress("NFT_ESCROW_V2_ADDRESS");
      const [
        nextProductId,
        nextQueryId,
        escrowConfigured,
        treasuryConfigured,
      ] = await Promise.all([
        runGetMethod(marketplace, "nextProductIdV2"),
        runGetMethod(marketplace, "nextQueryIdV2"),
        runGetMethod(marketplace, "escrowConfiguredV2"),
        runGetMethod(marketplace, "treasuryConfiguredV2"),
      ]);

      if (
        nextProductId <= 0n || nextProductId > UINT64_MAX ||
        nextQueryId <= 0n || nextQueryId > UINT64_MAX
      ) {
        throw new Error("Marketplace V2 returned invalid listing identifiers");
      }

      return jsonResponse({
        success: true,
        next_product_id: nextProductId.toString(),
        next_query_id: nextQueryId.toString(),
        marketplace_address: marketplace,
        escrow_address: escrow,
        escrow_configured: escrowConfigured === 1n,
        treasury_configured: treasuryConfigured === 1n,
      });
    }

    if (body.action === "escrow-registration") {
      const escrow = requireConfiguredAddress("NFT_ESCROW_V2_ADDRESS");
      if (
        typeof body.query_id !== "string" ||
        !/^[0-9]{1,20}$/.test(body.query_id)
      ) {
        return jsonResponse({ error: "Invalid query_id" }, 400);
      }

      const queryId = BigInt(body.query_id);
      if (queryId <= 0n || queryId > UINT64_MAX) {
        return jsonResponse({ error: "Invalid query_id" }, 400);
      }

      const escrowId = await runGetMethod(
        escrow,
        "escrowIdForQueryV2",
        [["num", `0x${queryId.toString(16)}`]],
      );

      return jsonResponse({
        success: true,
        registered: escrowId > 0n,
        escrow_id: escrowId.toString(),
      });
    }

    return jsonResponse({ error: "Unsupported action" }, 400);
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error instanceof Error
        ? error.message
        : "Marketplace V2 state lookup failed",
    }, 503);
  }
});
