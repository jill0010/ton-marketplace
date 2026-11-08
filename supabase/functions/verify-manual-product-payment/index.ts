import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { Address, Cell } from "npm:@ton/core";
import { Buffer } from "node:buffer";
import { authenticateVerifiedWallet } from "./shared/auth.ts";
import { isOrderOwnedByVerifiedWallet } from "./shared/order-identity.ts";

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
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) return reply({ success: false, error: "Invalid order ID" }, 400, origin);

    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: order, error: orderError } = await admin.from("manual_product_orders")
      .select("id, order_no, product_id, buyer_user_id, buyer_wallet_raw, amount, currency, status, payment_tx_hash, payment_address, created_at, expires_at")
      .eq("id", orderId)
      .eq("buyer_user_id", wallet.userId)
      .eq("buyer_wallet_raw", wallet.walletAddress)
      .maybeSingle();
    if (orderError || !order || !isOrderOwnedByVerifiedWallet(order, wallet)) return reply({ success: false, error: "Order not found for this verified wallet" }, 404, origin);

    if (order.status === "payment_confirmed" || order.status === "delivery_pending" || order.status === "delivered") {
      if (typeof order.payment_tx_hash !== "string" || !/^[0-9a-f]{64}$/i.test(order.payment_tx_hash)) {
        return reply({ success: false, code: "PAYMENT_EVIDENCE_MISSING", error: "This order is marked paid but has no valid on-chain transaction hash. Contact support for manual reconciliation." }, 409, origin);
      }
      return reply({ success: true, paymentVerified: true, orderNo: order.order_no, txHash: order.payment_tx_hash, alreadyVerified: true }, 200, origin);
    }
    if (order.status !== "awaiting_payment") return reply({ success: false, error: "This order is not awaiting payment" }, 409, origin);
    if (!order.payment_address || !order.expires_at) return reply({ success: false, error: "Order payment snapshot is incomplete" }, 409, origin);

    const createdAt = Date.parse(order.created_at);
    const expiresAt = Date.parse(order.expires_at);
    if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || expiresAt <= createdAt || createdAt > Date.now() + 120000) {
      return reply({ success: false, code: "INVALID_PAYMENT_WINDOW", error: "Order payment timestamps are inconsistent. Contact support for manual reconciliation." }, 409, origin);
    }
    const orderExpired = Date.now() > expiresAt;

    const receiverRaw = Address.parse(order.payment_address).toRawString();
    const senderRaw = wallet.walletAddress;
    const expectedNano = toNano(order.amount);
    const transactions: Record<string, unknown>[] = [];
    let cursorLt = "";
    let cursorHash = "";
    let scanReachedOrderStart = false;
    let scanIntegrityValid = true;
    const seenTransactionIds = new Set<string>();
    let previousPageOldestUtime = Number.POSITIVE_INFINITY;

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
      // Toncenter pages must be newest-first. A malformed or out-of-order page
      // must not be treated as complete evidence of payment history.
      let previousUtime = Number.POSITIVE_INFINITY;
      for (const tx of rows) {
        const utime = Number(tx.utime);
        if (!Number.isSafeInteger(utime) || utime <= 0 || utime > previousUtime) {
          scanIntegrityValid = false;
          break;
        }
        previousUtime = utime;
        const transactionId = tx.transaction_id as Record<string, unknown> | null;
        const lt = String(transactionId?.lt ?? "");
        const hash = hashHex(transactionId?.hash);
        if (!/^\\d+$/.test(lt) || !hash) {
          scanIntegrityValid = false;
          break;
        }
        const uniqueId = lt + ":" + hash;
        if (seenTransactionIds.has(uniqueId)) {
          scanIntegrityValid = false;
          break;
        }
        seenTransactionIds.add(uniqueId);
      }
      if (!scanIntegrityValid || Number(rows[0].utime) > previousPageOldestUtime) {
        scanIntegrityValid = false;
        break;
      }
      previousPageOldestUtime = Number(rows[rows.length - 1].utime);
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

    // Reject incomplete or inconsistent history even if a candidate payment
    // appeared earlier: confirmation must be based on a trustworthy scan.
    if (!scanIntegrityValid || !scanReachedOrderStart) {
      return reply({ success: false, code: "PAYMENT_HISTORY_INCOMPLETE", error: "Transaction history did not safely cover the full order window. Payment confirmation is paused pending reconciliation." }, 503, origin);
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

    const paidAt = new Date(match.timestamp).toISOString();
    const { data: confirmation, error: confirmationError } = await admin.rpc(
      "confirm_manual_product_payment_verified",
      {
        p_order_id: order.id,
        p_buyer_user_id: wallet.userId,
        p_transaction_hash: match.hash,
        p_paid_at: paidAt,
      },
    );
    if (confirmationError?.code === "23505") {
      return reply({ success: false, code: "PAYMENT_ALREADY_CLAIMED", error: "This on-chain transaction has already been claimed by another order. Contact support with the order number." }, 409, origin);
    }
    if (confirmationError) throw confirmationError;
    if (confirmation === "PAYMENT_ALREADY_CLAIMED" || confirmation === "PAYMENT_STATE_CONFLICT" || confirmation === "ORDER_NOT_FOUND") {
      return reply({ success: false, code: confirmation, error: "Payment verification requires manual review due to an order state conflict." }, 409, origin);
    }
    if (confirmation !== "CONFIRMED" && confirmation !== "ALREADY_CONFIRMED") {
      throw new Error("Unexpected atomic payment confirmation result");
    }
    if (confirmation === "ALREADY_CONFIRMED") {
      return reply({ success: true, paymentVerified: true, orderNo: order.order_no, txHash: match.hash, alreadyVerified: true }, 200, origin);
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
