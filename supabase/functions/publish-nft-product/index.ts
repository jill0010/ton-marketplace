import { createClient } from "@supabase/supabase-js";
import { authenticateVerifiedWallet } from "../_shared/auth.ts";
import { normalizeTonAddress } from "../_shared/ton-address.ts";
import { tonApiGet } from "../_shared/tonapi.ts";
import { handleCors, jsonResponse } from "../_shared/http.ts";

type AssetType = "username" | "phone_number" | "gift";

type AllowlistRow = {
  asset_type: AssetType;
  collection_address: string;
};

type TonApiNft = {
  address: string;
  owner?: {
    address?: string;
    is_scam?: boolean;
  } | null;
  collection?: {
    address?: string;
    name?: string;
  } | null;
  verified?: boolean;
  trust?: string;
  is_scam?: boolean;
  metadata?: {
    name?: string;
    description?: string;
    image?: string;
  };
  previews?: Array<{
    resolution?: string;
    url?: string;
  }>;
};

function getSafeImageUrl(nft: TonApiNft): string | null {
  const preview = nft.previews?.find(
    (item) => item.resolution === "500x500",
  ) ?? nft.previews?.[0];

  const candidate = preview?.url || nft.metadata?.image;

  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

Deno.serve(async (request: Request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const walletContext = await authenticateVerifiedWallet(request);

    let body: Record<string, unknown>;

    try {
      const parsed = await request.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return jsonResponse({ error: "Invalid request body" }, 400);
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const itemAddressInput = body.item_address;
    const price = body.price;
    const description = body.description;

    if (
      typeof itemAddressInput !== "string" ||
      itemAddressInput.trim().length === 0
    ) {
      return jsonResponse({ error: "NFT item address is required" }, 400);
    }

    if (
      typeof price !== "number" ||
      !Number.isFinite(price) ||
      price <= 0 ||
      price > 1000000000
    ) {
      return jsonResponse({ error: "Invalid TON price" }, 400);
    }

    if (
      description !== undefined &&
      (typeof description !== "string" || description.length > 2000)
    ) {
      return jsonResponse({ error: "Invalid product description" }, 400);
    }

    const cleanDescription = typeof description === "string"
      ? description.trim()
      : "";

    let itemAddress: string;

    try {
      itemAddress = normalizeTonAddress(itemAddressInput);
    } catch {
      return jsonResponse({ error: "Invalid NFT item address" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Server configuration unavailable");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 每次发布都从 TONAPI 重新读取 NFT 当前链上状态。
    const nft = await tonApiGet<TonApiNft>(
      `/v2/nfts/${encodeURIComponent(itemAddress)}`,
    );

    if (!nft.address || !nft.owner?.address || !nft.collection?.address) {
      return jsonResponse({ error: "NFT ownership data is incomplete" }, 403);
    }

    let chainItemAddress: string;
    let ownerAddress: string;
    let collectionAddress: string;

    try {
      chainItemAddress = normalizeTonAddress(nft.address);
      ownerAddress = normalizeTonAddress(nft.owner.address);
      collectionAddress = normalizeTonAddress(nft.collection.address);
    } catch {
      return jsonResponse({ error: "Invalid NFT chain data" }, 403);
    }

    if (chainItemAddress !== itemAddress) {
      return jsonResponse({ error: "NFT address mismatch" }, 403);
    }

    if (ownerAddress !== walletContext.walletAddress) {
      return jsonResponse(
        { error: "NFT is not owned by your verified wallet" },
        403,
      );
    }

    if (nft.is_scam === true || nft.owner.is_scam === true) {
      return jsonResponse({ error: "NFT is marked as suspicious" }, 403);
    }

    if (nft.trust?.toLowerCase() === "blacklist") {
      return jsonResponse({ error: "NFT is blacklisted" }, 403);
    }

    // TONAPI verified 只作辅助信号，不能替代官方 Collection 白名单。
    if (nft.verified !== true) {
      return jsonResponse({ error: "NFT verification failed" }, 403);
    }

    // 官方来源只由服务端白名单决定。
    const { data: collection, error: collectionError } = await supabase
      .from("telegram_nft_collection_allowlist")
      .select("asset_type, collection_address")
      .eq("network", "-239")
      .eq("collection_address", collectionAddress)
      .eq("enabled", true)
      .maybeSingle();

    if (collectionError) {
      throw new Error("Unable to verify official NFT collection");
    }

    if (!collection) {
      return jsonResponse({
        error: "This NFT collection is not an approved Telegram collection",
      }, 403);
    }

    const allowlist = collection as AllowlistRow;

    if (
      !["username", "phone_number", "gift"].includes(allowlist.asset_type) ||
      normalizeTonAddress(allowlist.collection_address) !== collectionAddress
    ) {
      return jsonResponse({ error: "Invalid official collection record" }, 403);
    }

    // 防止同一个 NFT 被重复公开上架。
    const { data: existing, error: existingError } = await supabase
      .from("products")
      .select("id")
      .eq("nft_item_address", itemAddress)
      .eq("status", "listed")
      .maybeSingle();

    if (existingError) {
      throw new Error("Unable to check existing NFT listings");
    }

    if (existing) {
      return jsonResponse({ error: "This NFT is already listed" }, 409);
    }

    const name =
      typeof nft.metadata?.name === "string" && nft.metadata.name.trim()
        ? nft.metadata.name.trim().slice(0, 200)
        : itemAddress;

    const imageUrl = getSafeImageUrl(nft);

    const { data: product, error: insertError } = await supabase
      .from("products")
      .insert({
        name,
        type: allowlist.asset_type,
        description: cleanDescription,
        price,
        currency: "TON",
        image_url: imageUrl,
        status: "listed",
        nft_item_address: itemAddress,
        nft_collection_address: collectionAddress,
        nft_owner_wallet: walletContext.walletAddress,
        nft_network: "-239",
        seller_user_id: walletContext.userId,
      })
      .select("id, name, type, price, currency, image_url, status, created_at")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return jsonResponse({ error: "This NFT is already listed" }, 409);
      }

      console.error("NFT product insert failed:", insertError.code);
      throw new Error("Unable to publish NFT product");
    }

    return jsonResponse({
      success: true,
      product,
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (
      message.includes("authorization") ||
      message.includes("session") ||
      message.includes("verified TON mainnet wallet") ||
      message.includes("wallet identity")
    ) {
      return jsonResponse({ error: "Wallet authentication failed" }, 401);
    }

    console.error("publish-nft-product failed:", message);

    return jsonResponse({
      error: "Unable to publish NFT product",
    }, 500);
  }
});
