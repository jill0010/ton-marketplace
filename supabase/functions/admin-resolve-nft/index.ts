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


function decodeHtml(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).trim();
}

function metaContent(html: string, key: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const property = tag.match(/(?:property|name)=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (property !== key.toLowerCase()) continue;
    const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
    if (content) return decodeHtml(content);
  }
  return null;
}

function extractGiftPageFields(html: string) {
  const title = metaContent(html, "og:title") ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;
  const description = metaContent(html, "og:description") ?? metaContent(html, "description") ?? "";
  const image = metaContent(html, "og:image") ?? metaContent(html, "twitter:image");
  const video = metaContent(html, "og:video") ?? metaContent(html, "og:video:secure_url");
  const plain = decodeHtml(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  const find = (label: string) => {
    const match = plain.match(new RegExp(label + "\\s*:?\\s*([^|•]{1,80})", "i"));
    return match?.[1]?.trim() ?? null;
  };
  const attributes: Record<string, string | null> = {
    model: find("Model"),
    backdrop: find("Backdrop"),
    symbol: find("Symbol"),
    quantity: find("Quantity"),
    number: find("Number"),
  };
  return {
    name: title ? decodeHtml(title).replace(/\s*[-|]\s*Telegram.*$/i, "").trim().slice(0, 256) : null,
    description: description.slice(0, 2000),
    image_url: image,
    animated_url: video,
    attributes,
    page_text: plain.slice(0, 6000),
  };
}

async function readTelegramGiftPage(slug: string) {
  const url = "https://t.me/nft/" + encodeURIComponent(slug);
  const response = await fetch(url, {
    headers: { "Accept": "text/html,application/xhtml+xml", "Accept-Language": "en", "User-Agent": "Mozilla/5.0 (compatible; TONMarketplace/1.0)" },
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("TELEGRAM_GIFT_PAGE_HTTP_" + response.status);
  const html = (await response.text()).slice(0, 2_000_000);
  const fields = extractGiftPageFields(html);
  if (!fields.image_url && !fields.name && !fields.description) throw new Error("TELEGRAM_GIFT_PAGE_METADATA_MISSING");
  for (const key of ["image_url", "animated_url"] as const) {
    const candidate = fields[key];
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate, url);
      if (parsed.protocol !== "https:" || !(parsed.hostname === "t.me" || parsed.hostname.endsWith(".telegram.org") || parsed.hostname.endsWith(".telesco.pe"))) {
        fields[key] = null;
      } else fields[key] = parsed.toString();
    } catch { fields[key] = null; }
  }
  return { url, ...fields };
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
      try {
        const page = await readTelegramGiftPage(parsed.slug);
        const number = parsed.slug.match(/-(\d+)$/)?.[1] ?? null;
        return json({
          success: true,
          type: "gift",
          address: null,
          collection_address: null,
          item_index: number,
          name: page.name ?? parsed.slug,
          description: page.description,
          image_url: page.image_url,
          animated_url: page.animated_url,
          telegram_url: page.url,
          telegram_name: page.name,
          attributes: page.attributes,
          metadata: { source: "telegram_web", page_text: page.page_text },
          verified_on_chain: false,
          source: "telegram_web",
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : "TELEGRAM_GIFT_PAGE_LOOKUP_FAILED";
        console.error("Telegram gift page lookup failed:", detail);
        return json({
          error: "TELEGRAM_GIFT_PAGE_LOOKUP_FAILED",
          message: "无法从 Telegram 礼物公开页面读取图片或商品资料；本次未调用 Portals API。",
          detail,
          telegram_url: "https://t.me/nft/" + parsed.slug,
        }, 502);
      }
    }

    if (parsed.kind === "username" || parsed.kind === "phone_number") {
      const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const normalized = parsed.kind === "username" ? parsed.value.replace(/^@/, "").toLowerCase() : parsed.value.replace(/\D/g, "");
      const { data: indexed, error: indexError } = await service
        .from("telegram_nft_items")
        .select("nft_address,collection_address,nft_name,image_url,description,attributes,metadata")
        .eq("asset_type", parsed.kind)
        .eq("normalized_identifier", normalized)
        .limit(2);
      if (indexError) return json({ error: "NFT_INDEX_READ_FAILED", message: "读取 Telegram NFT 索引失败。" }, 500);
      if (!indexed?.length) {
        const { data: syncState } = await service.from("telegram_nft_index_sync_state")
          .select("is_complete,items_synced").eq("asset_type", parsed.kind).limit(1).maybeSingle();
        return json({
          error: "IDENTIFIER_INDEX_REQUIRED",
          message: "当前索引尚未收录该标识。请先在管理员快速上传页面执行“同步用户名/888号码 NFT 索引”，同步完成后重新识别。",
          type: parsed.kind,
          identifier: parsed.value,
          index_items_synced: syncState?.items_synced ?? 0,
          index_complete: syncState?.is_complete ?? false,
        }, 503);
      }
      if (indexed.length > 1) return json({ error: "NFT_IDENTIFIER_AMBIGUOUS", message: "索引中存在多个同名 NFT，暂不能自动选择，请使用 NFT 原始地址核对。" }, 409);
      const item = indexed[0];
      const chain = await readTonNft(item.nft_address, tonApiKey);
      if ((chain.collection_address ?? "").toLowerCase() !== item.collection_address.toLowerCase()) {
        return json({ error: "NFT_COLLECTION_MISMATCH", message: "索引记录与 TON 链上 Collection 不一致，已阻止自动发布。" }, 409);
      }
      return json({
        success: true,
        type: parsed.kind,
        address: chain.address,
        collection_address: chain.collection_address,
        item_index: chain.item_index,
        name: item.nft_name,
        description: item.description || chain.description,
        image_url: item.image_url || chain.image_url,
        verified_on_chain: true,
        source: "getgems_index",
        attributes: item.attributes,
        metadata: item.metadata,
      });
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
