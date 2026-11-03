import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://ton-marketplace-cvj.pages.dev",
  "http://localhost:5173",
];
const USDT_RECEIVER = "TTHRRLUQiu7W8bMZrUumNQS4V6FFwPB54r";
const USDT_CONTRACT = "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj";
const TRONGRID_BASE = "https://api.trongrid.io";

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

function expectedUsdtRaw(amount: string | number) {
  const value = String(amount);
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) throw new Error("Invalid order amount");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt((fraction + "000000").slice(0, 6));
}

function eventField(result: Record<string, unknown>, name: string, index: string) {
  return String(result[name] ?? result[index] ?? "");
}

function htmlEscape(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
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
      return response({ success: false, error: "Payment verification is not configured" }, 503, origin);
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) {
      return response({ success: false, error: "Invalid login session" }, 401, origin);
    }

    const body = await req.json();
    const orderId = typeof body?.order_id === "string" ? body.order_id : "";
    const txHash = typeof body?.tx_hash === "string" ? body.tx_hash.trim().toLowerCase() : "";
    if (!/^[0-9a-f]{64}$/.test(txHash) || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return response({ success: false, error: "Invalid order ID or TRON transaction hash" }, 400, origin);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: order, error: orderError } = await admin
      .from("premium_orders")
      .select("id, order_no, user_id, recipient_username, plan_name, usd_amount, payment_address, payment_method, status, created_at, expires_at")
      .eq("id", orderId)
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (orderError || !order) return response({ success: false, error: "Order not found" }, 404, origin);
    if (order.payment_method !== "USDT_TRC20" || order.payment_address !== USDT_RECEIVER) {
      return response({ success: false, error: "This order is not a USDT TRC20 order" }, 400, origin);
    }

    const { data: existingPayment } = await admin
      .from("premium_payments")
      .select("id, order_id, chain_status, telegram_notified_at")
      .eq("tx_hash", txHash)
      .maybeSingle();

    if (existingPayment && existingPayment.order_id !== order.id) {
      return response({ success: false, error: "This transaction has already been used for another order" }, 409, origin);
    }

    if (!existingPayment) {
      if (order.status !== "pending" && order.status !== "payment_submitted") {
        return response({ success: false, error: "This order is not awaiting payment" }, 409, origin);
      }
      if (Date.now() > new Date(order.expires_at).getTime()) {
        return response({ success: false, error: "This order has expired" }, 410, origin);
      }

      const headers: Record<string, string> = { Accept: "application/json" };
      const tronGridKey = Deno.env.get("TRONGRID_API_KEY");
      if (tronGridKey) headers["TRON-PRO-API-KEY"] = tronGridKey;

      const eventUrl = `${TRONGRID_BASE}/v1/transactions/${txHash}/events?only_confirmed=true&limit=200`;
      const chainResponse = await fetch(eventUrl, {
        headers,
        signal: AbortSignal.timeout(12000),
      });
      if (!chainResponse.ok) {
        console.error("TronGrid event lookup failed", chainResponse.status);
        return response({ success: false, error: "TRON chain lookup is temporarily unavailable. Please retry shortly." }, 502, origin);
      }

      const chainData = await chainResponse.json();
      const events = Array.isArray(chainData?.data) ? chainData.data : [];
      const transfer = events.find((event: Record<string, unknown>) => {
        const result = (event.result && typeof event.result === "object")
          ? event.result as Record<string, unknown>
          : {};
        const eventTx = String(event.transaction_id ?? event.transactionId ?? txHash).toLowerCase();
        return String(event.event_name ?? "") === "Transfer" &&
          String(event.contract_address ?? "").toLowerCase() === USDT_CONTRACT.toLowerCase() &&
          eventTx === txHash &&
          eventField(result, "to", "1") === USDT_RECEIVER;
      });

      if (!transfer) {
        return response({ success: false, code: "TRANSFER_NOT_CONFIRMED", error: "No confirmed USDT TRC20 transfer to this receiving address was found for this transaction. Check the TxID and network, then retry." }, 409, origin);
      }

      const result = transfer.result as Record<string, unknown>;
      const rawValue = eventField(result, "value", "2");
      if (!/^\d+$/.test(rawValue)) return response({ success: false, error: "TRON returned an invalid token transfer amount" }, 502, origin);

      const expectedRaw = expectedUsdtRaw(order.usd_amount);
      if (BigInt(rawValue) !== expectedRaw) {
        return response({ success: false, code: "AMOUNT_MISMATCH", error: `The confirmed transfer amount does not match this order. Required: ${Number(order.usd_amount).toFixed(2)} USDT.` }, 409, origin);
      }

      const blockTimestamp = Number(transfer.block_timestamp);
      const createdAt = new Date(order.created_at).getTime();
      const expiresAt = new Date(order.expires_at).getTime();
      if (!Number.isFinite(blockTimestamp) || blockTimestamp < createdAt - 120000 || blockTimestamp > expiresAt) {
        return response({ success: false, code: "TRANSFER_OUTSIDE_ORDER_WINDOW", error: "This transaction was not made within this order's payment window." }, 409, origin);
      }

      const sender = eventField(result, "from", "0");
      const { error: paymentInsertError } = await admin
        .from("premium_payments")
        .insert({
          order_id: order.id,
          network: "TRON",
          tx_hash: txHash,
          sender_wallet: sender || null,
          receiver_wallet: USDT_RECEIVER,
          jetton_master: USDT_CONTRACT,
          amount: Number(order.usd_amount).toFixed(2),
          chain_status: "confirmed",
          admin_confirmed: false,
          chain_timestamp: new Date(blockTimestamp).toISOString(),
        });

      if (paymentInsertError) {
        const { data: duplicate } = await admin
          .from("premium_payments")
          .select("id, order_id, chain_status, telegram_notified_at")
          .eq("tx_hash", txHash)
          .maybeSingle();
        if (!duplicate || duplicate.order_id !== order.id) {
          console.error("Premium payment insert failed", paymentInsertError.message);
          return response({ success: false, error: "Unable to record this payment. Contact support with your transaction ID." }, 500, origin);
        }
      }

      const { error: orderUpdateError } = await admin
        .from("premium_orders")
        .update({
          status: "payment_detected",
          paid_at: new Date(blockTimestamp).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id)
        .eq("user_id", authData.user.id)
        .in("status", ["pending", "payment_submitted"]);
      if (orderUpdateError) {
        console.error("Premium order status update failed", orderUpdateError.message);
      }
    }

    const { data: payment } = await admin
      .from("premium_payments")
      .select("id, telegram_notified_at")
      .eq("tx_hash", txHash)
      .eq("order_id", order.id)
      .maybeSingle();

    let telegramNotified = Boolean(payment?.telegram_notified_at);
    if (!telegramNotified) {
      const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
      const chatId = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID");
      if (botToken && chatId) {
        const text = [
          "✅ <b>USDT TRC20 收款已链上确认</b>",
          `订单：<code>${htmlEscape(order.order_no)}</code>`,
          `赠送对象：@<b>${htmlEscape(order.recipient_username)}</b>`,
          `套餐：${htmlEscape(order.plan_name)}`,
          `金额：<b>${Number(order.usd_amount).toFixed(2)} USDT</b>`,
          `TxID：<code>${txHash}</code>`,
          "状态：待管理员确认并手动赠送 Premium",
        ].join("\n");

        try {
          const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
            signal: AbortSignal.timeout(10000),
          });
          const telegramResult = await telegramResponse.json();
          telegramNotified = telegramResponse.ok && telegramResult?.ok === true;
          if (telegramNotified && payment?.id) {
            await admin.from("premium_payments")
              .update({ telegram_notified_at: new Date().toISOString() })
              .eq("id", payment.id);
          } else {
            console.error("Telegram notification failed", telegramResult?.description ?? telegramResponse.status);
          }
        } catch (error) {
          console.error("Telegram notification request failed", error);
        }
      } else {
        console.error("Telegram bot secrets are missing");
      }
    }

    return response({
      success: true,
      orderNo: order.order_no,
      paymentVerified: true,
      telegramNotified,
      message: "Confirmed USDT TRC20 payment recorded. Premium delivery remains manual.",
    }, 200, origin);
  } catch (error) {
    console.error("verify-usdt-payment failed", error);
    return response({ success: false, error: "Unable to verify this TRON payment right now" }, 500, origin);
  }
});
