import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { Address, Cell } from "npm:@ton/core";
import { Buffer } from "node:buffer";
import { authenticateVerifiedWallet } from "./shared/auth.ts";

const ALLOWED_ORIGINS = new Set(["https://ton-marketplace-cvj.pages.dev", "http://localhost:5173"]);
const TONCENTER_URL = "https://toncenter.com/api/v2/getTransactions";

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
  if (!/^\d+(?:\.\d{1,9})?$/.test(raw)) throw new Error("Invalid order amount");
  const [whole, fraction = ""] = raw.split(".");
  return BigInt(whole) * 1_000_000_000n + BigInt((fraction + "000000000").slice(0, 9));
}
function decodeComment(bodyBase64: string): string | null {
  try {
    const cells = Cell.fromBoc(Buffer.from(bodyBase64, "base64"));
    if (!cells.length) return null;
    const slice = cells[0].beginParse();
    if (slice.remainingBits < 32 || slice.loadUint(32) !== 0) return null;
    return slice.loadStringTail();
  } catch {
    return null;
  }
}
function hashHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (/^[0-9a-f]{64}$/i.test(value)) return value.toLowerCase();
  try {
    const decoded = Buffer.from(value, "base64");
    return decoded.length === 32 ? decoded.toString("hex") : null;
  } catch {
    return null;
  }
}
function html(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
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
    const apiKey = Deno.env.get("TONCENTER_API_KEY");
    if (!url || !secret || !apiKey) return reply({ success: false, error: "Payment verification is not configured" }, 503, origin);

    const body = await req.json();
    const orderId = typeof body?.order_id === "string" ? body.order_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return reply({ success: false, error: "Invalid order ID" }, 400, origin);

    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: order, error: orderError } = await admin.from("manual_product_orders")
      .select("id, order_no, product_id, buyer_user_id, buyer_wallet_raw, amount, currency, status, payment_tx_hash, payment_address, created_at, expires_at")
      .eq("id", orderId)
      .eq("buyer_user_id", wallet.userId)
      .eq("buyer_wallet_raw", wallet.walletAddress)
      .maybeSingle();
    if (orderError || !order) return reply({ success: false, error: "Order not found for this verified wallet" }, 404, origin);

    if (order.status === "payment_confirmed" || order.status === "delivery_pending" || order.status === "delivered") {
      return reply({ success: true, paymentVerified: true, orderNo: order.order_no, txHash: order.payment_tx_hash, alreadyVerified: true }, 200, origin);
    }
    if (order.status !== "awaiting_payment") return reply({ success: false, error: "This order is not awaiting payment" }, 409, origin);
    if (!order.payment_address || !order.expires_at) return reply({ success: false, error: "Order payment snapshot is incomplete" }, 409, origin);

    const createdAt = Date.parse(order.created_at);
    const expiresAt = Date.parse(order.expires_at);
    if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) return reply({ success: false, error: "Order payment timestamps are invalid" }, 409, origin);
    const orderExpired = Date.now() > expiresAt;

    const receiverRaw = Address.parse(order.payment_address).toRawString();
    const senderRaw = wallet.walletAddress;
    const expectedNano = toNano(order.amount);
    const transactions: Record<string, unknown>[] = [];
    let cursorLt = "";
    let cursorHash = "";
    let scanReachedOrderStart = false;
    let scanIntegrityValid = true;

    for (let page = 0; page < 5; page += 1) {
      const params = new URLSearchParams({ address: order.payment_address, limit: "100" });
      if (cursorLt && cursorHash) {
        params.set("lt", cursorLt);
        params.set("hash", cursorHash);
      }
      const response = await fetch(TONCENTER_URL + "?" + params.toString(), {
        headers: { Accept: "application/json", "X-API-Key": apiKey },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return reply({ success: false, error: "TON Mainnet transaction lookup is temporarily unavailable." }, 502, origin);
      const result = await response.json();
      if (result?.ok !== true || !Array.isArray(result?.result)) return reply({ success: false, error: "TON Mainnet returned an invalid transaction response." }, 502, origin);
      const rows = result.result as Record<string, unknown>[];
      if (!rows.length) { scanReachedOrderStart = true; break; }
      transactions.push(...rows);
      const oldest = rows[rows.length - 1];
      const timestamp = Number(oldest.utime) * 1000;
      if (!Number.isFinite(timestamp)) { scanIntegrityValid = false; break; }
      if (timestamp < createdAt - 120000) { scanReachedOrderStart = true; break; }
      const id = oldest.transaction_id as Record<string, unknown> | null;
      const nextLt = String(id?.lt ?? "");
      const nextHash = String(id?.hash ?? "");
      if (!nextLt || !nextHash || (nextLt === cursorLt && nextHash === cursorHash)) { scanIntegrityValid = false; break; }
      cursorLt = nextLt;
      cursorHash = nextHash;
    }

    let match: { hash: string; timestamp: number } | null = null;
    for (const tx of transactions) {
      const incoming = tx.in_msg as Record<string, unknown> | null;
      if (!incoming || incoming.bounced === true) continue;
      let destination: string;
      let source: string;
      try {
        destination = Address.parse(String(incoming.destination ?? "")).toRawString();
        source = Address.parse(String(incoming.source ?? "")).toRawString();
      } catch { continue; }
      if (destination !== receiverRaw || source !== senderRaw) continue;
      const value = String(incoming.value ?? "");
      if (!/^\d+$/.test(value) || BigInt(value) !== expectedNano) continue;
      const msgData = incoming.msg_data as Record<string, unknown> | null;
      const memo = typeof msgData?.body === "string" ? decodeComment(msgData.body) : null;
      if (memo !== order.order_no) continue;
      const timestamp = Number(tx.utime) * 1000;
      if (!Number.isFinite(timestamp) || timestamp < createdAt - 120000 || timestamp > expiresAt) continue;
      const description = tx.description as Record<string, unknown> | null;
      const compute = description?.compute_ph as Record<string, unknown> | null;
      const action = description?.action as Record<string, unknown> | null;
      if (description?.aborted === true || compute?.success === false || action?.success === false) continue;
      const hash = hashHex((tx.transaction_id as Record<string, unknown> | null)?.hash);
      if (!hash) continue;
      match = { hash, timestamp };
      break;
    }

    if (!match) {
      if (!scanReachedOrderStart || !scanIntegrityValid) {
        return reply({ success: false, code: "PAYMENT_HISTORY_INCOMPLETE", error: "The payment history scan did not cover the full order window. The reservation remains locked pending further verification." }, 503, origin);
      }
      if (orderExpired) {
        // A bounded transaction scan cannot prove that payment never arrived.
        // Keep the reservation locked until a trusted reconciliation worker
        // checks the full relevant chain history and resolves the order.
        return reply({ success: false, code: "ORDER_EXPIRED_REVIEW_REQUIRED", error: "The payment window has expired. Automatic cancellation is disabled until on-chain reconciliation completes. Contact support with the order number." }, 409, origin);
      }
      return reply({ success: false, code: "PAYMENT_NOT_FOUND", error: "No confirmed TON Mainnet transfer matching this wallet, exact amount and unique order memo was found yet. Wait for confirmation and retry." }, 409, origin);
    }

    const { data: duplicate, error: duplicateError } = await admin.from("manual_product_orders")
      .select("id")
      .eq("payment_tx_hash", match.hash)
      .maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate && duplicate.id !== order.id) return reply({ success: false, error: "This transaction has already been used for another order." }, 409, origin);

    const paidAt = new Date(match.timestamp).toISOString();
    const { data: updated, error: updateError } = await admin.from("manual_product_orders")
      .update({ status: "payment_confirmed", payment_tx_hash: match.hash, paid_at: paidAt, updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("buyer_user_id", wallet.userId)
      .eq("status", "awaiting_payment")
      .select("id, order_no, status")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) {
      const { data: current } = await admin.from("manual_product_orders").select("status, payment_tx_hash").eq("id", order.id).maybeSingle();
      if (!current || !["payment_confirmed", "delivery_pending", "delivered"].includes(current.status) || current.payment_tx_hash !== match.hash) {
        return reply({ success: false, code: "PAYMENT_STATE_CONFLICT", error: "Payment was found but the order changed concurrently. Contact support with the order number." }, 409, origin);
      }
    } else {
      const { error: logError } = await admin.from("manual_product_order_logs").insert({
        order_id: order.id,
        actor_id: wallet.userId,
        action: "payment_verified",
        old_status: "awaiting_payment",
        new_status: "payment_confirmed",
        note: "TON Mainnet payment automatically verified.",
        metadata: { transaction_hash: match.hash, chain_timestamp: paidAt },
      });
      if (logError) console.error("Manual product payment audit insert failed", logError.message);
    }

    const { data: productInfo } = await admin.from("products").select("name").eq("id", order.product_id).maybeSingle();
    let telegramNotified = false;
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const chatId = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID");
    if (botToken && chatId) {
      const message = [
        "✅ <b>商品订单链上收款已确认</b>",
        `订单：<code>${html(order.order_no)}</code>`,
        `商品：<b>${html(String(productInfo?.name ?? "商品"))}</b>`,
        `金额：<b>${html(String(order.amount))} ${html(order.currency)}</b>`,
        `付款钱包：<code>${html(senderRaw)}</code>`,
        `交易：<code>${html(match.hash)}</code>`,
        "状态：等待管理员人工交付",
      ].join("\n");
      try {
        const notify = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML", disable_web_page_preview: true }),
          signal: AbortSignal.timeout(10000),
        });
        const result = await notify.json();
        telegramNotified = notify.ok && result?.ok === true;
      } catch (error) { console.error("Manual product payment Telegram notification failed", error); }
    }

    return reply({ success: true, paymentVerified: true, orderNo: order.order_no, txHash: match.hash, telegramNotified }, 200, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to verify product payment";
    const status = /wallet|proof|authorization|session|identity/i.test(message) ? 401 : 500;
    console.error("verify-manual-product-payment failed", message);
    return reply({ success: false, error: status === 401 ? message : "Unable to verify product payment right now." }, status, origin);
  }
});
