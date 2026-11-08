import { Address } from "npm:@ton/core@0.63.1";
import { extractV3TestnetGetterStack } from "../_shared/marketplace-v3-testnet-getter.ts";

const ALLOWED_ORIGINS = new Set([
  "https://ton-marketplace-cvj.pages.dev",
  "http://localhost:5173",
]);
const GETTERS = new Set([
  "purchaseSchemaVersionV3",
  "nextOrderIdV3",
  "escrowConfiguredV2",
  "treasuryConfiguredV2",
  "marketplaceReserveCoordinatorConfiguredV3",
  "productStatusV2",
  "productEscrowIdV2",
  "productV2",
  "orderIdForProductV2",
  "marketplaceReserveStatusV3",
]);
const WITH_PRODUCT_ID = new Set([
  "productStatusV2",
  "productEscrowIdV2",
  "productV2",
  "orderIdForProductV2",
]);
const WITH_ORDER_ID = new Set(["marketplaceReserveStatusV3"]);
const MAX_UINT64 = 0xffff_ffff_ffff_ffffn;
const MAX_BODY_BYTES = 512;

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
    const lengthHeader = req.headers.get("content-length");
    if (lengthHeader && (!/^[0-9]+$/.test(lengthHeader) ||
        Number(lengthHeader) > MAX_BODY_BYTES)) {
      return reply(origin, 413, { success: false, error: "Request body too large" });
    }
    if (!req.body) return reply(origin, 400, { success: false, error: "Missing request body" });
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BODY_BYTES) {
          await reader.cancel();
          return reply(origin, 413, { success: false, error: "Request body too large" });
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const bodyText = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return reply(origin, 400, { success: false, error: "Invalid JSON body" });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return reply(origin, 400, { success: false, error: "Invalid JSON body" });
    }
    const input = body as Record<string, unknown>;
    if (typeof input.method !== "string" || !GETTERS.has(input.method)) {
      return reply(origin, 400, { success: false, error: "Unsupported read-only getter" });
    }
    if (Object.keys(input).some((key) => key !== "method" && key !== "product_id" && key !== "order_id")) {
      return reply(origin, 400, { success: false, error: "Unexpected request fields" });
    }
    const needsId = WITH_PRODUCT_ID.has(input.method);
    const needsOrderId = WITH_ORDER_ID.has(input.method);
    if (needsOrderId !== Object.hasOwn(input, "order_id") ||
        needsId !== Object.hasOwn(input, "product_id")) {
      return reply(origin, 400, { success: false, error: "Unexpected or missing product ID" });
    }
    let stack: Array<{ type: "num"; value: string }> = [];
    if (needsId || needsOrderId) {
      const identifier = needsOrderId ? input.order_id : input.product_id;
      if (typeof identifier !== "string" ||
          !/^[1-9][0-9]{0,19}$/.test(identifier) ||
          BigInt(identifier) > MAX_UINT64) {
        return reply(origin, 400, { success: false, error: "Invalid uint64 product ID" });
      }
      stack = [{ type: "num", value: identifier }];
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
    const upstreamLength = upstream.headers.get("content-length");
    if (upstreamLength && (!/^[0-9]+$/.test(upstreamLength) || Number(upstreamLength) > 32768)) {
      return reply(origin, 502, { success: false, error: "Testnet RPC response too large" });
    }
    if (!upstream.body) throw new Error("Missing Testnet RPC response");
    const upstreamReader = upstream.body.getReader();
    const upstreamChunks: Uint8Array[] = [];
    let upstreamBytes = 0;
    try {
      while (true) {
        const { done, value } = await upstreamReader.read();
        if (done) break;
        upstreamBytes += value.byteLength;
        if (upstreamBytes > 32768) {
          await upstreamReader.cancel();
          return reply(origin, 502, { success: false, error: "Testnet RPC response too large" });
        }
        upstreamChunks.push(value);
      }
    } finally {
      upstreamReader.releaseLock();
    }
    const upstreamBuffer = new Uint8Array(upstreamBytes);
    let upstreamOffset = 0;
    for (const chunk of upstreamChunks) {
      upstreamBuffer.set(chunk, upstreamOffset);
      upstreamOffset += chunk.byteLength;
    }
    const result: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(upstreamBuffer));
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
      order_id: needsOrderId ? input.order_id : null,
      stack: stackResult,
      observed_at: new Date().toISOString(),
      verified_purchase_eligibility: false,
      notice: "Read-only RPC result; this is not a purchase authorization or NFT custody attestation.",
    });
  } catch {
    return reply(origin, 502, {
      success: false,
      error: "Testnet RPC unavailable or returned invalid data",
    });
  }
});
