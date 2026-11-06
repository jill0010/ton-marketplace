import { createClient } from "npm:@supabase/supabase-js@2.118.0";

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
function serviceKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return typeof keys.default === "string" ? keys.default : undefined;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) return new Response("Forbidden", { status: 403 });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply({ success: false, error: "Method not allowed" }, 405, origin);

  try {
    const token = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return reply({ success: false, error: "Authentication required" }, 401, origin);
    const url = Deno.env.get("SUPABASE_URL");
    const publishable = Deno.env.get("SUPABASE_ANON_KEY") ??
      JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default;
    const secret = serviceKey();
    if (!url || !publishable || !secret) return reply({ success: false, error: "Service unavailable" }, 503, origin);

    const auth = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await auth.auth.getUser(token);
    if (authError || authData.user?.id !== ADMIN_UID || authData.user.is_anonymous === true) {
      return reply({ success: false, error: "Administrator access required" }, 403, origin);
    }

    const body = await req.json().catch(() => ({}));
    const status = typeof body?.status === "string" ? body.status : "all";
    const allowedStatuses = new Set([
      "all", "payment_confirmed", "delivery_pending", "delivery_confirmed",
      "settlement_pending", "payouts_dispatched", "refund_pending",
      "refund_dispatched", "manual_review", "completed", "refunded",
    ]);
    if (!allowedStatuses.has(status)) return reply({ success: false, error: "Invalid order status filter" }, 400, origin);
    const requestedLimit = Number(body?.limit ?? 100);
    const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 200)) : 100;

    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    let orderQuery = admin.from("marketplace_orders")
      .select("id, chain_order_id, product_id, escrow_id, buyer_wallet_raw, seller_wallet_raw, treasury_wallet_raw, nft_item_raw, collection_raw, gross_nano, fee_bps, platform_fee_nano, seller_proceeds_nano, processing_reserve_nano, status, delivery_status, seller_payout_status, platform_payout_status, buyer_refund_status, payment_tx_hash, delivery_tx_hash, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status !== "all") orderQuery = orderQuery.eq("status", status);

    const { data: orders, error: orderError } = await orderQuery;
    if (orderError) throw orderError;
    const rows = orders ?? [];
    const ids = rows.map((row) => row.id);

    if (!ids.length) return reply({ success: true, orders: [], payouts: [], events: [], observations: [] }, 200, origin);

    const [payoutResult, eventResult, observationResult] = await Promise.all([
      admin.from("marketplace_payouts")
        .select("id, order_id, payout_kind, operation_id, query_id, beneficiary_wallet_raw, amount_nano, status, dispatch_tx_hash, recipient_tx_hash, finalized_at, created_at")
        .in("order_id", ids),
      admin.from("marketplace_order_events")
        .select("id, order_id, event_type, event_key, details, created_at")
        .in("order_id", ids)
        .order("created_at", { ascending: false }),
      admin.from("marketplace_chain_observations")
        .select("id, order_id, observation_kind, transaction_hash, message_hash, account_raw, query_id, success, finalized, block_seqno, observed_at")
        .in("order_id", ids)
        .order("observed_at", { ascending: false }),
    ]);
    if (payoutResult.error || eventResult.error || observationResult.error) {
      throw payoutResult.error ?? eventResult.error ?? observationResult.error;
    }

    return reply({
      success: true,
      orders: rows,
      payouts: payoutResult.data ?? [],
      events: eventResult.data ?? [],
      observations: observationResult.data ?? [],
      dataSource: "database_mirror",
      chainIsAuthoritative: false,
    }, 200, origin);
  } catch (error) {
    console.error("admin-marketplace-orders failed", error);
    return reply({ success: false, error: "Unable to load marketplace escrow orders." }, 500, origin);
  }
});
