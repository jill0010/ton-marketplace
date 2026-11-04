import { Address, Cell } from "npm:@ton/core";
import { Buffer } from "node:buffer";
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

async function runGetMethodCell(
  address: string,
  method: string,
  stack: unknown[] = [],
): Promise<Cell> {
  const apiKey = Deno.env.get("TONCENTER_API_KEY");
  if (!apiKey) throw new Error("TONCENTER server configuration unavailable");

  const response = await fetch(TONCENTER_RUN_GET_URL, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({ address, method, stack }),
  });
  if (!response.ok) throw new Error(`TONCENTER getter request failed (${response.status})`);

  const result = await response.json() as ToncenterRunGetResponse;
  if (result.ok !== true) throw new Error("TONCENTER getter execution failed");
  const values = result.stack ?? result.result?.stack;
  if (!Array.isArray(values) || values.length !== 1) {
    throw new Error("TONCENTER cell getter returned an unexpected stack");
  }

  const entry = values[0];
  let bytes: string | undefined;
  if (Array.isArray(entry) && entry[0] === "cell") {
    const value = entry[1];
    if (typeof value === "string") bytes = value;
    else if (value && typeof value === "object" && "bytes" in value &&
      typeof value.bytes === "string") bytes = value.bytes;
  } else if (entry && typeof entry === "object" && "type" in entry &&
    entry.type === "cell" && "value" in entry) {
    const value = entry.value;
    if (typeof value === "string") bytes = value;
    else if (value && typeof value === "object" && "bytes" in value &&
      typeof value.bytes === "string") bytes = value.bytes;
  }

  if (!bytes) throw new Error("TONCENTER returned an invalid escrow record cell");
  const roots = Cell.fromBoc(Buffer.from(bytes, "base64"));
  if (roots.length !== 1) throw new Error("TONCENTER returned an invalid escrow record BoC");
  return roots[0];
}

type EscrowRecordSnapshot = {
  escrowId: bigint;
  nftItem: string;
  seller: string;
  productId: bigint;
  status: number;
  queryId: bigint;
  collection: string;
  itemIndex: bigint;
  kind: number;
};

function parseEscrowRecord(cell: Cell): EscrowRecordSnapshot {
  const slice = cell.beginParse();
  const escrowId = slice.loadUintBig(64);
  const nftItem = slice.loadAddress();
  const seller = slice.loadAddress();
  const productId = slice.loadUintBig(64);
  const status = slice.loadUint(8);
  const queryId = slice.loadUintBig(64);
  const extra = slice.loadRef().beginParse();
  const collection = extra.loadAddress();
  const itemIndex = extra.loadUintBig(256);
  const kind = extra.loadUint(8);
  extra.endParse();
  slice.endParse();

  if (!nftItem || !seller || !collection) {
    throw new Error("Escrow record contains an invalid address");
  }
  return {
    escrowId,
    nftItem: nftItem.toRawString(),
    seller: seller.toRawString(),
    productId,
    status,
    queryId,
    collection: collection.toRawString(),
    itemIndex,
    kind,
  };
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
        listing_enabled: Deno.env.get("MARKETPLACE_V2_LISTING_ENABLED") === "true",
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

      if (escrowId === 0n) {
        return jsonResponse({ success: true, registered: false, escrow_id: "0", listing_enabled: Deno.env.get("MARKETPLACE_V2_LISTING_ENABLED") === "true" });
      }

      const recordCell = await runGetMethodCell(
        escrow,
        "escrowRecordV2",
        [["num", `0x${escrowId.toString(16)}`]],
      );
      const record = parseEscrowRecord(recordCell);
      const hasExpectedFields =
        typeof body.product_id === "string" &&
        typeof body.wallet_address === "string" &&
        typeof body.item_address === "string" &&
        typeof body.collection_address === "string" &&
        typeof body.item_index === "string" &&
        typeof body.kind === "string";

      let matches = record.escrowId === escrowId && record.queryId === queryId;
      if (hasExpectedFields) {
        const kindMap: Record<string, number> = { username: 1, phone_number: 2, gift: 3 };
        matches = matches &&
          record.productId === BigInt(body.product_id) &&
          record.seller === Address.parse(body.wallet_address).toRawString() &&
          record.nftItem === Address.parse(body.item_address).toRawString() &&
          record.collection === Address.parse(body.collection_address).toRawString() &&
          record.itemIndex === BigInt(body.item_index) &&
          record.kind === kindMap[body.kind];
      }

      return jsonResponse({
        success: true,
        registered: matches && (record.status === 0 || record.status === 1),
        record_matches: matches,
        escrow_id: escrowId.toString(),
        record_status: record.status,
        listing_enabled: Deno.env.get("MARKETPLACE_V2_LISTING_ENABLED") === "true",
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
