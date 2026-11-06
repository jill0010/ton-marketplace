import { Address } from "npm:@ton/core";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { calculateMarketplaceProcessingReserve } from "../_shared/marketplace-processing-reserve.js";

const ADMIN_UID = "0744f173-3f36-438f-b265-9cb3be95ad78";
const ALLOWED_ORIGINS = new Set([
  "https://ton-marketplace-cvj.pages.dev",
  "http://localhost:5173",
]);
const TONCENTER_TRACES_URL = "https://toncenter.com/api/v3/traces";
const FIXED_RESERVE_NANO = "200000000";

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

function rawAddress(value: string, label: string): string {
  try {
    return Address.parse(value).toRawString().toLowerCase();
  } catch {
    throw new Error(`Invalid ${label} address in order snapshot`);
  }
}

async function fetchTrace(paymentTxHash: string) {
  const apiKey = Deno.env.get("TONCENTER_API_KEY");
  if (!apiKey) throw new Error("TONCENTER server configuration unavailable");
  const url = new URL(TONCENTER_TRACES_URL);
  url.searchParams.set("tx_hash", paymentTxHash);
  url.searchParams.set("limit", "2");
  url.searchParams.set("include_actions", "true");
  const response = await fetch(url, {
    headers: { "Accept": "application/json", "X-API-Key": apiKey },
  });
  if (!response.ok) throw new Error(`TONCENTER trace lookup failed (${response.status})`);
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.traces) || payload.traces.length !== 1) {
    throw new Error("TONCENTER did not return exactly one payment trace");
  }
  return payload.traces[0];
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
    if (!url || !publishable || !secret) {
      return reply({ success: false, error: "Service unavailable" }, 503, origin);
    }

    const auth = createClient(url, publishable, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await auth.auth.getUser(token);
    if (authError || authData.user?.id !== ADMIN_UID || authData.user.is_anonymous === true) {
      return reply({ success: false, error: "Administrator access required" }, 403, origin);
    }

    const body = await req.json().catch(() => ({}));
    if (!body || typeof body.order_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.order_id)) {
      return reply({ success: false, error: "A valid order_id is required" }, 400, origin);
    }

    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: order, error: orderError } = await admin.from("marketplace_orders")
      .select("id, chain_order_id, buyer_wallet_raw, seller_wallet_raw, treasury_wallet_raw, nft_item_raw, processing_reserve_nano, payment_tx_hash")
      .eq("id", body.order_id)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return reply({ success: false, error: "Order not found" }, 404, origin);
    if (String(order.processing_reserve_nano) !== FIXED_RESERVE_NANO) {
      return reply({ success: false, error: "Order reserve does not match the V2 fixed reserve; manual review required" }, 409, origin);
    }
    if (typeof order.payment_tx_hash !== "string" || !/^[0-9a-f]{64}$/i.test(order.payment_tx_hash)) {
      return reply({ success: false, error: "Payment transaction hash is not available; reconciliation cannot proceed" }, 409, origin);
    }

    const marketplaceAddress = Deno.env.get("MARKETPLACE_V2_ADDRESS");
    const escrowAddress = Deno.env.get("NFT_ESCROW_V2_ADDRESS");
    if (!marketplaceAddress || !escrowAddress) {
      return reply({ success: false, error: "Marketplace V2 addresses are not configured" }, 503, origin);
    }

    const trace = await fetchTrace(order.payment_tx_hash);
    const transactionMap = trace.transactions as Record<string, Record<string, unknown>> | undefined;
    const transactions = transactionMap && typeof transactionMap === "object"
      ? Object.fromEntries(Object.entries(transactionMap).map(([hash, tx]) => {
        const account = tx.account;
        return [
          hash,
          {
            ...tx,
            account: typeof account === "string" ? rawAddress(account, "transaction") : account,
          },
        ];
      }))
      : trace.transactions;
    const normalizedTrace = { ...trace, transactions };

    const reconciliation = calculateMarketplaceProcessingReserve(normalizedTrace, {
      rootTransactionHash: order.payment_tx_hash,
      reserveNano: FIXED_RESERVE_NANO,
      marketplaceAddress: rawAddress(marketplaceAddress, "Marketplace V2"),
      escrowAddress: rawAddress(escrowAddress, "NFT Escrow V2"),
      nftItemAddress: rawAddress(order.nft_item_raw, "NFT Item"),
      buyerAddress: rawAddress(order.buyer_wallet_raw, "buyer"),
      sellerAddress: rawAddress(order.seller_wallet_raw, "seller"),
      treasuryAddress: rawAddress(order.treasury_wallet_raw, "treasury"),
    });

    return reply({
      success: true,
      order_id: order.id,
      chain_order_id: String(order.chain_order_id),
      reconciliation,
      notice: "Read-only preview only. No refund is authorized, signed, or broadcast. Verify the final on-chain order state before any refund.",
    }, 200, origin);
  } catch (error) {
    console.error("admin-preview-marketplace-processing-reserve failed", error);
    return reply({
      success: false,
      error: error instanceof Error ? error.message : "Unable to reconcile processing reserve",
    }, 503, origin);
  }
});
