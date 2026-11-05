import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const ADMIN_UID = "0744f173-3f36-438f-b265-9cb3be95ad78";
const ALLOWED_ORIGINS = new Set([
  "https://ton-marketplace-cvj.pages.dev",
  "http://localhost:5173",
]);

function headers(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}

function reply(data: Record<string, unknown>, status: number, origin: string) {
  return Response.json(data, { status, headers: headers(origin) });
}

function serviceKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return typeof keys.default === "string" ? keys.default : undefined;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) return new Response("Forbidden", { status: 403 });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(origin) });
  if (req.method !== "POST") return reply({ success: false, error: "Method not allowed" }, 405, origin);

  try {
    const token = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return reply({ success: false, error: "Authentication required" }, 401, origin);

    const url = Deno.env.get("SUPABASE_URL");
    const publishable = Deno.env.get("SUPABASE_ANON_KEY") ??
      JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default;
    const secret = serviceKey();
    if (!url || !publishable || !secret) return reply({ success: false, error: "Service unavailable" }, 503, origin);

    const auth = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await auth.auth.getUser(token);
    if (authError || authData.user?.id !== ADMIN_UID || authData.user.is_anonymous === true) {
      return reply({ success: false, error: "Administrator access required" }, 403, origin);
    }

    const body = await req.json();
    const action = typeof body?.action === "string" ? body.action : "";
    const orderId = typeof body?.order_id === "string" ? body.order_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return reply({ success: false, error: "Invalid order ID" }, 400, origin);

    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    let data: unknown;
    let error: { message: string } | null = null;

    if (action === "confirm_gram_payment") {
      const paymentId = typeof body?.payment_id === "string" ? body.payment_id : "";
      if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return reply({ success: false, error: "Invalid payment ID" }, 400, origin);
      const result = await admin.rpc("admin_confirm_premium_gram_payment", {
        p_order_id: orderId,
        p_payment_id: paymentId,
        p_actor_id: ADMIN_UID,
      });
      data = result.data;
      error = result.error;
    } else if (action === "complete_delivery") {
      const reference = typeof body?.delivery_reference === "string" ? body.delivery_reference.trim() : "";
      const note = typeof body?.note === "string" ? body.note.trim() : "";
      if (reference.length > 512 || note.length > 2000) {
        return reply({ success: false, error: "Delivery reference or note is too long" }, 400, origin);
      }
      const result = await admin.rpc("admin_complete_premium_delivery", {
        p_order_id: orderId,
        p_actor_id: ADMIN_UID,
        p_delivery_reference: reference || null,
        p_note: note || null,
      });
      data = result.data;
      error = result.error;
    } else {
      return reply({ success: false, error: "Unsupported administrator action" }, 400, origin);
    }

    if (error) {
      console.error("Premium administrator transition rejected", error.message);
      return reply({ success: false, error: "The order is not eligible for this action, or the change could not be saved." }, 409, origin);
    }
    const result = Array.isArray(data) ? data[0] : data;
    if (!result || typeof result.status !== "string") {
      return reply({ success: false, error: "The order transition could not be confirmed." }, 500, origin);
    }
    return reply({ success: true, ...result }, 200, origin);
  } catch (error) {
    console.error("admin-premium-order-action failed", error);
    return reply({ success: false, error: "Unable to process the Premium order action." }, 500, origin);
  }
});
