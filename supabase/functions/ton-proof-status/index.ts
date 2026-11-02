
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// =====================================================
// 1. 基础配置
// =====================================================

const ALLOWED_ORIGINS = new Set([
  "https://ton-marketplace-cvj.pages.dev",
  "http://localhost:5173",
]);

const EXPECTED_NETWORK = "-239";

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
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(origin),
  });
}

// =====================================================
// 2. 验证当前 Supabase 匿名用户
// =====================================================

async function verifyAnonymousUser(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
): Promise<string | null> {
  const authorization = req.headers.get("authorization");

  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match || !match[1]) {
    return null;
  }

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
    console.error(
      "Supabase identity verification failed:",
      response.status,
    );
    return null;
  }

  const user = await response.json();

  if (
    typeof user.id !== "string" ||
    user.is_anonymous !== true
  ) {
    return null;
  }

  return user.id;
}

// =====================================================
// 3. 查询当前用户已验证的钱包
// =====================================================

async function getVerifiedWallet(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
) {
  const query = new URLSearchParams({
    select:
      "wallet_address,network,wallet_version,verified_at",
    user_id: `eq.${userId}`,
    limit: "1",
  });

  const response = await fetch(
    `${supabaseUrl}/rest/v1/ton_verified_wallets?${query.toString()}`,
    {
      method: "GET",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    console.error(
      "Verified wallet query failed:",
      response.status,
    );
    throw new Error("Verified wallet query failed");
  }

  const rows = await response.json();

  if (!Array.isArray(rows)) {
    throw new Error("Invalid database response");
  }

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];

  if (
    typeof row.wallet_address !== "string" ||
    typeof row.network !== "string" ||
    typeof row.wallet_version !== "string" ||
    typeof row.verified_at !== "string"
  ) {
    throw new Error("Invalid verified wallet record");
  }

  return {
    address: row.wallet_address,
    network: row.network,
    walletVersion: row.wallet_version,
    verifiedAt: row.verified_at,
  };
}

// =====================================================
// 4. Edge Function 主入口
// =====================================================

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";

  if (!ALLOWED_ORIGINS.has(origin)) {
    return new Response("Forbidden", {
      status: 403,
    });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        error: "Method not allowed",
      },
      405,
      origin,
    );
  }

  try {
    // 1. 读取服务端配置
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const secretKeysRaw = Deno.env.get(
      "SUPABASE_SECRET_KEYS",
    );

    if (
      !supabaseUrl ||
      !anonKey ||
      !secretKeysRaw
    ) {
      console.error("Supabase configuration missing");

      return jsonResponse(
        {
          success: false,
          error: "Server configuration missing",
        },
        500,
        origin,
      );
    }

    // 2. 解析服务端密钥
    const secretKeys = JSON.parse(secretKeysRaw);
    const serviceKey = secretKeys.default;

    if (
      typeof serviceKey !== "string" ||
      !serviceKey
    ) {
      console.error("Service key missing");

      return jsonResponse(
        {
          success: false,
          error: "Server configuration missing",
        },
        500,
        origin,
      );
    }

    // 3. 验证当前匿名用户身份
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

    // 4. 只查询当前登录用户自己的钱包记录
    const wallet = await getVerifiedWallet(
      supabaseUrl,
      serviceKey,
      userId,
    );

    // 5. 没有验证记录
    if (!wallet) {
      return jsonResponse(
        {
          success: true,
          verified: false,
        },
        200,
        origin,
      );
    }

    // 6. 检查网络
    if (wallet.network !== EXPECTED_NETWORK) {
      return jsonResponse(
        {
          success: true,
          verified: false,
        },
        200,
        origin,
      );
    }

    // 7. 返回当前用户的钱包验证状态
    return jsonResponse(
      {
        success: true,
        verified: true,
        address: wallet.address,
        network: wallet.network,
        walletVersion: wallet.walletVersion,
        verifiedAt: wallet.verifiedAt,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error(
      "TON wallet status query failed:",
      error,
    );

    return jsonResponse(
      {
        success: false,
        error: "Unable to retrieve wallet verification status",
      },
      500,
      origin,
    );
  }
});
