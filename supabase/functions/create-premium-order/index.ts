import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://ton-marketplace-cvj.pages.dev",
  "http://localhost:5173",
];
const USDT_RECEIVER = "TTHRRLUQiu7W8bMZrUumNQS4V6FFwPB54r";

function allowedOrigin(origin: string) {
  return ALLOWED_ORIGINS.includes(origin) ||
    /^https:\/\/[a-z0-9-]+\.ton-marketplace-cvj\.pages\.dev$/.test(origin);
}

function response(data: Record<string, unknown>, status: number, origin: string) {
  return Response.json(data, {
    status,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
      "Cache-Control": "no-store",
    },
  });
}

function getSecretKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return keys.default as string | undefined;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (!allowedOrigin(origin)) return new Response("Forbidden", { status: 403 });
  if (req.method === "OPTIONS") return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    },
  });
  if (req.method !== "POST") return response({ success: false, error: "Method not allowed" }, 405, origin);

  try {
    const authorization = req.headers.get("authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token || token === authorization) {
      return response({ success: false, error: "Authentication required" }, 401, origin);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ??
      JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default;
    const serviceKey = getSecretKey();
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return response({ success: false, error: "Checkout service is not configured" }, 503, origin);
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) {
      return response({ success: false, error: "Invalid login session" }, 401, origin);
    }

    const body = await req.json();
    const planId = body?.plan_id;
    const paymentMethod = body?.payment_method;
    const rawUsername = typeof body?.recipient_username === "string" ? body.recipient_username : "";
    const username = rawUsername.trim().replace(/^@+/, "");

    if (!["year", "half-year", "quarter"].includes(planId)) {
      return response({ success: false, error: "Invalid Premium duration" }, 400, origin);
    }
    if (paymentMethod !== "USDT_TRC20") {
      return response({ success: false, code: "PAYMENT_METHOD_UNAVAILABLE", error: "Only USDT TRC20 checkout is enabled right now" }, 400, origin);
    }
    if (username.length < 5 || username.length > 32 || !/^[A-Za-z][A-Za-z0-9_]*$/.test(username)) {
      return response({ success: false, error: "Enter a valid Telegram username" }, 400, origin);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: plan, error: planError } = await admin
      .from("premium_pricing")
      .select("id, period, market_usd")
      .eq("id", planId)
      .maybeSingle();

    if (planError || !plan) {
      return response({ success: false, error: "Premium price is unavailable" }, 503, origin);
    }

    const usdAmount = Number(plan.market_usd);
    if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
      return response({ success: false, error: "Invalid Premium price configuration" }, 503, origin);
    }

    const orderNo = "PM" + Date.now().toString(36).toUpperCase() +
      crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const { data: order, error: insertError } = await admin
      .from("premium_orders")
      .insert({
        order_no: orderNo,
        user_id: authData.user.id,
        buyer_wallet: null,
        recipient_username: username,
        plan_id: plan.id,
        plan_name: plan.period,
        market_usd: usdAmount,
        usd_amount: usdAmount,
        gram_usd_rate: 1,
        gram_amount: usdAmount,
        payment_address: USDT_RECEIVER,
        payment_method: "USDT_TRC20",
        status: "pending",
        expires_at: expiresAt,
      })
      .select("id, order_no, usd_amount, payment_address, expires_at")
      .single();

    if (insertError || !order) {
      console.error("Premium order insert failed", insertError?.message);
      return response({ success: false, error: "Unable to create Premium order" }, 500, origin);
    }

    return response({
      success: true,
      orderId: order.id,
      orderNo: order.order_no,
      amount: Number(order.usd_amount).toFixed(2),
      usdAmount: Number(order.usd_amount).toFixed(2),
      paymentAddress: order.payment_address,
      expiresAt: order.expires_at,
      network: "TRON",
      token: "USDT",
      standard: "TRC20",
    }, 200, origin);
  } catch (error) {
    console.error("create-premium-order failed", error);
    return response({ success: false, error: "Unable to create Premium order" }, 500, origin);
  }
});
