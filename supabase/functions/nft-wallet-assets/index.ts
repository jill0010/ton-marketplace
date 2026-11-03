import { createClient } from "@supabase/supabase-js";
import { normalizeTonAddress } from "../_shared/ton-address.ts";
import {
  type AddressBookEntry,
  type AddressMetadata,
  type AllowlistRow,
  buildAllowedCollections,
  getAddressMetadata,
  hasTeleitemInterface,
  isVerifiedMetadata,
  isWalletOwner,
  type TokenInfo,
} from "../_shared/telegram-nft-validation.ts";
import { tonCenterGet } from "../_shared/toncenter.ts";
import { handleCors, jsonResponse } from "../_shared/http.ts";

type TonCenterNft = {
  address?: string;
  collection_address?: string;
  owner_address?: string;
  init?: boolean;
  on_sale?: boolean;
  content?: Record<string, unknown>;
};

type TonCenterNftResponse = {
  nft_items?: TonCenterNft[];
  address_book?: Record<string, AddressBookEntry>;
  metadata?: Record<string, AddressMetadata>;
};

function getString(
  value: unknown,
): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getTokenInfo(
  metadata: Record<string, AddressMetadata>,
  address: string,
): TokenInfo | undefined {
  return getAddressMetadata(metadata, address)?.token_info?.[0];
}
Deno.serve(async (request: Request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    // NFT ownership is public on-chain data. A connected wallet address is
    // sufficient for this read-only lookup; listing and escrow operations
    // continue to require their own server-side wallet proof authorization.
    const body = await request.json().catch(() => null) as
      | { wallet_address?: unknown }
      | null;
    if (
      !body ||
      typeof body.wallet_address !== "string" ||
      body.wallet_address.length > 128
    ) {
      return jsonResponse({ error: "A valid wallet_address is required" }, 400);
    }

    let walletAddress: string;
    try {
      walletAddress = normalizeTonAddress(body.wallet_address);
    } catch {
      return jsonResponse({ error: "Invalid TON wallet address" }, 400);
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

    const { data: allowlist, error: allowlistError } = await supabase
      .from("telegram_nft_collection_allowlist")
      .select("asset_type, collection_address, network, enabled")
      .eq("network", "-239")
      .eq("enabled", true);

    if (allowlistError) {
      throw new Error("Unable to load official collection allowlist");
    }

    const allowedCollections = buildAllowedCollections(
      (allowlist ?? []) as AllowlistRow[],
    );

    if (allowedCollections.size === 0) {
      return jsonResponse({
        success: true,
        items: [],
        truncated: false,
        message: "No verified official Telegram NFT collections are enabled",
      });
    }

    const collected: TonCenterNft[] = [];
    const collectedMetadata: Record<string, AddressMetadata> = {};
    const collectedAddressBook: Record<string, AddressBookEntry> = {};

    const pageSize = 1000;
    const maxPages = 10;
    let truncated = false;

    for (let page = 0; page < maxPages; page++) {
      const params = new URLSearchParams({
        owner_address: walletAddress,
        limit: String(pageSize),
        offset: String(page * pageSize),
        include_on_sale: "false",
      });

      const result = await tonCenterGet<TonCenterNftResponse>(
        `/nft/items?${params.toString()}`,
      );

      const pageItems = result.nft_items ?? [];
      collected.push(...pageItems);

      if (result.metadata) {
        Object.assign(collectedMetadata, result.metadata);
      }

      if (result.address_book) {
        Object.assign(collectedAddressBook, result.address_book);
      }

      if (pageItems.length < pageSize) {
        break;
      }

      if (page === maxPages - 1) {
        truncated = true;
      }
    }

    const items = [];

    for (const nft of collected) {
      if (
        !nft.address ||
        !nft.owner_address ||
        !nft.collection_address ||
        nft.init !== true ||
        nft.on_sale === true
      ) {
        continue;
      }

      let itemAddress: string;
      let collectionAddress: string;

      try {
        itemAddress = normalizeTonAddress(nft.address);
        collectionAddress = normalizeTonAddress(nft.collection_address);
      } catch {
        continue;
      }

      if (!isWalletOwner(nft.owner_address, walletAddress)) continue;

      const assetType = allowedCollections.get(collectionAddress);
      if (!assetType) continue;

      const itemMetadata = getAddressMetadata(collectedMetadata, itemAddress);
      const collectionMetadata = getAddressMetadata(
        collectedMetadata,
        collectionAddress,
      );

      if (
        !isVerifiedMetadata(itemMetadata, "nft_items") ||
        !isVerifiedMetadata(collectionMetadata, "nft_collections")
      ) {
        continue;
      }

      if (
        assetType === "phone_number" &&
        !hasTeleitemInterface(collectedAddressBook, itemAddress)
      ) {
        continue;
      }

      const itemInfo = getTokenInfo(
        collectedMetadata,
        itemAddress,
      );

      const content = nft.content ?? {};

      const name = itemInfo?.name ||
        getString(content.name) ||
        itemAddress;

      const description = itemInfo?.description ||
        getString(content.description) ||
        "";

      const imageUrl = itemInfo?.image ||
        getString(content.image) ||
        getString(content.image_url) ||
        null;

      items.push({
        address: itemAddress,
        collection_address: collectionAddress,
        type: assetType,
        name,
        description,
        image_url: imageUrl,
      });
    }

    return jsonResponse({
      success: true,
      items,
      truncated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("nft-wallet-assets failed:", message);

    return jsonResponse({
      error: "Unable to retrieve Telegram NFT assets",
    }, 500);
  }
});
