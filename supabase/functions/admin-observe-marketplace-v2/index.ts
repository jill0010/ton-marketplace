import { Address } from "npm:@ton/core@0.63.1";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { observeMarketplaceV2Buys } from "../_shared/marketplace-v2-chain-observation.ts";
import {
  buildMarketplaceV2TransactionsUrl,
  parseMarketplaceV2IndexerPageRequest,
} from "../_shared/marketplace-v2-indexer-request.ts";

const ADMIN_UID = "0744f173-3f36-438f-b265-9cb3be95ad78";
const ALLOWED_ORIGINS = new Set([
  "https://ton-marketplace-cvj.pages.dev",
  "http://localhost:5173",
]);

function cors(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}

function reply(data: Record<string, unknown>, status: number, origin: string) {
  return Response.json(data, { status, headers: cors(origin) });
}

function serviceKey(): string | undefined {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return typeof keys.default === "string" ? keys.default : undefined;
  } catch {
    return undefined;
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) return new Response("Forbidden", { status: 403 });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply({ success: false, error: "Method not allowed" }, 405, origin);

  try {
    const token = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return reply({ success: false, error: "Authentication required" }, 401, origin);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publishable = Deno.env.get("SUPABASE_ANON_KEY") ??
      JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default;
    const secret = serviceKey();
    const apiKey = Deno.env.get("TONCENTER_API_KEY");
    if (!supabaseUrl || !publishable || !secret || !apiKey) {
      return reply({ success: false, error: "Server configuration unavailable" }, 503, origin);
    }

    const auth = createClient(supabaseUrl, publishable, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await auth.auth.getUser(token);
    if (authError || authData.user?.id !== ADMIN_UID || authData.user.is_anonymous === true) {
      return reply({ success: false, error: "Administrator access required" }, 403, origin);
    }

    const request = parseMarketplaceV2IndexerPageRequest(await req.json().catch(() => null));
    const configuredAddress = Deno.env.get("MARKETPLACE_V2_ADDRESS");
    if (!configuredAddress) return reply({ success: false, error: "Marketplace V2 address is not configured" }, 503, origin);
    let marketplaceAddress: string;
    try {
      marketplaceAddress = Address.parse(configuredAddress).toRawString().toLowerCase();
    } catch {
      return reply({ success: false, error: "Marketplace V2 address configuration is invalid" }, 503, origin);
    }
    const requestedAddress = Address.parse(request.account).toRawString().toLowerCase();
    if (requestedAddress !== marketplaceAddress) {
      return reply({ success: false, error: "Requested account does not match the configured Marketplace V2 contract" }, 400, origin);
    }

    const url = buildMarketplaceV2TransactionsUrl(request, marketplaceAddress);
    const response = await fetch(url, {
      headers: { "Accept": "application/json", "X-API-Key": apiKey },
    });
    if (!response.ok) {
      return reply({ success: false, error: `TON Center lookup failed (${response.status})` }, 502, origin);
    }
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.transactions)) {
      return reply({ success: false, error: "TON Center returned an invalid transaction page" }, 502, origin);
    }
    const observations = observeMarketplaceV2Buys(payload.transactions, marketplaceAddress);
    const lastLt = payload.transactions.length > 0
      ? payload.transactions[payload.transactions.length - 1]?.lt
      : null;

    return reply({
      success: true,
      network: "mainnet",
      account: marketplaceAddress,
      page: {
        limit: request.limit,
        offset: request.offset,
        start_lt: request.startLt ?? null,
        returned_transactions: payload.transactions.length,
        next_offset: request.offset + payload.transactions.length,
        last_lt: typeof lastLt === "string" && /^(0|[1-9][0-9]*)$/.test(lastLt) ? lastLt : null,
      },
      candidate_purchases: observations,
      candidate_count: observations.length,
      persisted: false,
      notice: "Read-only chain observation. No database writes, order creation, signing, or transactions are performed. Parent transaction hashes are not assumed to be buyer wallet root transactions.",
    }, 200, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to inspect Marketplace V2 transactions";
    return reply({ success: false, error: message }, 400, origin);
  }
});
