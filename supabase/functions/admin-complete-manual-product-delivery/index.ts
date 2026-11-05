import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const ADMIN_UID = "0744f173-3f36-438f-b265-9cb3be95ad78";
const ALLOWED_ORIGINS = new Set([
  "https://ton-marketplace-cvj.pages.dev",
  "http://localhost:5173",
]);

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

function getServiceKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return typeof keys.default === "string" ? keys.default : undefined;
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
    const secret = getServiceKey();
    if (!url || !publishable || !secret) {
      return reply({ success: false, error: "Service unavailable" }, 503, origin);
    }

    const auth = createClient(url, publishable, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await auth.auth.getUser(token);
    if (authError || authData.user?.id !== ADMIN_UID || authData.user.is_anonymous === true) {
      return reply({ success: false, error: "Administrator access required" }, 403, origin);
    }

    const body = await req.json();
    const orderId = typeof body?.order_id === "string" ? body.order_id : "";
    const deliveryReference = typeof body?.delivery_reference === "string"
      ? body.delivery_reference.trim()
      : "";
    const note = typeof body?.note === "string" ? body.note.trim() : "";

    if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
      return reply({ success: false, error: "Invalid order ID" }, 400, origin);
    }
    if (!deliveryReference || deliveryReference.length > 512 || note.length > 2000) {
      return reply({ success: false, error: "Enter a delivery reference (up to 512 characters) and a note up to 2,000 characters." }, 400, origin);
    }

    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.rpc("admin_complete_manual_product_delivery", {
      p_order_id: orderId,
      p_actor_id: ADMIN_UID,
      p_delivery_reference: deliveryReference,
      p_note: note || null,
    });

    if (error) {
      console.error("Manual product delivery transition rejected", error.message);
      return reply({ success: false, error: "Order is not eligible for delivery, or the delivery record could not be saved." }, 409, origin);
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result || result.status !== "delivered") {
      return reply({ success: false, error: "Delivery result could not be confirmed." }, 500, origin);
    }

    return reply({
      success: true,
      orderId: result.order_id,
      orderNo: result.order_no,
      status: result.status,
    }, 200, origin);
  } catch (error) {
    console.error("admin-complete-manual-product-delivery failed", error);
    return reply({ success: false, error: "Unable to record manual product delivery." }, 500, origin);
  }
});
