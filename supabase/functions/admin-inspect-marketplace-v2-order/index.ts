import { Address } from "npm:@ton/core@0.63.1";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { decodeMarketplaceV2OrderCell } from "../_shared/marketplace-v2-order-cell.ts";
import {
  buildOrderCellRunGetMethodRequest,
  extractOrderCellBoc,
  parseMarketplaceV2OrderId,
} from "../_shared/marketplace-v2-order-get-method.ts";

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
    const token = (req.headers.get("authorization") ?? "").match(/^Bearer\\s+(.+)$/i)?.[1];
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

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return reply({ success: false, error: "A JSON object with order_id is required" }, 400, origin);
    }
    const orderId = parseMarketplaceV2OrderId((body as Record<string, unknown>).order_id);
    const configured = Deno.env.get("MARKETPLACE_V2_ADDRESS");
    if (!configured) return reply({ success: false, error: "Marketplace V2 address is not configured" }, 503, origin);
    const address = Address.parse(configured).toRawString().toLowerCase();
    const requestBody = buildOrderCellRunGetMethodRequest(address, orderId);
    const response = await fetch("https://toncenter.com/api/v3/runGetMethod", {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
      return reply({ success: false, error: `TON Center get-method failed (${response.status})` }, 502, origin);
    }
    const payload = await response.json();
    const boc = extractOrderCellBoc(payload);
    const order = decodeMarketplaceV2OrderCell(boc);
    if (order.id !== orderId) {
      return reply({ success: false, error: "Decoded order id does not match the requested order id" }, 502, origin);
    }

    return reply({
      success: true,
      network: "mainnet",
      contract_address: address,
      order,
      persisted: false,
      notice: "Read-only live get-method inspection. No database writes, signing, or transactions are performed. This endpoint requires the current Marketplace V2 contract with the orderCellV2 getter deployed.",
    }, 200, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to inspect Marketplace V2 order";
    return reply({ success: false, error: message }, 400, origin);
  }
});
