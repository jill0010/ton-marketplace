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
  const bareSlug = input.match(/^([a-zA-Z][a-zA-Z0-9_-]*-\d{1,12})$/)?.[1];
  const slug = link?.[1] ?? (input.startsWith("t.me/nft/") ? input.slice("t.me/nft/".length).replace(/\/$/, "") : bareSlug ?? null);
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
    signal: AbortSignal.timeout(12000),
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

      const portalsHeaders = { Authorization: `partners ${portalsKey}` };
      const exactUrl = new URL("https://portal-market.com/partners/nfts/search");
      exactUrl.searchParams.set("tg_ids", parsed.slug);
      exactUrl.searchParams.set("limit", "20");
      let response = await fetch(exactUrl, {
        headers: portalsHeaders,
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        console.error("Portals NFT search failed:", response.status, detail);
        const code = response.status === 401
          ? "PORTALS_KEY_INVALID"
          : response.status === 403
            ? "PORTALS_SUBSCRIPTION_REQUIRED"
            : response.status === 429
              ? "PORTALS_RATE_LIMITED"
              : "PORTALS_LOOKUP_FAILED";
        return json({
          error: code,
          message: response.status === 401
            ? "Portals API Key 无效或已重新签发。"
            : response.status === 403
              ? "Portals Partner API 尚未开通套餐，或套餐已过期。"
              : response.status === 429
                ? "Portals API 请求过于频繁，请稍后重试。"
                : "Portals 礼物查询接口暂时失败。",
          detail,
        }, response.status === 429 ? 429 : 502);
      }

      let result = await response.json() as { results?: PortalsGift[]; total_count?: number };
      let gifts = result.results ?? [];
      let lookupMethod = "tg_ids";
      const slugParts = parsed.slug.toLowerCase().match(/^([a-z0-9_-]+?)-(\\d+)$/);
      if (gifts.length === 0 && slugParts) {
        // Some Portals indexes resolve the Telegram gift slug but not the
        // collection-number pair. Retry by Telegram's collection item number,
        // then verify the collection name locally before accepting a match.
        const collectionSlug = slugParts[1].replace(/[^a-z0-9]/g, "");
        const itemNumber = Number(slugParts[2]);
        const fallbackUrl = new URL("https://portal-market.com/partners/nfts/search");
        fallbackUrl.searchParams.set("external_collection_number", String(itemNumber));
        fallbackUrl.searchParams.set("mint_status", "all");
        fallbackUrl.searchParams.set("limit", "100");
        response = await fetch(fallbackUrl, {
          headers: portalsHeaders,
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) {
          const detail = (await response.text()).slice(0, 500);
          console.error("Portals number fallback failed:", response.status, detail);
          return json({ error: "PORTALS_LOOKUP_FAILED", message: "Portals 礼物编号备用查询失败。", detail }, 502);
        }
        result = await response.json() as { results?: PortalsGift[]; total_count?: number };
        const numberResults = result.results ?? [];
        gifts = numberResults.filter((item) => {
          const numberMatches = Number(item.external_collection_number) === itemNumber;
          const normalizedName = (item.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
          return numberMatches && normalizedName === collectionSlug;
        });
        lookupMethod = "external_collection_number_and_collection_name";
      }

      const normalizedSlug = parsed.slug.toLowerCase();
      const returnedIds = gifts.map((item) => str(item.tg_id)).filter((value): value is string => Boolean(value));
      console.log("Portals gift search result", JSON.stringify({ requested_slug: parsed.slug, lookup_method: lookupMethod, total_count: result.total_count ?? null, result_count: gifts.length, returned_tg_ids: returnedIds.slice(0, 20) }));
      const exactGift = gifts.find((item) => (item.tg_id ?? "").toLowerCase() === normalizedSlug);
      const gift = exactGift ?? (lookupMethod === "external_collection_number_and_collection_name" && gifts.length === 1 ? gifts[0] : undefined);
      if (!gift) return json({ error: "GIFT_NOT_FOUND_OR_NOT_MINTED", message: "Portals 未找到与礼物链接对应的项目。已先按 Telegram 礼物 slug 查询；无结果时再按礼物编号和系列名称精确交叉匹配。", slug: parsed.slug, detail: { lookup_method: lookupMethod, result_count: gifts.length, total_count: result.total_count ?? null, returned_tg_ids: returnedIds.slice(0, 20) } }, 404);
      if (!gift.ton_address) return json({ error: "GIFT_NOT_MINTED", message: "该 Telegram 礼物尚无 TON 链上 NFT 地址。", slug: parsed.slug }, 409);

      let chain: Awaited<ReturnType<typeof readTonNft>>;
      try {
        chain = await readTonNft(gift.ton_address, tonApiKey);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "UNKNOWN_CHAIN_ERROR";
        console.error("TON NFT verification failed:", detail);
        return json({
          error: "TON_NFT_VERIFICATION_FAILED",
          message: "Portals 已找到礼物，但读取 TON 链上 NFT 失败。请稍后重试。",
          detail,
          telegram_url: `https://t.me/nft/${parsed.slug}`,
          portals_image_url: gift.photo_url ?? null,
          ton_address: gift.ton_address,
        }, 502);
      }
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
