import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const ADMIN_USER_ID = "0744f173-3f36-438f-b265-9cb3be95ad78";
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://ton-marketplace-cvj.pages.dev",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

type JsonObject = Record<string, unknown>;
type PortalsGift = {
  name?: string;
  tg_id?: string;
  ton_address?: string;
  photo_url?: string;
  external_collection_number?: number;
  attributes?: unknown[];
};
type TonNft = {
  address?: string;
  index?: number | string;
  collection_address?: string;
  owner_address?: string;
  init?: boolean;
  content?: JsonObject;
};
type TonNftResponse = {
  nft_items?: TonNft[];
  metadata?: Record<string, { token_info?: Array<{ name?: string; description?: string; image?: string }> }>;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseInput(value: string) {
  const input = value.trim();
  const link = input.match(/^https?:\/\/(?:www\.)?t\.me\/nft\/([a-zA-Z0-9_-]+)\/?$/i);
  const bareSlug = input.match(/^([a-zA-Z][a-zA-Z0-9_-]*-\\d{1,12})$/)?.[1];\n  const slug = link?.[1] ?? (input.startsWith("t.me/nft/") ? input.slice("t.me/nft/".length).replace(/\/$/, "") : bareSlug ?? null);
  if (slug && /^[a-zA-Z0-9_-]{3,128}$/.test(slug)) return { kind: "gift" as const, slug };
  if (/^@[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(input)) return { kind: "username" as const, value: input.toLowerCase() };
  if (/^\+?888[\s-]*[0-9][\s-]*[0-9][\s-]*[0-9][\s-]*[0-9][\s-]*[0-9][\s-]*[0-9]+$/.test(input)) {
    return { kind: "phone_number" as const, value: `+${input.replace(/\D/g, "")}` };
  }
  if (/^-?[0-9]+:[0-9a-fA-F]{64}$/.test(input)) return { kind: "address" as const, value: input.toLowerCase() };
  return null;
}

async function readTonNft(address: string, apiKey: string) {
  const params = new URLSearchParams({ address, limit: "1", offset: "0" });
  const response = await fetch(`https://toncenter.com/api/v3/nft/items?${params}`, {
    headers: apiKey ? { "X-API-Key": apiKey } : {},
  });
  if (!response.ok) throw new Error(`TONCENTER_HTTP_${response.status}`);
  const payload = await response.json() as TonNftResponse;
  const nft = payload.nft_items?.find((item) => item.address);
  if (!nft?.address || nft.init !== true) throw new Error("NFT_NOT_FOUND_OR_NOT_INITIALIZED");
  const itemAddress = nft.address;
  const content = nft.content ?? {};
  const tokenInfo = payload.metadata?.[itemAddress]?.token_info?.[0];
  const imageUrl = str(tokenInfo?.image) ?? str(content.image) ?? str(content.image_url);
  const name = str(tokenInfo?.name) ?? str(content.name);
  const description = str(tokenInfo?.description) ?? str(content.description) ?? "";
  return {
    address: itemAddress,
    collection_address: str(nft.collection_address),
    item_index: nft.index === undefined ? null : String(nft.index),
    owner_address: str(nft.owner_address),
    name,
    description,
    image_url: imageUrl,
    verified_on_chain: true,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const origin = req.headers.get("Origin");
  if (origin && origin !== "https://ton-marketplace-cvj.pages.dev") {
    return json({ error: "ORIGIN_NOT_ALLOWED" }, 403);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "SERVER_CONFIG_MISSING" }, 500);

    const authorization = req.headers.get("Authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "AUTH_REQUIRED" }, 401);

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await authClient.auth.getUser(token);
    if (authError || auth.user?.id !== ADMIN_USER_ID) return json({ error: "ADMIN_ONLY" }, 403);

    const body = await req.json().catch(() => null) as { identifier?: unknown } | null;
    if (!body || typeof body.identifier !== "string" || body.identifier.length > 256) {
      return json({ error: "INVALID_IDENTIFIER" }, 400);
    }
    const parsed = parseInput(body.identifier);
    if (!parsed) return json({ error: "UNSUPPORTED_IDENTIFIER", message: "请输入 @用户名、+888号码、Telegram 礼物链接/slug，或 TON NFT 原始地址。" }, 400);

    const tonApiKey = Deno.env.get("TONCENTER_API_KEY") ?? "";
    if (parsed.kind === "gift") {
      const portalsKey = Deno.env.get("PORTALS_API_KEY") ?? "";
      if (!portalsKey) {
        return json({
          error: "PORTALS_API_KEY_REQUIRED",
          message: "礼物链接已识别，但自动解析需要 Portals Partner API。请在 Portals 的 Partner API 页面创建密钥，并添加到 Supabase Edge Function Secret：PORTALS_API_KEY。",
          telegram_url: `https://t.me/nft/${parsed.slug}`,
          slug: parsed.slug,
        }, 503);
      }

      const url = new URL("https://portal-market.com/partners/nfts/search");
      url.searchParams.set("tg_ids", parsed.slug);
      url.searchParams.set("mint_status", "minted");
      url.searchParams.set("limit", "10");
      const response = await fetch(url, { headers: { Authorization: `partners ${portalsKey}` } });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        return json({ error: response.status === 401 ? "PORTALS_KEY_INVALID" : response.status === 403 ? "PORTALS_SUBSCRIPTION_REQUIRED" : "PORTALS_LOOKUP_FAILED", detail }, response.status === 429 ? 429 : 502);
      }
      const result = await response.json() as { results?: PortalsGift[] };
      const gifts = result.results ?? [];
      const gift = gifts.find((item) => item.tg_id === parsed.slug);
      if (!gift) return json({ error: "GIFT_NOT_FOUND_OR_NOT_MINTED", message: "未找到该礼物，或它尚未铸造为 TON NFT。", slug: parsed.slug }, 404);
      if (!gift.ton_address) return json({ error: "GIFT_NOT_MINTED", message: "该 Telegram 礼物尚无 TON 链上 NFT 地址。", slug: parsed.slug }, 409);

      const chain = await readTonNft(gift.ton_address, tonApiKey);
      return json({
        success: true,
        type: "gift",
        canonical_name: `#${gift.external_collection_number ?? parsed.slug}`,
        telegram_url: `https://t.me/nft/${parsed.slug}`,
        telegram_name: gift.name ?? null,
        telegram_image_url: gift.photo_url ?? null,
        ...chain,
        image_url: chain.image_url ?? gift.photo_url ?? null,
        source: chain.image_url ? "ton_chain" : "portals_fallback",
        attributes: gift.attributes ?? [],
      });
    }

    if (parsed.kind === "username" || parsed.kind === "phone_number") {
      return json({
        error: "IDENTIFIER_INDEX_REQUIRED",
        message: parsed.kind === "username"
          ? "已识别用户名格式，但要把 @用户名反查为 NFT 地址，需要接入用户名 Collection 索引服务。"
          : "已识别 888 号码格式，但要反查 NFT 地址，需要接入号码 Collection 索引服务。",
        type: parsed.kind,
        identifier: parsed.value,
      }, 503);
    }

    const chain = await readTonNft(parsed.value, tonApiKey);
    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: allowlist, error: allowlistError } = await service
      .from("telegram_nft_collection_allowlist")
      .select("asset_type,collection_address")
      .eq("enabled", true)
      .eq("network", "-239");
    if (allowlistError) return json({ error: "COLLECTION_ALLOWLIST_READ_FAILED" }, 500);
    const matched = (allowlist ?? []).find((row: { collection_address: string }) =>
      row.collection_address.toLowerCase() === (chain.collection_address ?? "").toLowerCase()
    );
    if (!matched) return json({ error: "COLLECTION_NOT_ALLOWLISTED", message: "NFT 存在于 TON 链上，但其 Collection 不在商城已核验的 Telegram 官方 Collection 白名单中。" }, 409);

    return json({ success: true, type: matched.asset_type, ...chain, source: "ton_chain" });
  } catch (error) {
    console.error("admin-resolve-nft:", error);
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "NFT_RESOLUTION_FAILED", message: message.slice(0, 240) }, 502);
  }
});
