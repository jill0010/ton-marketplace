import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { Address } from "npm:@ton/core";
import { authenticateVerifiedWallet } from "./shared/auth.ts";

const ALLOWED_ORIGINS = new Set([
  "https://ton-marketplace-cvj.pages.dev",
  "http://localhost:5173",
]);
function allowedOrigin(origin: string) {
  return ALLOWED_ORIGINS.has(origin) || /^https:\/\/[a-z0-9-]+\.ton-marketplace-cvj\.pages\.dev$/.test(origin);
}
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
function toNano(value: string | number) {
  const raw = String(value);
  if (!/^\d+(?:\.\d{1,9})?$/.test(raw)) throw new Error("Product price has invalid precision");
  const [whole, fraction = ""] = raw.split(".");
  return (BigInt(whole) * 1_000_000_000n + BigInt((fraction + "000000000").slice(0, 9))).toString();
}
function createOrderNo() {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  const suffix = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase();
  return "MP" + Date.now().toString(36).toUpperCase() + suffix;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (!allowedOrigin(origin)) return new Response("Forbidden", { status: 403 });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply({ success: false, error: "Method not allowed" }, 405, origin);

  try {
    const wallet = await authenticateVerifiedWallet(req);
    const url = Deno.env.get("SUPABASE_URL");
    const secret = serviceKey();
    if (!url || !secret) return reply({ success: false, error: "Order service unavailable" }, 503, origin);

    const body = await req.json();
    const productId = typeof body?.product_id === "string" ? body.product_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(productId)) return reply({ success: false, error: "Invalid product ID" }, 400, origin);

    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const [{ data: product, error: productError }, { data: settings, error: settingsError }] = await Promise.all([
      admin.from("products")
        .select("id, name, price, currency, status, delivery_mode, listing_kind")
        .eq("id", productId)
        .maybeSingle(),
      admin.from("marketplace_wallet_settings")
        .select("custody_wallet_address")
        .eq("id", 1)
        .maybeSingle(),
    ]);
    if (productError) throw productError;
    if (settingsError) throw settingsError;
    if (!product || product.status !== "listed" || product.delivery_mode !== "manual" || product.listing_kind !== "fixed_price") {
      return reply({ success: false, error: "This product is not available for manual checkout." }, 409, origin);
    }
    if (product.currency !== "TON" && product.currency !== "GRAM") {
      return reply({ success: false, error: "Unsupported product currency." }, 409, origin);
    }

    const paymentAddress = typeof settings?.custody_wallet_address === "string" ? settings.custody_wallet_address.trim() : "";
    if (!paymentAddress) {
      return reply({ success: false, code: "PAYMENT_WALLET_NOT_CONFIGURED", error: "Marketplace custody wallet has not been configured by the administrator." }, 503, origin);
    }
    try {
      if (Address.parse(paymentAddress).workChain !== 0) throw new Error("Invalid workchain");
    } catch {
      return reply({ success: false, error: "Marketplace custody wallet configuration is invalid." }, 503, origin);
    }

    const amount = Number(product.price);
    if (!Number.isFinite(amount) || amount <= 0) return reply({ success: false, error: "Product price is invalid." }, 409, origin);
    const amountNano = toNano(product.price as string | number);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

    const orderNo = createOrderNo();
    const { data: order, error: insertError } = await admin.from("manual_product_orders").insert({
      order_no: orderNo,
      product_id: product.id,
      buyer_wallet_raw: wallet.walletAddress,
      buyer_user_id: wallet.userId,
      amount,
      currency: product.currency,
      status: "awaiting_payment",
      payment_address: paymentAddress,
      expires_at: expiresAt,
    }).select("id, order_no").single();
    if (insertError) {
      if (insertError.code === "23505") {
        const { data: existing } = await admin.from("manual_product_orders")
          .select("id, order_no, amount, currency, status, payment_address, expires_at")
          .eq("product_id", product.id)
          .eq("buyer_user_id", wallet.userId)
          .in("status", ["awaiting_payment", "payment_confirmed", "delivery_pending"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existing?.status === "awaiting_payment" && existing.payment_address && existing.expires_at) {
          return reply({
            success: true,
            orderId: existing.id,
            orderNo: existing.order_no,
            amount: String(existing.amount),
            amountNano: toNano(existing.amount),
            currency: existing.currency,
            paymentAddress: existing.payment_address,
            expiresAt: existing.expires_at,
            memo: existing.order_no,
            resumed: true,
          }, 200, origin);
        }
        return reply({ success: false, code: "PRODUCT_CHECKOUT_BUSY", error: existing ? "This product already has an order in progress." : "This product already has an active order from another buyer." }, 409, origin);
      }
      throw insertError;
    }

    const { error: logError } = await admin.from("manual_product_order_logs").insert({
      order_id: order.id,
      actor_id: wallet.userId,
      action: "order_created",
      old_status: null,
      new_status: "awaiting_payment",
      note: "Buyer created a manual product checkout.",
      metadata: { product_name: product.name, currency: product.currency, amount: String(product.price) },
    });
    if (logError) console.error("Manual product order audit insert failed", logError.message);

    return reply({
      success: true,
      orderId: order.id,
      orderNo: order.order_no,
      amount: String(product.price),
      amountNano,
      currency: product.currency,
      paymentAddress,
      expiresAt,
      memo: order.order_no,
    }, 200, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create manual product order";
    const status = /wallet|proof|authorization|session|identity/i.test(message) ? 401 : 500;
    console.error("create-manual-product-order failed", message);
    return reply({ success: false, error: status === 401 ? message : "Unable to create product order right now." }, status, origin);
  }
});
