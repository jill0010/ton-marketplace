import { createClient } from "@supabase/supabase-js";
import { authenticateVerifiedWallet } from "./shared/auth.ts";
import { handleCors } from "./shared/http.ts";

const ALLOWED_ORIGINS = [
  "https://ton-marketplace-cvj.pages.dev",
  "http://localhost:5173",
];

function allowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin) ||
    /^https:\/\/[a-z0-9-]+\.ton-marketplace-cvj\.pages\.dev$/.test(origin);
}

function json(data: Record<string, unknown>, status: number, origin: string): Response {
  return Response.json(data, {
    status,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Vary": "Origin",
      "Cache-Control": "no-store",
    },
  });
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") ?? "";
  if (!allowedOrigin(origin)) return new Response("Forbidden", { status: 403 });

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Vary": "Origin",
      },
    });
  }

  if (request.method !== "GET") {
    return json({ success: false, error: "Method not allowed" }, 405, origin);
  }

  try {
    const wallet = await authenticateVerifiedWallet(request);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ success: false, error: "Order history is not configured" }, 503, origin);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const [buyerResult, sellerResult] = await Promise.all([
      admin.from("marketplace_orders")
        .select("id, chain_order_id, product_id, escrow_id, buyer_wallet_raw, seller_wallet_raw, nft_item_raw, gross_nano, platform_fee_nano, seller_proceeds_nano, status, delivery_status, seller_payout_status, platform_payout_status, buyer_refund_status, payment_tx_hash, delivery_tx_hash, created_at, updated_at")
        .eq("buyer_wallet_raw", wallet.walletAddress)
        .order("created_at", { ascending: false })
        .limit(50),
      admin.from("marketplace_orders")
        .select("id, chain_order_id, product_id, escrow_id, buyer_wallet_raw, seller_wallet_raw, nft_item_raw, gross_nano, platform_fee_nano, seller_proceeds_nano, status, delivery_status, seller_payout_status, platform_payout_status, buyer_refund_status, payment_tx_hash, delivery_tx_hash, created_at, updated_at")
        .eq("seller_wallet_raw", wallet.walletAddress)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (buyerResult.error || sellerResult.error) {
      console.error("Marketplace order history query failed", buyerResult.error?.message, sellerResult.error?.message);
      return json({ success: false, error: "Unable to load marketplace order history" }, 500, origin);
    }

    const orderMap = new Map<string, Record<string, unknown>>();
    for (const row of [...(buyerResult.data ?? []), ...(sellerResult.data ?? [])]) {
      orderMap.set(row.id, row as Record<string, unknown>);
    }

    const orders = [...orderMap.values()]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 50);

    const ids = orders.map((order) => String(order.id));
    let payouts: Record<string, unknown>[] = [];
    if (ids.length > 0) {
      const payoutResult = await admin.from("marketplace_payouts")
        .select("order_id, payout_kind, amount_nano, beneficiary_wallet_raw, status, dispatch_tx_hash, recipient_tx_hash, finalized_at")
        .in("order_id", ids);
      if (payoutResult.error) {
        console.error("Marketplace payout history query failed", payoutResult.error.message);
        return json({ success: false, error: "Unable to load marketplace settlement history" }, 500, origin);
      }
      payouts = (payoutResult.data ?? []) as Record<string, unknown>[];
    }

    return json({
      success: true,
      wallet: wallet.walletAddress,
      orders,
      payouts,
      dataSource: "database_mirror",
      chainIsAuthoritative: false,
    }, 200, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = /authorization|session|wallet|proof|identity/i.test(message) ? 401 : 500;
    return json({ success: false, error: status === 401 ? message : "Unable to load marketplace order history" }, status, origin);
  }
});
