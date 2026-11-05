import { createClient } from "@supabase/supabase-js";
import { normalizeTonAddress } from "./shared/ton-address.ts";
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
} from "./shared/telegram-nft-validation.ts";
import { tonCenterGet } from "./shared/toncenter.ts";
import { handleCors, jsonResponse } from "./shared/http.ts";

type TonCenterNft = {
  address?: string;
  index?: number | string;
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

function isOfficialFragmentGift(
  content: Record<string, unknown>,
  itemInfo: TokenInfo | undefined,
  itemMetadata: AddressMetadata | undefined,
  collectionMetadata: AddressMetadata | undefined,
): boolean {
  // Telegram collectible gifts exported through Fragment expose a canonical
  // Fragment gift metadata URI. Require both item and collection to be
  // independently indexed and marked valid/non-scam by TON Center.
  if (
    !isVerifiedMetadata(itemMetadata, "nft_items") ||
    !isVerifiedMetadata(collectionMetadata, "nft_collections")
  ) {
    return false;
  }

  const metadata = itemInfo as (TokenInfo & {
    uri?: unknown;
    external_url?: unknown;
  }) | undefined;
  const candidates = [
    getString(content.uri),
    getString(content.external_url),
    getString(metadata?.uri),
    getString(metadata?.external_url),
  ].filter((value): value is string => Boolean(value));

  return candidates.some((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" &&
        url.hostname === "nft.fragment.com" &&
        /^\/gift\/[A-Za-z0-9_-]+\.json$/.test(url.pathname);
    } catch {
      return false;
    }
  });
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
    const concurrentPages = 3;
    let truncated = false;

    const fetchNftPage = async (page: number) => {
      const params = new URLSearchParams({
        owner_address: walletAddress,
        limit: String(pageSize),
        offset: String(page * pageSize),
        include_on_sale: "false",
      });
      return await tonCenterGet<TonCenterNftResponse>(
        `/nft/items?${params.toString()}`,
      );
    };

    const mergePage = (result: TonCenterNftResponse) => {
      collected.push(...(result.nft_items ?? []));
      if (result.metadata) Object.assign(collectedMetadata, result.metadata);
      if (result.address_book) Object.assign(collectedAddressBook, result.address_book);
      return (result.nft_items ?? []).length;
    };

    // Fetch the first page to determine whether more pages exist, then fetch
    // subsequent pages in small parallel batches to reduce total round trips.
    let lastPageSize = mergePage(await fetchNftPage(0));
    let pagesFetched = 1;

    while (lastPageSize === pageSize && pagesFetched < maxPages) {
      const batchSize = Math.min(concurrentPages, maxPages - pagesFetched);
      const pageNumbers = Array.from(
        { length: batchSize },
        (_, index) => pagesFetched + index,
      );
      const results = await Promise.all(pageNumbers.map(fetchNftPage));

      const pageSizes = results.map((result) => mergePage(result));
      lastPageSize = pageSizes[pageSizes.length - 1] ?? 0;
      pagesFetched += batchSize;

      // A short page marks the end of the result set. Do not request further offsets.
      if (pageSizes.some((size) => size < pageSize)) {
        lastPageSize = 0;
        break;
      }
    }

    if (pagesFetched === maxPages && lastPageSize === pageSize) {
      truncated = true;
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

      const itemIndex = typeof nft.index === "number" && Number.isSafeInteger(nft.index) &&
          nft.index >= 0
        ? String(nft.index)
        : typeof nft.index === "string" && /^\d+$/.test(nft.index)
        ? nft.index
        : null;
      if (itemIndex === null) continue;

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

      const itemInfo = getTokenInfo(collectedMetadata, itemAddress);
      const content = nft.content ?? {};
      // Usernames and +888 numbers use the explicitly verified collection
      // allowlist. Telegram collectible gifts are issued across gift series,
      // so identify them by Fragment's canonical /gift/ metadata URI instead
      // of requiring one hard-coded collection address.
      const assetType = allowedCollections.get(collectionAddress) ??
        (isOfficialFragmentGift(content, itemInfo, itemMetadata, collectionMetadata)
          ? "gift"
          : undefined);
      if (!assetType) continue;

      if (
        assetType === "phone_number" &&
        !hasTeleitemInterface(collectedAddressBook, itemAddress)
      ) {
        continue;
      }

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
        item_index: itemIndex,
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
