import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { Address, Cell } from "npm:@ton/core@0.63.1";
import { Buffer } from "node:buffer";

const RECEIVER_FRIENDLY = "UQBLw8lmwDXPdZXudHrTPpLAfHQW5N55aQgBuH2Lqosjpiha";
const RECEIVER_RAW = Address.parse(RECEIVER_FRIENDLY).toRawString();
const ALLOWED_ORIGINS = new Set([
  "https://ton-marketplace-cvj.pages.dev",
  "http://localhost:5173",
]);
const cors = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Cache-Control": "no-store",
});

function reply(data: Record<string, unknown>, status: number, origin: string) {
  return Response.json(data, { status, headers: cors(origin) });
}
function serviceKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return keys.default as string | undefined;
}
function nanoAmount(value: string | number) {
  const raw = String(value);
  if (!/^\d+(?:\.\d{1,9})?$/.test(raw)) throw new Error("Invalid GRAM amount");
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
function txHashHex(value: unknown): string | null {
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
  if (!ALLOWED_ORIGINS.has(origin)) return new Response("Forbidden", { status: 403 });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply({ success: false, error: "Method not allowed" }, 405, origin);

  try {
    const authorization = req.headers.get("authorization") ?? "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return reply({ success: false, error: "Authentication required" }, 401, origin);
    const url = Deno.env.get("SUPABASE_URL");
    const publishable = Deno.env.get("SUPABASE_ANON_KEY") ??
      JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default;
    const secret = serviceKey();
    const toncenterKey = Deno.env.get("TONCENTER_API_KEY");
    if (!url || !publishable || !secret || !toncenterKey) {
      return reply({ success: false, error: "TON payment verification is not configured" }, 503, origin);
    }

    const auth = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await auth.auth.getUser(token);
    if (authError || !authData.user || authData.user.is_anonymous !== true) {
      return reply({ success: false, error: "A valid anonymous buyer session is required" }, 401, origin);
    }

    const body = await req.json();
    const orderId = typeof body?.order_id === "string" ? body.order_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return reply({ success: false, error: "Invalid order ID" }, 400, origin);

    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: order, error: orderError } = await admin
      .from("premium_orders")
      .select("id, order_no, user_id, buyer_wallet, recipient_username, plan_name, gram_amount, gram_usd_rate, payment_address, payment_method, status, created_at, expires_at")
      .eq("id", orderId)
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (orderError || !order) return reply({ success: false, error: "Order not found" }, 404, origin);
    if (order.payment_method !== "GRAM" || order.payment_address !== RECEIVER_FRIENDLY) {
      return reply({ success: false, error: "This is not a GRAM native-coin order" }, 409, origin);
    }

    const { data: existing } = await admin
      .from("premium_payments")
      .select("id, order_id, tx_hash, chain_status, telegram_notified_at, chain_timestamp")
      .eq("order_id", order.id)
      .maybeSingle();
    if (existing?.chain_status === "confirmed") {
      // Repair the order mirror if a previous request recorded the payment
      // but failed before updating the order row.
      if (["pending", "payment_submitted", "payment_detected"].includes(order.status)) {
        const paidAt = existing.chain_timestamp ?? new Date().toISOString();
        const { error: repairError } = await admin
          .from("premium_orders")
          .update({
            status: "payment_detected",
            paid_at: paidAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.id)
          .eq("user_id", authData.user.id)
          .in("status", ["pending", "payment_submitted", "payment_detected"]);
        if (repairError) {
          console.error("GRAM order recovery update failed", repairError.message);
          return reply({ success: false, error: "The payment is recorded, but order status recovery failed. Retry verification or contact support." }, 500, origin);
        }
      }

      let telegramNotified = Boolean(existing.telegram_notified_at);
      const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
      const chatId = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID");
      if (!telegramNotified && botToken && chatId) {
        const message = [
          "✅ <b>TON 主网 GRAM 原生币收款已确认</b>",
          `订单：<code>${html(order.order_no)}</code>`,
          `接收用户：@<b>${html(order.recipient_username)}</b>`,
          `套餐：<b>${html(order.plan_name)}</b>`,
          `金额：<b>${html(String(order.gram_amount))} GRAM</b>`,
          `交易：<code>${html(String(existing.tx_hash))}</code>`,
          "状态：待管理员人工确认并开通 Premium",
        ].join("\\n");
        try {
          const notify = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML", disable_web_page_preview: true }),
            signal: AbortSignal.timeout(10000),
          });
          const result = await notify.json();
          telegramNotified = notify.ok && result?.ok === true;
          if (telegramNotified) {
            await admin
              .from("premium_payments")
              .update({ telegram_notified_at: new Date().toISOString() })
              .eq("id", existing.id);
          }
        } catch (error) {
          console.error("GRAM payment recovery Telegram notification failed", error);
        }
      }

      return reply({
        success: true,
        paymentVerified: true,
        orderNo: order.order_no,
        txHash: existing.tx_hash,
        telegramNotified,
        alreadyVerified: true,
      }, 200, origin);
    }
    if (!["pending", "payment_submitted", "payment_detected"].includes(order.status)) {
      return reply({ success: false, error: "This order is not awaiting payment" }, 409, origin);
    }
    if (Date.now() > new Date(order.expires_at).getTime()) {
      return reply({ success: false, error: "This order has expired" }, 410, origin);
    }

    const txResponse = await fetch(
      `https://toncenter.com/api/v2/getTransactions?address=${encodeURIComponent(RECEIVER_RAW)}&limit=100`,
      { headers: { Accept: "application/json", "X-API-Key": toncenterKey }, signal: AbortSignal.timeout(15000) },
    );
    if (!txResponse.ok) {
      console.error("TON Center transaction lookup failed", txResponse.status);
      return reply({ success: false, error: "TON Mainnet transaction lookup is temporarily unavailable; retry shortly" }, 502, origin);
    }
    const txData = await txResponse.json();
    if (txData?.ok !== true || !Array.isArray(txData?.result)) {
      return reply({ success: false, error: "TON Mainnet returned an invalid transaction response" }, 502, origin);
    }

    const expectedNano = nanoAmount(order.gram_amount);
    const createdAt = new Date(order.created_at).getTime();
    const expiresAt = new Date(order.expires_at).getTime();
    let match: Record<string, unknown> | null = null;
    for (const candidate of txData.result as Record<string, unknown>[]) {
      const incoming = candidate.in_msg as Record<string, unknown> | null;
      if (!incoming || incoming.bounced === true) continue;
      let destination: string;
      try {
        destination = Address.parse(String(incoming.destination ?? "")).toRawString();
      } catch { continue; }
      if (destination !== RECEIVER_RAW) continue;
      let senderRaw: string;
      try {
        senderRaw = Address.parse(String(incoming.source ?? "")).toRawString();
      } catch {
        continue;
      }
      if (senderRaw !== order.buyer_wallet) continue;
      const incomingValue = String(incoming.value ?? "");
      if (!/^\d+$/.test(incomingValue) || BigInt(incomingValue) !== expectedNano) continue;
      const msgData = incoming.msg_data as Record<string, unknown> | null;
      const bodyBoc = typeof msgData?.body === "string" ? msgData.body : "";
      const memo = decodeComment(bodyBoc);
      if (memo !== order.order_no) continue;
      const utime = Number(candidate.utime);
      const timestamp = utime * 1000;
      if (!Number.isFinite(timestamp) || timestamp < createdAt - 120000 || timestamp > expiresAt) continue;
      const description = candidate.description as Record<string, unknown> | null;
      const compute = description?.compute_ph as Record<string, unknown> | null;
      const action = description?.action as Record<string, unknown> | null;
      if (description?.aborted === true || compute?.success === false || action?.success === false) continue;
      const hash = txHashHex((candidate.transaction_id as Record<string, unknown> | null)?.hash);
      if (!hash) continue;
      match = { candidate, incoming, hash, timestamp };
      break;
    }

    if (!match) {
      return reply({
        success: false,
        code: "GRAM_TRANSFER_NOT_FOUND",
        error: "No confirmed native GRAM transfer matching this order's exact amount and unique memo was found yet. Wait for the wallet transaction to settle, then retry.",
      }, 409, origin);
    }

    const candidate = match.candidate as Record<string, unknown>;
    const incoming = match.incoming as Record<string, unknown>;
    const txHash = String(match.hash);
    const { data: duplicate } = await admin
      .from("premium_payments")
      .select("id, order_id")
      .eq("tx_hash", txHash)
      .maybeSingle();
    if (duplicate && duplicate.order_id !== order.id) {
      return reply({ success: false, error: "This on-chain transaction has already been used for another order" }, 409, origin);
    }

    if (!duplicate) {
      const source = typeof incoming.source === "string" ? incoming.source : null;
      const { error: paymentInsertError } = await admin
        .from("premium_payments")
        .insert({
          order_id: order.id,
          network: "TON_MAINNET",
          tx_hash: txHash,
          sender_wallet: source,
          receiver_wallet: RECEIVER_FRIENDLY,
          jetton_master: null,
          amount: String(order.gram_amount),
          chain_status: "confirmed",
          admin_confirmed: false,
          chain_timestamp: new Date(Number(match.timestamp)).toISOString(),
        });
      if (paymentInsertError) {
        console.error("GRAM payment insert failed", paymentInsertError.message);
        if (paymentInsertError.code === "23505") {
          return reply({ success: false, error: "This on-chain transaction has already been recorded. Retry payment verification to refresh this order." }, 409, origin);
        }
        return reply({ success: false, error: "Unable to record the verified GRAM payment; contact support with the order number" }, 500, origin);
      }
    }

    const { error: updateError } = await admin
      .from("premium_orders")
      .update({ status: "payment_detected", paid_at: new Date(Number(match.timestamp)).toISOString(), updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("user_id", authData.user.id)
      .in("status", ["pending", "payment_submitted", "payment_detected"]);
    if (updateError) {
      console.error("GRAM order status update failed", updateError.message);
      return reply({ success: false, error: "The GRAM transfer is recorded, but the order status could not be updated. Retry payment verification; the recorded transfer will not be charged again." }, 500, origin);
    }

    const { data: payment } = await admin
      .from("premium_payments")
      .select("id, telegram_notified_at")
      .eq("tx_hash", txHash)
      .eq("order_id", order.id)
      .maybeSingle();

    let telegramNotified = Boolean(payment?.telegram_notified_at);
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const chatId = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID");
    if (!telegramNotified && botToken && chatId) {
      const message = [
        "✅ <b>TON 主网 GRAM 原生币收款已确认</b>",
        `订单：<code>${html(order.order_no)}</code>`,
        `接收用户：@<b>${html(order.recipient_username)}</b>`,
        `套餐：<b>${html(order.plan_name)}</b>`,
        `金额：<b>${html(String(order.gram_amount))} GRAM</b>`,
        `交易：<code>${txHash}</code>`,
        "状态：待管理员人工确认并开通 Premium",
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
        if (telegramNotified && payment?.id) {
          await admin.from("premium_payments").update({ telegram_notified_at: new Date().toISOString() }).eq("id", payment.id);
        }
      } catch (error) {
        console.error("GRAM payment Telegram notification failed", error);
      }
    }

    return reply({
      success: true,
      paymentVerified: true,
      orderNo: order.order_no,
      txHash,
      telegramNotified,
      message: "Confirmed native GRAM payment recorded. Premium delivery remains manual.",
    }, 200, origin);
  } catch (error) {
    console.error("verify-gram-premium-payment failed", error);
    return reply({ success: false, error: "Unable to verify this GRAM payment right now" }, 500, origin);
  }
});
