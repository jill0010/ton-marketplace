import { Address } from "npm:@ton/core@0.63.1";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import {
  buildTransactionsByMessageUrl,
  resolveBuyerWalletRootTransaction,
} from "../_shared/marketplace-v2-parent-transaction.ts";

const ADMIN_UID = "0744f173-3f36-438f-b265-9cb3be95ad78";
const ALLOWED_ORIGINS = new Set([
  "https://ton-marketplace-cvj.pages.dev",
  "http://localhost:5173",
]);

function headers(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}
function reply(data: Record<string, unknown>, status: number, origin: string) {
  return Response.json(data, { status, headers: headers(origin) });
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) return new Response("Forbidden", { status: 403 });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(origin) });
  if (req.method !== "POST") return reply({ success: false, error: "Method not allowed" }, 405, origin);

  try {
    const token = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return reply({ success: false, error: "Authentication required" }, 401, origin);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    let publishable = Deno.env.get("SUPABASE_ANON_KEY");
    if (!publishable) {
      try {
        const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
        publishable = typeof keys.default === "string" ? keys.default : undefined;
      } catch { publishable = undefined; }
    }
    const apiKey = Deno.env.get("TONCENTER_API_KEY");
    if (!supabaseUrl || !publishable || !apiKey) {
      return reply({ success: false, error: "Server configuration unavailable" }, 503, origin);
    }
    const auth = createClient(supabaseUrl, publishable, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await auth.auth.getUser(token);
    if (error || data.user?.id !== ADMIN_UID || data.user.is_anonymous === true) {
      return reply({ success: false, error: "Administrator access required" }, 403, origin);
    }

    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      typeof body.message_hash !== "string" || typeof body.buyer_address !== "string" ||
      body.message_hash.length > 128 || body.buyer_address.length > 128) {
      return reply({ success: false, error: "message_hash and buyer_address are required" }, 400, origin);
    }
    const configuredAddress = Deno.env.get("MARKETPLACE_V2_ADDRESS");
    if (!configuredAddress) return reply({ success: false, error: "Marketplace V2 address is not configured" }, 503, origin);
    const marketplace = Address.parse(configuredAddress).toRawString().toLowerCase();
    const buyer = Address.parse(body.buyer_address).toRawString().toLowerCase();
    const url = buildTransactionsByMessageUrl(body.message_hash);
    const response = await fetch(url, { headers: { "Accept": "application/json", "X-API-Key": apiKey } });
    if (!response.ok) return reply({ success: false, error: `TON Center lookup failed (${response.status})` }, 502, origin);
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.transactions)) {
      return reply({ success: false, error: "TON Center returned an invalid message lookup" }, 502, origin);
    }
    const resolution = resolveBuyerWalletRootTransaction(payload.transactions, {
      messageHash: body.message_hash,
      buyerAddress: buyer,
      marketplaceAddress: marketplace,
    });
    return reply({
      success: true,
      resolution,
      persisted: false,
      notice: "Read-only verification. The root transaction is accepted only when exactly one finalized buyer-wallet transaction contains the exact outbound message to the configured Marketplace V2 contract. No database writes or transactions are performed.",
    }, 200, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to resolve buyer wallet transaction";
    return reply({ success: false, error: message }, 400, origin);
  }
});
