import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const ADMIN_UID = "0744f173-3f36-438f-b265-9cb3be95ad78";
const ALLOWED_ORIGINS = new Set(["https://ton-marketplace-cvj.pages.dev", "http://localhost:5173"]);
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
function html(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
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
    const publishable = Deno.env.get("SUPABASE_ANON_KEY") ?? JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default;
    const secret = serviceKey();
    if (!url || !publishable || !secret) return reply({ success: false, error: "Service unavailable" }, 503, origin);

    const auth = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await auth.auth.getUser(token);
    if (authError || authData.user?.id !== ADMIN_UID) return reply({ success: false, error: "Administrator access required" }, 403, origin);

    const body = await req.json();
    const orderId = typeof body?.order_id === "string" ? body.order_id : "";
    const txHash = typeof body?.tx_hash === "string" ? body.tx_hash.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return reply({ success: false, error: "Invalid order ID" }, 400, origin);
    if (!/^[0-9a-f]{64}$/i.test(txHash)) return reply({ success: false, error: "Enter the 64-character TRON transaction hash" }, 400, origin);

    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: order, error: orderError } = await admin.from("premium_orders")
      .select("id, order_no, recipient_username, plan_name, usd_amount, payment_address, payment_method, status")
      .eq("id", orderId).maybeSingle();
    if (orderError || !order) return reply({ success: false, error: "Order not found" }, 404, origin);
    if (order.payment_method !== "USDT_TRC20" || order.payment_address !== "TL6CwxD5EN4N4BgeWsuwtYdUoWfB1ZjdA5") {
      return reply({ success: false, error: "This is not the configured USDT-TRC20 order" }, 409, origin);
    }
    if (order.status === "paid" || order.status === "completed") return reply({ success: true, alreadyConfirmed: true, orderNo: order.order_no }, 200, origin);
    if (order.status !== "pending") return reply({ success: false, error: "Order is not awaiting payment" }, 409, origin);

    const now = new Date().toISOString();
    const { data: payment, error: paymentError } = await admin.from("premium_payments").insert({
      order_id: order.id,
      network: "TRON_TRC20",
      tx_hash: txHash.toLowerCase(),
      sender_wallet: null,
      receiver_wallet: order.payment_address,
      amount: Number(order.usd_amount),
      chain_status: "confirmed",
      admin_confirmed: true,
      admin_confirmed_at: now,
      chain_timestamp: now,
    }).select("id").single();
    if (paymentError || !payment) {
      console.error("USDT manual payment record failed", paymentError?.message);
      return reply({ success: false, error: "Unable to record payment. Check whether this transaction hash was already used." }, 500, origin);
    }

    const { error: updateError } = await admin.from("premium_orders")
      .update({ status: "paid", paid_at: now, updated_at: now }).eq("id", order.id).eq("status", "pending");
    if (updateError) return reply({ success: false, error: "Payment record saved but order update failed; retry or inspect order." }, 500, origin);

    await admin.from("premium_order_logs").insert({
      order_id: order.id, actor_id: ADMIN_UID, action: "admin_confirmed_usdt_trc20_payment",
      old_status: "pending", new_status: "paid", note: "Administrator manually verified the USDT TRC20 transaction hash.",
    });

    let telegramNotified = false;
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const chatId = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID");
    if (botToken && chatId) {
      const message = [
        "✅ <b>USDT-TRC20 Premium 收款已由管理员确认</b>",
        `订单：<code>${html(order.order_no)}</code>`,
        `接收用户：@<b>${html(order.recipient_username)}</b>`,
        `套餐：<b>${html(order.plan_name)}</b>`,
        `金额：<b>${html(Number(order.usd_amount).toFixed(2))} USDT</b>`,
        `TRON 交易：<code>${html(txHash)}</code>`,
        "状态：待管理员完成 Telegram Premium 人工开通",
      ].join("\\n");
      try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML", disable_web_page_preview: true }),
          signal: AbortSignal.timeout(10000),
        });
        const result = await response.json();
        telegramNotified = response.ok && result?.ok === true;
        if (telegramNotified) await admin.from("premium_payments").update({ telegram_notified_at: new Date().toISOString() }).eq("id", payment.id);
      } catch (error) { console.error("USDT payment confirmation Telegram notification failed", error); }
    }
    return reply({ success: true, orderNo: order.order_no, telegramNotified }, 200, origin);
  } catch (error) {
    console.error("admin-confirm-usdt-payment failed", error);
    return reply({ success: false, error: "Unable to confirm USDT payment" }, 500, origin);
  }
});
