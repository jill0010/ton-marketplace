import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { Address } from "npm:@ton/core@0.63.1";

const RECEIVER_FRIENDLY = "UQBLw8lmwDXPdZXudHrTPpLAfHQW5N55aQgBuH2Lqosjpiha";
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

function toNano(value: string | number) {
  const raw = String(value);
  if (!/^\d+(?:\.\d{1,9})?$/.test(raw)) throw new Error("Invalid GRAM amount");
  const [whole, fraction = ""] = raw.split(".");
  return (BigInt(whole) * 1_000_000_000n + BigInt((fraction + "000000000").slice(0, 9))).toString();
}

function html(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function serviceKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return keys.default as string | undefined;
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
    if (!url || !publishable || !secret) return reply({ success: false, error: "Checkout service is not configured" }, 503, origin);

    const auth = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await auth.auth.getUser(token);
    if (authError || !authData.user || authData.user.is_anonymous !== true) {
      return reply({ success: false, error: "A valid anonymous buyer session is required" }, 401, origin);
    }

    const body = await req.json();
    const planId = body?.plan_id;
    const username = typeof body?.recipient_username === "string"
      ? body.recipient_username.trim().replace(/^@+/, "")
      : "";
    if (!["year", "half-year", "quarter"].includes(planId)) {
      return reply({ success: false, error: "Invalid Premium plan" }, 400, origin);
    }
    if (username.length < 5 || username.length > 32 || !/^[A-Za-z][A-Za-z0-9_]*$/.test(username)) {
      return reply({ success: false, error: "Enter the Telegram username that will receive Premium" }, 400, origin);
    }

    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: wallet, error: walletError } = await admin
      .from("ton_verified_wallets")
      .select("wallet_address, network, verified_at")
      .eq("user_id", authData.user.id)
      .eq("network", "-239")
      .maybeSingle();

    if (walletError || !wallet) {
      return reply({ success: false, code: "WALLET_NOT_VERIFIED", error: "Complete TON Proof wallet verification before creating a GRAM order" }, 403, origin);
    }

    let buyerWallet: string;
    try {
      buyerWallet = Address.parse(wallet.wallet_address).toRawString();
    } catch {
      return reply({ success: false, error: "The verified wallet record is invalid" }, 409, origin);
    }
    const verifiedAt = new Date(wallet.verified_at).getTime();
    if (!Number.isFinite(verifiedAt) || verifiedAt > Date.now() + 30_000 || Date.now() - verifiedAt > 600_000) {
      return reply({
        success: false,
        code: "WALLET_PROOF_EXPIRED",
        error: "Wallet verification expired. Reconnect and verify your TON wallet before creating a payment order.",
      }, 403, origin);
    }

    const { data: plan, error: planError } = await admin
      .from("premium_pricing")
      .select("id, period, market_usd, gram_price")
      .eq("id", planId)
      .maybeSingle();
    if (planError || !plan) return reply({ success: false, error: "Premium pricing is unavailable" }, 503, origin);

    const gramAmountRaw = String(plan.gram_price).trim();
    const gramAmount = Number(gramAmountRaw);
    const marketUsd = Number(plan.market_usd);
    if (
      !/^\d+(?:\.\d{1,9})?$/.test(gramAmountRaw) ||
      !Number.isFinite(gramAmount) ||
      gramAmount <= 0 ||
      !Number.isFinite(marketUsd) ||
      marketUsd <= 0
    ) {
      return reply({ success: false, error: "Invalid Premium pricing configuration" }, 503, origin);
    }
    const amountNano = toNano(gramAmountRaw).toString();

    const quoteResponse = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd&include_last_updated_at=true",
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) },
    );
    if (!quoteResponse.ok) return reply({ success: false, error: "Live GRAM/USD quote unavailable; no order was created" }, 503, origin);
    const quoteData = await quoteResponse.json();
    const quote = quoteData?.["the-open-network"];
    const rate = Number(quote?.usd);
    const updatedAt = Number(quote?.last_updated_at);
    const age = Math.floor(Date.now() / 1000) - updatedAt;
    if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(updatedAt) || age < -60 || age > 600) {
      return reply({ success: false, error: "Live GRAM/USD quote is stale or invalid; no order was created" }, 503, origin);
    }

    const orderNo = "GR" + Date.now().toString(36).toUpperCase() + crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { data: order, error: insertError } = await admin
      .from("premium_orders")
      .insert({
        order_no: orderNo,
        user_id: authData.user.id,
        buyer_wallet: buyerWallet,
        recipient_username: username,
        plan_id: plan.id,
        plan_name: plan.period,
        market_usd: marketUsd,
        usd_amount: Number((gramAmount * rate).toFixed(8)),
        gram_usd_rate: rate,
        gram_amount: gramAmountRaw,
        payment_address: RECEIVER_FRIENDLY,
        payment_method: "GRAM",
        status: "pending",
        expires_at: expiresAt,
      })
      .select("id, order_no, gram_amount, gram_usd_rate, payment_address, expires_at")
      .single();

    if (insertError || !order) {
      console.error("GRAM Premium order insert failed", insertError?.message);
      return reply({ success: false, error: "Unable to create GRAM Premium order" }, 500, origin);
    }

    let telegramNotified = false;
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const chatId = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID");
    if (botToken && chatId) {
      const message = [
        "🆕 <b>新的 GRAM Premium 订单</b>",
        `订单：<code>${html(order.order_no)}</code>`,
        `接收用户：@<b>${html(username)}</b>`,
        `套餐：<b>${html(plan.period)}</b>`,
        `金额：<b>${html(String(order.gram_amount))} GRAM</b>`,
        `买家钱包：<code>${html(buyerWallet)}</code>`,
        `收款地址：<code>${html(RECEIVER_FRIENDLY)}</code>`,
        `有效期至：${html(order.expires_at)}`,
        "状态：等待买家支付",
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
      } catch (error) {
        console.error("New GRAM Premium order Telegram notification failed", error);
      }
    }

    return reply({
      success: true,
      telegramNotified,
      orderId: order.id,
      orderNo: order.order_no,
      amount: String(order.gram_amount),
      amountNano,
      usdRate: Number(order.gram_usd_rate),
      paymentAddress: order.payment_address,
      buyerWallet,
      expiresAt: order.expires_at,
      network: "TON_MAINNET",
      currency: "GRAM",
      paymentType: "NATIVE",
      memo: order.order_no,
    }, 200, origin);
  } catch (error) {
    console.error("create-gram-premium-order failed", error);
    return reply({ success: false, error: "Unable to create GRAM Premium order" }, 500, origin);
  }
});
