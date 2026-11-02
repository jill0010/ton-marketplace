import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGINS = new Set([
  "https://ton-marketplace-cvj.pages.dev",
  "http://localhost:5173",
]);

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
});

function jsonResponse(
  data: Record<string, unknown>,
  status: number,
  origin: string,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(origin),
      ...extraHeaders,
    },
  });
}

// 生成 32 字节随机挑战值
function createPayload(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// 获取客户端 IP 并生成 SHA-256 标识
async function createClientKey(req: Request): Promise<string | null> {
  const clientIp =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip");

  if (!clientIp) return null;

  const normalizedIp = clientIp.trim();

  if (
    !normalizedIp ||
    normalizedIp.length > 200 ||
    normalizedIp.includes(",")
  ) {
    return null;
  }

  const ipBytes = new TextEncoder().encode(normalizedIp);
  const hash = await crypto.subtle.digest("SHA-256", ipBytes);

  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// 从 Supabase Auth 服务端验证买家身份
async function verifyAnonymousUser(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
): Promise<string | null> {
  const authorization = req.headers.get("authorization");

  if (!authorization) return null;

  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match || !match[1]) return null;

  const accessToken = match[1].trim();

  if (!accessToken || accessToken.length > 10000) {
    return null;
  }

  const response = await fetch(
    `${supabaseUrl}/auth/v1/user`,
    {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    console.error("Supabase user verification failed:", response.status);
    return null;
  }

  const user = await response.json();

  // 只允许真正的匿名用户申请买家挑战值
  if (
    typeof user.id !== "string" ||
    user.is_anonymous !== true
  ) {
    return null;
  }

  return user.id;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";

  if (!ALLOWED_ORIGINS.has(origin)) {
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { success: false, error: "Method not allowed" },
      405,
      origin,
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");

    if (!supabaseUrl || !anonKey || !secretKeysRaw) {
      console.error("Supabase configuration missing");

      return jsonResponse(
        { success: false, error: "Server configuration missing" },
        500,
        origin,
      );
    }

    const secretKeys = JSON.parse(secretKeysRaw);
    const serviceKey = secretKeys.default;

    if (typeof serviceKey !== "string" || !serviceKey) {
      console.error("Default secret key missing");

      return jsonResponse(
        { success: false, error: "Server configuration missing" },
        500,
        origin,
      );
    }

    // 第一步：验证 Supabase 匿名用户 JWT
    const userId = await verifyAnonymousUser(
      req,
      supabaseUrl,
      anonKey,
    );

    if (!userId) {
      return jsonResponse(
        {
          success: false,
          error: "Valid anonymous buyer session required",
        },
        401,
        origin,
      );
    }

    // 第二步：IP 限流
    const clientKey = await createClientKey(req);

    if (!clientKey) {
      console.error("Client IP header unavailable");

      return jsonResponse(
        { success: false, error: "Unable to identify client" },
        503,
        origin,
      );
    }

    const rateLimitResponse = await fetch(
      `${supabaseUrl}/rest/v1/rpc/consume_ton_proof_rate_limit`,
      {
        method: "POST",
        headers: {
          apikey: serviceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_client_key: clientKey,
          p_limit: 10,
          p_window_seconds: 60,
        }),
      },
    );

    if (!rateLimitResponse.ok) {
      console.error(
        "Rate limit check failed:",
        rateLimitResponse.status,
      );

      return jsonResponse(
        { success: false, error: "Rate limit service unavailable" },
        503,
        origin,
      );
    }

    const isAllowed = await rateLimitResponse.json();

    if (isAllowed !== true) {
      return jsonResponse(
        {
          success: false,
          error: "Too many requests. Please try again later.",
        },
        429,
        origin,
        { "Retry-After": "60" },
      );
    }

    // 第三步：生成随机挑战值
    const payload = createPayload();
    const expiresAt = Math.floor(Date.now() / 1000) + 300;

    // 第四步：将挑战值与服务端验证的买家 UUID 绑定
    const saveResponse = await fetch(
      `${supabaseUrl}/rest/v1/ton_proof_challenges`,
      {
        method: "POST",
        headers: {
          apikey: serviceKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          payload,
          expires_at: expiresAt,
          attempt_id: userId,
        }),
      },
    );

    if (!saveResponse.ok) {
      console.error(
        "Challenge storage failed:",
        saveResponse.status,
      );

      return jsonResponse(
        { success: false, error: "Unable to create challenge" },
        500,
        origin,
      );
    }

    return jsonResponse(
      {
        success: true,
        payload,
        expiresAt,
        expiresIn: 300,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error("TON proof challenge error:", error);

    return jsonResponse(
      {
        success: false,
        error: "Unable to create wallet verification challenge",
      },
      500,
      origin,
    );
  }
});