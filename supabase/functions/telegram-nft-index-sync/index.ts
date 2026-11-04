import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const ADMIN_USER_ID = "0744f173-3f36-438f-b265-9cb3be95ad78";
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://ton-marketplace-cvj.pages.dev",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const normalize = (type: string, name: string) => type === "username"
  ? name.trim().replace(/^@/, "").toLowerCase()
  : name.replace(/\D/g, "");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const origin = req.headers.get("Origin");
  if (origin && origin !== "https://ton-marketplace-cvj.pages.dev") return json({ error: "ORIGIN_NOT_ALLOWED" }, 403);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const missingEnvironment = [
      !url ? "SUPABASE_URL" : null,
      !anon ? "SUPABASE_ANON_KEY" : null,
      !serviceKey ? "SUPABASE_SERVICE_ROLE_KEY" : null,
    ].filter((name): name is string => Boolean(name));
    if (missingEnvironment.length) {
      console.error("telegram-nft-index-sync missing environment:", missingEnvironment.join(","));
      return json({
        error: "SERVER_CONFIG_MISSING",
        message: "Edge Function 缺少必要环境配置。",
        missing_environment: missingEnvironment,
      }, 503);
    }
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "AUTH_REQUIRED" }, 401);
    const authClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth, error: authError } = await authClient.auth.getUser(token);
    if (authError || auth.user?.id !== ADMIN_USER_ID) return json({ error: "ADMIN_ONLY" }, 403);
    const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: collections, error: collectionError } = await service.from("telegram_nft_collection_allowlist")
      .select("asset_type,collection_address").eq("enabled", true).eq("network", "-239");
    if (collectionError) throw collectionError;
    const results: Array<Record<string, unknown>> = [];
    for (const collection of collections ?? []) {
      const type = collection.asset_type as "username" | "phone_number";
      if (type !== "username" && type !== "phone_number") continue;
      const { data: state } = await service.from("telegram_nft_index_sync_state").select("*")
        .eq("collection_address", collection.collection_address).maybeSingle();
      if (state?.is_complete) {
        results.push({ asset_type: type, complete: true, synced: 0, total_synced: state.items_synced });
        continue;
      }
      let offset = Number.parseInt(state?.cursor ?? "0", 10);
      if (!Number.isFinite(offset) || offset < 0) offset = 0;
      let synced = 0;
      let complete = false;
      let provider = "unknown";
      for (let page = 0; page < 2; page++) {
        const params = new URLSearchParams({ limit: "1000", offset: String(offset) });
        const apiKey = Deno.env.get("TONAPI_API_KEY");
        const tonApiUrl = `https://tonapi.io/v2/nfts/collections/${encodeURIComponent(collection.collection_address)}/items?${params}`;
        let response = await fetch(tonApiUrl, {
          headers: { Accept: "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
          signal: AbortSignal.timeout(25000),
        });
        let payload: { nft_items?: Array<Record<string, unknown>> } | null = null;
        if (response.ok) {
          payload = await response.json() as { nft_items?: Array<Record<string, unknown>> };
          if (!Array.isArray(payload.nft_items)) payload = null;
        }
        if (!payload) {
          console.warn("TonAPI unavailable; falling back to TON Center", response.status);
          const fallbackParams = new URLSearchParams({
            collection_address: collection.collection_address,
            limit: "1000",
            offset: String(offset),
          });
          const centerKey = Deno.env.get("TONCENTER_API_KEY");
          response = await fetch(`https://toncenter.com/api/v3/nft/items?${fallbackParams}`, {
            headers: { Accept: "application/json", ...(centerKey ? { "X-API-Key": centerKey } : {}) },
            signal: AbortSignal.timeout(25000),
          });
          if (!response.ok) throw new Error(`NFT_INDEX_SOURCES_FAILED: TonAPI and TONCenter HTTP ${response.status}`);
          payload = await response.json() as { nft_items?: Array<Record<string, unknown>> };
          if (!Array.isArray(payload.nft_items)) throw new Error("NFT_INDEX_SOURCES_BAD_RESPONSE");
          provider = "toncenter";
        } else {
          provider = "tonapi";
        }
        const items = payload.nft_items ?? [];
        const rows = items.flatMap((item) => {
          const metadata = (item.metadata && typeof item.metadata === "object" ? item.metadata : {}) as Record<string, unknown>;
          const address = typeof item.address === "string" ? item.address : "";
          const name = typeof metadata.name === "string" ? metadata.name.trim()
            : typeof item.name === "string" ? item.name.trim() : "";
          if (!address || !name) return [];
          const normalized = normalize(type, name);
          if (!normalized || (type === "phone_number" && !normalized.startsWith("888"))) return [];
          const previews = Array.isArray(item.previews) ? item.previews as Array<Record<string, unknown>> : [];
          const rawImage = typeof metadata.image === "string" ? metadata.image
            : typeof item.image === "string" ? item.image
            : typeof previews[0]?.url === "string" ? previews[0].url : null;
          const image = rawImage?.startsWith("ipfs://")
            ? "https://ipfs.io/ipfs/" + rawImage.slice(7).replace(/^ipfs\\//, "")
            : rawImage;
          return [{
            nft_address: address,
            asset_type: type,
            collection_address: collection.collection_address,
            nft_name: name,
            normalized_identifier: normalized,
            image_url: image,
            description: typeof metadata.description === "string" ? metadata.description
              : typeof item.description === "string" ? item.description : "",
            attributes: Array.isArray(metadata.attributes) ? metadata.attributes
              : Array.isArray(item.attributes) ? item.attributes : [],
            metadata: item,
            synced_at: new Date().toISOString(),
          }];
        });
        if (rows.length) {
          const { error: upsertError } = await service.from("telegram_nft_items").upsert(rows, { onConflict: "nft_address" });
          if (upsertError) throw upsertError;
          synced += rows.length;
        }
        if (items.length < 1000) {
          complete = true;
          offset += items.length;
          break;
        }
        offset += items.length;
      }
      const { error: stateError } = await service.from("telegram_nft_index_sync_state").upsert({
        collection_address: collection.collection_address,
        asset_type: type,
        cursor: complete ? null : String(offset),
        is_complete: complete,
        items_synced: Number(state?.items_synced ?? 0) + synced,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "collection_address" });
      if (stateError) throw stateError;
      results.push({ asset_type: type, synced, complete, total_synced: Number(state?.items_synced ?? 0) + synced, provider });
    }
    return json({ success: true, results, message: "本次每个 Collection 最多同步 2000 个 NFT；若 complete=false，可再次点击继续同步。" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.error("telegram-nft-index-sync:", message);
    return json({ error: "INDEX_SYNC_FAILED", message: message.slice(0, 300) }, 502);
  }
});
