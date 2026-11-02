import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve((req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const allowed = origin === "https://ton-marketplace-cvj.pages.dev" || origin === "http://localhost:5173";
  if (!allowed) return new Response("Forbidden", { status: 403 });
  const headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin", "Cache-Control": "no-store", "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), { status: 405, headers });
  return new Response(JSON.stringify({ success: false, code: "PREMIUM_CHECKOUT_NOT_IMPLEMENTED", error: "Premium checkout is temporarily unavailable" }), { status: 503, headers });
});
