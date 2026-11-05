import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const RECEIVER_TRC20 = "TL6CwxD5EN4N4BgeWsuwtYdUoWfB1ZjdA5";
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
    const publishable = Deno.env.get("SUPABASE_ANON_KEY") ??
      JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default;
    const secret = serviceKey();
    if (!url || !publishable || !secret) return reply({ success: false, error: "Checkout service is not configured" }, 503, origin);

    const auth = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await auth.auth.getUser(token);
    if (authError || !authData.user || authData.user.is_anonymous !== true) {
      return reply({ success: false, error: "A valid anonymous buyer session is required" }, 401, origin);
    }

    const body = await req.json();
    const planId = body?.plan_id;
    const username = typeof body?.recipient_username === "string" ? body.recipient_username.trim().replace(/^@+/, "") : "";
    if (!["month", "quarter", "half-year", "year"].includes(planId)) {
      return reply({ success: false, error: "Invalid Premium plan" }, 400, origin);
    }
    if (username.length < 4 || username.length > 32 || !/^[A-Za-z][A-Za-z0-9_]*$/.test(username)) {
      return reply({ success: false, error: "请输入有效的 Telegram 用户名（4–32 位，字母开头，可包含数字和下划线）。" }, 400, origin);
    }

    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: plan, error: planError } = await admin.from("premium_pricing")
      .select("id, period, market_usd").eq("id", planId).maybeSingle();
    if (planError || !plan) return reply({ success: false, error: "Premium pricing is unavailable" }, 503, origin);

    const amount = Number(plan.market_usd);
    if (!Number.isFinite(amount) || amount <= 0) return reply({ success: false, error: "Invalid Premium price" }, 503, origin);
    const orderNo = "US" + Date.now().toString(36).toUpperCase() + crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const { data: order, error: insertError } = await admin.from("premium_orders").insert({
      order_no: orderNo,
      user_id: authData.user.id,
      buyer_wallet: null,
      recipient_username: username,
      plan_id: plan.id,
      plan_name: plan.period,
      market_usd: amount,
      usd_amount: amount,
      gram_usd_rate: 1,
      gram_amount: amount,
      payment_address: RECEIVER_TRC20,
      payment_method: "USDT_TRC20",
      status: "pending",
      expires_at: expiresAt,
    }).select("id, order_no, usd_amount, payment_address, expires_at").single();

    if (insertError || !order) {
      console.error("USDT Premium order insert failed", insertError?.message);
      return reply({ success: false, error: "Unable to create USDT Premium order" }, 500, origin);
    }

    let telegramNotified = false;
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const chatId = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID");
    if (botToken && chatId) {
      const message = [
        "🆕 <b>新的 USDT-TRC20 Premium 订单</b>",
        `订单：<code>${html(order.order_no)}</code>`,
        `接收用户：@<b>${html(username)}</b>`,
        `套餐：<b>${html(plan.period)}</b>`,
        `金额：<b>${html(Number(order.usd_amount).toFixed(2))} USDT</b>`,
        `收款网络：<b>TRON (TRC20)</b>`,
        `收款地址：<code>${html(RECEIVER_TRC20)}</code>`,
        `有效期至：${html(order.expires_at)}`,
        "状态：等待买家转账，到账后由管理员核实并人工开通",
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
      } catch (error) {
        console.error("USDT Premium order Telegram notification failed", error);
      }
    }

    return reply({
      success: true,
      telegramNotified,
      orderId: order.id,
      orderNo: order.order_no,
      amount: Number(order.usd_amount).toFixed(2),
      paymentAddress: order.payment_address,
      network: "TRON_TRC20",
      currency: "USDT",
      expiresAt: order.expires_at,
    }, 200, origin);
  } catch (error) {
    console.error("create-usdt-premium-order failed", error);
    return reply({ success: false, error: "Unable to create USDT Premium order" }, 500, origin);
  }
});
