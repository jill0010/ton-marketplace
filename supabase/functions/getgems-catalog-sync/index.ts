import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GETGEMS_API_KEY = Deno.env.get("GETGEMS_API_KEY") ?? "";
const ADMIN_USER_ID = "0744f173-3f36-438f-b265-9cb3be95ad78";
const GETGEMS_BASE = "https://api.getgems.io/public-api";

type AllowlistRow = {
  asset_type: "username" | "phone_number" | "gift";
  collection_address: string;
  enabled: boolean;
};

type ApiItem = Record<string, unknown> & {
  address?: string;
  name?: string;
  image?: string;
  description?: string;
  sale?: Record<string, unknown>;
  updatedAt?: string;
  collectionAddress?: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractItems(payload: unknown): ApiItem[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const response = (root.response && typeof root.response === "object")
    ? root.response as Record<string, unknown>
    : root;
  const items = response.items ?? response.nfts ?? response.data;
  return Array.isArray(items) ? items as ApiItem[] : [];
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asIso(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toListing(item: ApiItem, itemType: AllowlistRow["asset_type"]) {
  const address = asString(item.address);
  const title = asString(item.name);
  if (!address || !title) return null;

  const sale = item.sale && typeof item.sale === "object" ? item.sale : {};
  const saleType = (asString(sale.type) ?? "").toLowerCase();
  const isAuction = saleType.includes("auction") || sale.minBid !== undefined;
  const listingKind = isAuction ? "auction" : "fixed_price";
  const minBid = asString(sale.minBid);
  const currentPrice = isAuction
    ? (asString(sale.lastBidAmount) ?? minBid)
    : (asString(sale.fullPrice) ?? asString(sale.price) ?? asString(sale.amount));
  const currencyValue = (asString(sale.currency) ?? "TON").toUpperCase();
  const currency = currencyValue === "GRAM" ? "GRAM" : "TON";
  const sourceUrl = `https://getgems.io/nft/${encodeURIComponent(address)}`;

  return {
    source: "getgems",
    source_item_id: address,
    item_type: itemType,
    listing_kind: listingKind,
    title: title.slice(0, 256),
    source_url: sourceUrl,
    image_url: asString(item.image),
    currency,
    current_price_nano: currentPrice,
    minimum_bid_nano: isAuction ? minBid : null,
    auction_ends_at: asIso(sale.finishAt),
    source_status: "active",
    source_updated_at: asIso(item.updatedAt),
    synced_at: new Date().toISOString(),
    metadata: {
      collection_address: asString(item.collectionAddress),
      description: asString(item.description),
      sale_type: asString(sale.type),
      last_bid_amount: asString(sale.lastBidAmount),
      last_bid_at: asIso(sale.lastBidAt),
      owner_address: asString(item.ownerAddress),
      actual_owner_address: asString(item.actualOwnerAddress),
    },
  };
}

async function getgemsGet(path: string): Promise<unknown> {
  const response = await fetch(`${GETGEMS_BASE}${path}`, {
    method: "GET",
    headers: {
      accept: "application/json",
      Authorization: GETGEMS_API_KEY,
    },
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 500);
    throw new Error(`GETGEMS_HTTP_${response.status}:${body}`);
  }
  const payload = await response.json();
  if (payload && typeof payload === "object" && "success" in payload && (payload as { success: unknown }).success === false) {
    throw new Error("GETGEMS_API_REPORTED_FAILURE");
  }
  return payload;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  if (!PROJECT_URL || !ANON_KEY || !SERVICE_ROLE_KEY) return json({ error: "SUPABASE_ENV_MISSING" }, 500);

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : authorization.trim();
  if (!token) return json({ error: "AUTH_REQUIRED" }, 401);

  const authClient = createClient(PROJECT_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || authData.user?.id !== ADMIN_USER_ID) return json({ error: "ADMIN_ONLY" }, 403);

  if (!GETGEMS_API_KEY) {
    return json({
      error: "GETGEMS_API_KEY_MISSING",
      message: "Add GETGEMS_API_KEY to Supabase Edge Function secrets before syncing.",
    }, 503);
  }

  const service = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const startedAt = new Date().toISOString();
  const { data: run, error: runInsertError } = await service
    .from("marketplace_catalog_sync_runs")
    .insert({ provider: "getgems", status: "running" })
    .select("id")
    .single();
  if (runInsertError || !run) return json({ error: "SYNC_RUN_CREATE_FAILED" }, 500);

  const categoryCounts: Record<string, number> = {};
  const errors: string[] = [];
  let itemsSeen = 0;
  let itemsUpserted = 0;

  try {
    const { data: allowlist, error: allowlistError } = await service
      .from("telegram_nft_collection_allowlist")
      .select("asset_type,collection_address,enabled")
      .eq("enabled", true)
      .in("asset_type", ["username", "phone_number"]);
    if (allowlistError) throw new Error("COLLECTION_ALLOWLIST_READ_FAILED");

    const collected: Record<string, ReturnType<typeof toListing>[]> = {
      username: [],
      phone_number: [],
      gift: [],
    };

    for (const row of (allowlist ?? []) as AllowlistRow[]) {
      try {
        const payload = await getgemsGet(`/v1/nfts/on-sale/${encodeURIComponent(row.collection_address)}?limit=100`);
        const items = extractItems(payload).slice(0, 100);
        itemsSeen += items.length;
        for (const item of items) {
          const mapped = toListing(item, row.asset_type);
          if (mapped && collected[row.asset_type].length < 100) collected[row.asset_type].push(mapped);
        }
      } catch (error) {
        errors.push(`${row.asset_type}:${String(error).slice(0, 180)}`);
      }
    }

    try {
      const giftPayload = await getgemsGet("/v1/nfts/offchain/on-sale/gifts");
      const giftItems = extractItems(giftPayload).slice(0, 100);
      itemsSeen += giftItems.length;
      for (const item of giftItems) {
        const mapped = toListing(item, "gift");
        if (mapped && collected.gift.length < 100) collected.gift.push(mapped);
      }
    } catch (error) {
      errors.push(`gift:${String(error).slice(0, 180)}`);
    }

    const allRows = Object.values(collected).flat().filter((row): row is NonNullable<typeof row> => row !== null);
    for (const category of ["username", "phone_number", "gift"]) {
      categoryCounts[category] = collected[category].length;
    }

    if (allRows.length > 0) {
      const { data, error } = await service
        .from("marketplace_source_listings")
        .upsert(allRows, { onConflict: "source,source_item_id" })
        .select("id");
      if (error) throw new Error(`CATALOG_UPSERT_FAILED:${error.message}`);
      itemsUpserted = data?.length ?? allRows.length;
    }

    const status = errors.length === 0 ? "succeeded" : (itemsUpserted > 0 ? "partial" : "failed");
    await service.from("marketplace_catalog_sync_runs").update({
      status,
      items_seen: itemsSeen,
      items_upserted: itemsUpserted,
      categories: categoryCounts,
      error_code: errors.length ? errors.join(" | ").slice(0, 1000) : null,
      finished_at: new Date().toISOString(),
    }).eq("id", run.id);

    return json({
      success: errors.length === 0,
      provider: "getgems",
      limit_per_category: 100,
      categories: categoryCounts,
      items_seen: itemsSeen,
      items_upserted: itemsUpserted,
      warnings: errors,
      started_at: startedAt,
    }, errors.length && itemsUpserted === 0 ? 502 : 200);
  } catch (error) {
    await service.from("marketplace_catalog_sync_runs").update({
      status: "failed",
      items_seen: itemsSeen,
      items_upserted: itemsUpserted,
      categories: categoryCounts,
      error_code: String(error).slice(0, 1000),
      finished_at: new Date().toISOString(),
    }).eq("id", run.id);
    return json({ error: "SYNC_FAILED", detail: String(error).slice(0, 500) }, 500);
  }
});
