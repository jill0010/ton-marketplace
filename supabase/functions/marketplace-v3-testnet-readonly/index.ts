import { Address } from "npm:@ton/core@0.63.1";
import { extractV3TestnetGetterStack } from "../_shared/marketplace-v3-testnet-getter.ts";

const ALLOWED_ORIGINS = new Set([
  "https://ton-marketplace-cvj.pages.dev",
  "http://localhost:5173",
]);
const GETTERS = new Set([
  "purchaseSchemaVersionV3",
  "escrowConfiguredV2",
  "treasuryConfiguredV2",
  "marketplaceReserveCoordinatorConfiguredV3",
  "productStatusV2",
  "productEscrowIdV2",
  "productV2",
  "orderIdForProductV2",
]);
const WITH_PRODUCT_ID = new Set([
  "productStatusV2",
  "productEscrowIdV2",
  "productV2",
  "orderIdForProductV2",
]);
const MAX_UINT64 = 0xffff_ffff_ffff_ffffn;

function headers(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}
function reply(origin: string, status: number, data: Record<string, unknown>): Response {
  return Response.json(data, { status, headers: headers(origin) });
}

/**
 * Read-only TON Testnet getter proxy. Does not claim that returned stack
 * entries establish ownership, payment, or purchase eligibility.
 * No credentials, signing, database writes or transactions are used.
 */
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) return new Response("Forbidden", { status: 403 });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(origin) });
  if (req.method !== "POST") return reply(origin, 405, { success: false, error: "Method not allowed" });

  try {
    const configured = Deno.env.get("V3_PRODUCTION_TESTNET_MARKETPLACE_ADDRESS");
    const apiKey = Deno.env.get("TONCENTER_TESTNET_API_KEY");
    if (!configured || !apiKey) {
      return reply(origin, 503, { success: false, error: "V3 Testnet RPC is not configured" });
    }
    const marketplace = Address.parse(configured);
    if (marketplace.workChain !== 0) throw new Error("Invalid configured Testnet contract");
    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return reply(origin, 400, { success: false, error: "Invalid JSON body" });
    }
    const input = body as Record<string, unknown>;
    if (typeof input.method !== "string" || !GETTERS.has(input.method)) {
      return reply(origin, 400, { success: false, error: "Unsupported read-only getter" });
    }
    const needsId = WITH_PRODUCT_ID.has(input.method);
    if (needsId !== Object.hasOwn(input, "product_id")) {
      return reply(origin, 400, { success: false, error: "Unexpected or missing product ID" });
    }
    let stack: Array<{ type: "num"; value: string }> = [];
    if (needsId) {
      if (typeof input.product_id !== "string" ||
          !/^[1-9][0-9]{0,19}$/.test(input.product_id) ||
          BigInt(input.product_id) > MAX_UINT64) {
        return reply(origin, 400, { success: false, error: "Invalid uint64 product ID" });
      }
      stack = [{ type: "num", value: input.product_id }];
    }
    const upstream = await fetch("https://testnet.toncenter.com/api/v3/runGetMethod", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        address: marketplace.toRawString(),
        method: input.method,
        stack,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) {
      return reply(origin, 502, { success: false, error: `Testnet RPC HTTP ${upstream.status}` });
    }
    const result: unknown = await upstream.json();
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new Error("Invalid Testnet RPC response");
    }
    const payload = result as Record<string, unknown>;
    const stackResult = extractV3TestnetGetterStack(payload);
    return reply(origin, 200, {
      success: true,
      network: "testnet",
      contract_address: marketplace.toRawString(),
      method: input.method,
      product_id: needsId ? input.product_id : null,
      stack: stackResult,
      observed_at: new Date().toISOString(),
      verified_purchase_eligibility: false,
      notice: "Read-only RPC result; this is not a purchase authorization or NFT custody attestation.",
    });
  } catch (error) {
    return reply(origin, 502, {
      success: false,
      error: error instanceof Error ? error.message : "Testnet RPC unavailable",
    });
  }
});
