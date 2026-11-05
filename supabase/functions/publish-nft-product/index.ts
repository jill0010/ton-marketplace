import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { Address, Cell, toNano } from "npm:@ton/core";
import { Buffer } from "node:buffer";

const ALLOWED_ORIGINS = new Set([
  "https://ton-marketplace-cvj.pages.dev",
  "http://localhost:5173",
]);
const TONCENTER_BASE = "https://toncenter.com/api/v2";
const TONCENTER_V3_BASE = "https://toncenter.com/api/v3";
const ALLOWED_FRAGMENT_ITEM_CODE_HASHES = new Set([
  "8b711e6809672c0335dc61d1da1dcc4059c973248af707bd586245085ea70b32",
  "30dcd7d5b6fcf5968c2791e1e31ad732f2672f2986e1d6970eb03cca22d23251",
]);
const UINT64_MAX = (1n << 64n) - 1n;

const cors = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Cache-Control": "no-store",
});

function reply(data: Record<string, unknown>, status: number, origin: string) {
  return Response.json(data, { status, headers: cors(origin) });
}

function serviceKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return keys.default as string | undefined;
}

function requireAddress(value: unknown, field: string): Address {
  if (typeof value !== "string" || value.length > 128) {
    throw new Error("Invalid " + field);
  }
  try {
    const address = Address.parse(value);
    if (address.workChain !== 0) throw new Error("Only TON basechain addresses are supported");
    return address;
  } catch {
    throw new Error("Invalid " + field);
  }
}

function parseUint64(value: unknown, field: string): bigint {
  const raw = String(value ?? "");
  if (!/^\d{1,20}$/.test(raw)) throw new Error("Invalid " + field);
  const parsed = BigInt(raw);
  if (parsed <= 0n || parsed > UINT64_MAX) throw new Error("Invalid " + field);
  return parsed;
}

function parseStackNumber(entry: unknown): bigint {
  if (Array.isArray(entry) && entry[0] === "num" && typeof entry[1] === "string") {
    return BigInt(entry[1]);
  }
  if (entry && typeof entry === "object" && "type" in entry &&
      entry.type === "num" && "value" in entry && typeof entry.value === "string") {
    return BigInt(entry.value);
  }
  throw new Error("TON Center returned an unexpected getter stack value");
}

async function runGetMethod(address: string, method: string, stack: unknown[] = []) {
  const apiKey = Deno.env.get("TONCENTER_API_KEY");
  if (!apiKey) throw new Error("TONCENTER_API_KEY is not configured");
  const response = await fetch(TONCENTER_BASE + "/runGetMethod", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({ address, method, stack }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("TON Center getter request failed (" + response.status + ")");
  const data = await response.json();
  if (data?.ok !== true) throw new Error("TON Center getter execution failed");
  const values = data.stack ?? data.result?.stack;
  if (!Array.isArray(values) || values.length !== 1) {
    throw new Error("TON Center getter returned an unexpected stack");
  }
  return parseStackNumber(values[0]);
}

async function runGetMethodCell(address: string, method: string, stack: unknown[] = []): Promise<Cell> {
  const apiKey = Deno.env.get("TONCENTER_API_KEY");
  if (!apiKey) throw new Error("TONCENTER_API_KEY is not configured");
  const response = await fetch(TONCENTER_BASE + "/runGetMethod", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({ address, method, stack }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("TON Center getter request failed (" + response.status + ")");
  const data = await response.json();
  if (data?.ok !== true) throw new Error("TON Center getter execution failed");
  const values = data.stack ?? data.result?.stack;
  if (!Array.isArray(values) || values.length !== 1) {
    throw new Error("TON Center cell getter returned an unexpected stack");
  }

  const entry = values[0];
  let bytes: string | undefined;
  if (Array.isArray(entry) && entry[0] === "cell") {
    const value = entry[1];
    if (typeof value === "string") bytes = value;
    else if (value && typeof value === "object" && "bytes" in value && typeof value.bytes === "string") {
      bytes = value.bytes;
    }
  } else if (entry && typeof entry === "object" && "type" in entry && entry.type === "cell" && "value" in entry) {
    const value = entry.value;
    if (typeof value === "string") bytes = value;
    else if (value && typeof value === "object" && "bytes" in value && typeof value.bytes === "string") {
      bytes = value.bytes;
    }
  }
  if (!bytes) throw new Error("TON Center returned an invalid escrow record cell");
  const roots = Cell.fromBoc(Buffer.from(bytes, "base64"));
  if (roots.length !== 1) throw new Error("TON Center returned an invalid escrow record BoC");
  return roots[0];
}

function parseEscrowRecord(cell: Cell) {
  const slice = cell.beginParse();
  const escrowId = slice.loadUintBig(64);
  const nftItem = slice.loadAddress();
  const seller = slice.loadAddress();
  const productId = slice.loadUintBig(64);
  const status = slice.loadUint(8);
  const queryId = slice.loadUintBig(64);
  const extra = slice.loadRef().beginParse();
  const collection = extra.loadAddress();
  const itemIndex = extra.loadUintBig(256);
  const kind = extra.loadUint(8);
  extra.endParse();
  slice.endParse();
  if (!nftItem || !seller || !collection) throw new Error("Escrow record contains an invalid address");
  return {
    escrowId,
    nftItem: nftItem.toRawString(),
    seller: seller.toRawString(),
    productId,
    status,
    queryId,
    collection: collection.toRawString(),
    itemIndex,
    kind,
  };
}

function parseMarketplaceProduct(cell: Cell) {
  const slice = cell.beginParse();
  const id = slice.loadUintBig(64);
  const seller = slice.loadAddress();
  const nftItem = slice.loadAddress();
  const price = slice.loadCoins();
  const escrowId = slice.loadUintBig(64);
  const queryId = slice.loadUintBig(64);
  slice.loadUintBig(64); // refundQueryId
  const status = slice.loadUint(8);
  const createdAt = slice.loadUint(32);
  const extra = slice.loadRef().beginParse();
  const collection = extra.loadAddress();
  const itemIndex = extra.loadUintBig(256);
  const kind = extra.loadUint(8);
  extra.endParse();
  slice.endParse();

  if (!seller || !nftItem || !collection) {
    throw new Error("Marketplace product record contains an invalid address");
  }
  return {
    id,
    seller: seller.toRawString(),
    nftItem: nftItem.toRawString(),
    price,
    escrowId,
    queryId,
    status,
    createdAt,
    collection: collection.toRawString(),
    itemIndex,
    kind,
  };
}

function hashHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.startsWith("0x") ? value.slice(2) : value;
  if (/^[0-9a-f]{64}$/i.test(normalized)) return normalized.toLowerCase();
  try {
    const decoded = Buffer.from(normalized, "base64");
    return decoded.length === 32 ? decoded.toString("hex") : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) return new Response("Forbidden", { status: 403 });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply({ success: false, error: "Method not allowed" }, 405, origin);

  try {
    const authToken = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!authToken) return reply({ success: false, error: "Authentication required" }, 401, origin);

    const url = Deno.env.get("SUPABASE_URL");
    const publishable = Deno.env.get("SUPABASE_ANON_KEY") ??
      JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default;
    const secret = serviceKey();
    const apiKey = Deno.env.get("TONCENTER_API_KEY");
    const marketplaceValue = Deno.env.get("MARKETPLACE_V2_ADDRESS");
    const escrowValue = Deno.env.get("NFT_ESCROW_V2_ADDRESS");
    if (!url || !publishable || !secret || !apiKey || !marketplaceValue || !escrowValue) {
      return reply({ success: false, code: "MARKETPLACE_V2_NOT_CONFIGURED", error: "Marketplace V2 mainnet contracts are not configured; NFT listings remain disabled." }, 503, origin);
    }

    const auth = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await auth.auth.getUser(authToken);
    if (authError || !authData.user || authData.user.is_anonymous !== true) {
      return reply({ success: false, error: "A valid anonymous seller session is required" }, 401, origin);
    }

    const body = await req.json();
    const sellerAddress = requireAddress(body?.wallet_address, "wallet address");
    const nftItem = requireAddress(body?.item_address, "NFT Item address");
    const collection = requireAddress(body?.collection_address, "NFT collection address");
    const marketplace = requireAddress(marketplaceValue, "Marketplace V2 address");
    const escrow = requireAddress(escrowValue, "NFT Escrow V2 address");
    const productId = parseUint64(body?.product_id, "product_id");
    const queryId = parseUint64(body?.query_id, "query_id");
    const requestedEscrowId = parseUint64(body?.escrow_id, "escrow_id");
    const itemIndexRaw = String(body?.item_index ?? "");
    if (!/^\d{1,78}$/.test(itemIndexRaw)) return reply({ success: false, error: "Invalid NFT item index" }, 400, origin);
    const itemIndex = BigInt(itemIndexRaw);
    if (itemIndex < 0n || itemIndex >= (1n << 256n)) return reply({ success: false, error: "Invalid NFT item index" }, 400, origin);

    const kindMap: Record<string, number> = { username: 1, phone_number: 2, gift: 3 };
    const assetType = typeof body?.kind === "string" ? body.kind : "";
    const kind = kindMap[assetType];
    if (!kind) return reply({ success: false, error: "Unsupported Telegram NFT type" }, 400, origin);

    const priceRaw = String(body?.price ?? "");
    let priceNano: bigint;
    try {
      priceNano = toNano(priceRaw);
    } catch {
      return reply({ success: false, error: "Invalid GRAM listing price" }, 400, origin);
    }
    if (priceNano <= 0n || priceNano > toNano("1000000000")) {
      return reply({ success: false, error: "GRAM listing price is outside the allowed range" }, 400, origin);
    }

    const requestedName = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
    const requestedDescription = typeof body?.description === "string"
      ? body.description.trim().slice(0, 2000)
      : "";

    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const sellerRaw = sellerAddress.toRawString();
    const nftRaw = nftItem.toRawString();
    const collectionRaw = collection.toRawString();
    const marketplaceRaw = marketplace.toRawString();
    const escrowRaw = escrow.toRawString();

    const { data: wallet, error: walletError } = await admin
      .from("ton_verified_wallets")
      .select("wallet_address, network")
      .eq("user_id", authData.user.id)
      .eq("network", "-239")
      .maybeSingle();
    if (walletError || !wallet) return reply({ success: false, code: "WALLET_NOT_VERIFIED", error: "Complete TON Proof verification before listing." }, 403, origin);
    if (Address.parse(wallet.wallet_address).toRawString() !== sellerRaw) {
      return reply({ success: false, code: "SELLER_WALLET_MISMATCH", error: "The listing wallet does not match the verified wallet." }, 403, origin);
    }

    const { data: allowlist, error: allowlistError } = await admin
      .from("telegram_nft_collection_allowlist")
      .select("asset_type, collection_address, network, enabled")
      .eq("network", "-239")
      .eq("collection_address", collectionRaw)
      .eq("asset_type", assetType)
      .eq("enabled", true)
      .maybeSingle();
    if (allowlistError || !allowlist) {
      return reply({ success: false, code: "COLLECTION_NOT_APPROVED", error: "This Telegram NFT collection is not approved for marketplace escrow." }, 403, origin);
    }

    const productRecord = parseMarketplaceProduct(await runGetMethodCell(
      marketplaceRaw,
      "productV2",
      [["num", "0x" + productId.toString(16)]],
    ));
    const registeredEscrowId = await runGetMethod(
      escrowRaw,
      "escrowIdForQueryV2",
      [["num", "0x" + queryId.toString(16)]],
    );

    if (
      productRecord.status !== 2 ||
      productRecord.id !== productId ||
      productRecord.seller !== sellerRaw ||
      productRecord.nftItem !== nftRaw ||
      productRecord.price !== priceNano ||
      productRecord.escrowId !== requestedEscrowId ||
      productRecord.queryId !== queryId ||
      productRecord.collection !== collectionRaw ||
      productRecord.itemIndex !== itemIndex ||
      productRecord.kind !== kind ||
      registeredEscrowId !== requestedEscrowId
    ) {
      return reply({ success: false, code: "ESCROW_NOT_CONFIRMED", error: "The Marketplace product and Escrow registration do not yet match this seller, NFT, collection, index, kind, and price." }, 409, origin);
    }

    const escrowRecord = parseEscrowRecord(await runGetMethodCell(
      escrowRaw,
      "escrowRecordV2",
      [["num", "0x" + requestedEscrowId.toString(16)]],
    ));
    if (
      escrowRecord.status !== 1 ||
      escrowRecord.escrowId !== requestedEscrowId ||
      escrowRecord.productId !== productId ||
      escrowRecord.queryId !== queryId ||
      escrowRecord.nftItem !== nftRaw ||
      escrowRecord.seller !== sellerRaw ||
      escrowRecord.collection !== collectionRaw ||
      escrowRecord.itemIndex !== itemIndex ||
      escrowRecord.kind !== kind
    ) {
      return reply({ success: false, code: "ESCROW_RECORD_MISMATCH", error: "The on-chain escrow record does not match this seller, NFT Item, collection, index, and listing. The database listing was not created." }, 409, origin);
    }

    const nftParams = new URLSearchParams({
      address: nftRaw,
      collection_address: collectionRaw,
      limit: "1",
    });
    const nftResponse = await fetch(
      TONCENTER_V3_BASE + "/nft/items?" + nftParams.toString(),
      {
        headers: { Accept: "application/json", "X-API-Key": apiKey },
        signal: AbortSignal.timeout(12000),
      },
    );
    if (!nftResponse.ok) {
      return reply({ success: false, error: "Unable to verify the NFT Item on TON Mainnet" }, 502, origin);
    }
    const nftData = await nftResponse.json();
    const nftItemData = Array.isArray(nftData?.nft_items)
      ? nftData.nft_items.find((item: Record<string, unknown>) => {
        try {
          return Address.parse(String(item.address ?? "")).toRawString() === nftRaw;
        } catch {
          return false;
        }
      })
      : null;
    if (!nftItemData) {
      return reply({ success: false, code: "NFT_ITEM_NOT_FOUND", error: "TON Center could not find this NFT Item in the specified collection." }, 409, origin);
    }

    const ownerValue = nftItemData.owner_address;
    const collectionValue = nftItemData.collection_address;
    if (typeof ownerValue !== "string" || Address.parse(ownerValue).toRawString() !== escrowRaw) {
      return reply({ success: false, code: "NFT_NOT_IN_ESCROW", error: "TON Mainnet does not report the NFT Item as owned by the Marketplace Escrow." }, 409, origin);
    }
    if (typeof collectionValue !== "string" || Address.parse(collectionValue).toRawString() !== collectionRaw) {
      return reply({ success: false, code: "NFT_COLLECTION_MISMATCH", error: "The NFT Item collection does not match the approved collection." }, 409, origin);
    }
    if (
      nftItemData.init !== true ||
      nftItemData.on_sale === true ||
      String(nftItemData.index ?? "") !== itemIndex.toString()
    ) {
      return reply({ success: false, code: "NFT_ITEM_STATE_MISMATCH", error: "The indexed NFT Item state does not match the submitted Item Index." }, 409, origin);
    }

    const itemCodeHash = hashHex(nftItemData.code_hash);
    if (!itemCodeHash || !ALLOWED_FRAGMENT_ITEM_CODE_HASHES.has(itemCodeHash)) {
      return reply({ success: false, code: "NFT_ITEM_CODE_NOT_APPROVED", error: "This NFT Item code hash is not approved by the Marketplace V2 escrow contract." }, 403, origin);
    }

    const metadata = nftData?.metadata && typeof nftData.metadata === "object"
      ? nftData.metadata as Record<string, Record<string, unknown>>
      : {};
    const addressBook = nftData?.address_book && typeof nftData.address_book === "object"
      ? nftData.address_book as Record<string, Record<string, unknown>>
      : {};

    const metadataFor = (targetRaw: string) => {
      for (const [address, value] of Object.entries(metadata)) {
        try {
          if (Address.parse(address).toRawString() === targetRaw) return value;
        } catch {
          continue;
        }
      }
      return undefined;
    };
    const itemMetadata = metadataFor(nftRaw);
    const collectionMetadata = metadataFor(collectionRaw);
    const verifiedMetadata = (
      value: Record<string, unknown> | undefined,
      expectedType: string,
    ) => {
      const info = Array.isArray(value?.token_info)
        ? value.token_info[0] as Record<string, unknown> | undefined
        : undefined;
      return value?.is_indexed === true &&
        info?.type === expectedType &&
        info?.valid === true &&
        info?.is_scam === false &&
        info?.is_nsfw === false
        ? info
        : undefined;
    };
    const itemInfo = verifiedMetadata(itemMetadata, "nft_items");
    const collectionInfo = verifiedMetadata(collectionMetadata, "nft_collections");
    if (!itemInfo || !collectionInfo) {
      return reply({ success: false, code: "NFT_METADATA_NOT_VERIFIED", error: "TON Center has not verified this NFT Item and collection metadata." }, 403, origin);
    }

    if (assetType === "username" || assetType === "phone_number") {
      let hasTeleitem = false;
      for (const [address, entry] of Object.entries(addressBook)) {
        try {
          if (
            Address.parse(address).toRawString() === nftRaw &&
            Array.isArray(entry.interfaces) &&
            entry.interfaces.includes("teleitem")
          ) {
            hasTeleitem = true;
            break;
          }
        } catch {
          continue;
        }
      }
      if (!hasTeleitem) {
        return reply({
          success: false,
          code: "TELEITEM_INTERFACE_MISSING",
          error: "This Telegram collectible does not expose the required teleitem interface.",
        }, 403, origin);
      }
    }

    const content = nftItemData.content && typeof nftItemData.content === "object"
      ? nftItemData.content as Record<string, unknown>
      : {};
    const name = (typeof itemInfo.name === "string" && itemInfo.name.trim()
      ? itemInfo.name.trim()
      : typeof content.name === "string" && content.name.trim()
      ? content.name.trim()
      : requestedName || nftRaw).slice(0, 120);
    const metadataDescription = typeof itemInfo.description === "string"
      ? itemInfo.description
      : typeof content.description === "string"
      ? content.description
      : "";
    const description = (requestedDescription || metadataDescription).slice(0, 2000);
    const imageCandidate = typeof itemInfo.image === "string"
      ? itemInfo.image
      : typeof content.image === "string"
      ? content.image
      : typeof content.image_url === "string"
      ? content.image_url
      : "";
    const imageUrl = imageCandidate.startsWith("https://")
      ? imageCandidate.slice(0, 2048)
      : null;

    const { data: existing, error: existingError } = await admin
      .from("products")
      .select("id, seller_wallet_raw, marketplace_product_id")
      .eq("nft_item_address", nftRaw)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      if (existing.seller_wallet_raw === sellerRaw &&
          String(existing.marketplace_product_id) === productId.toString()) {
        return reply({ success: true, alreadyListed: true, product: { id: existing.id } }, 200, origin);
      }
      return reply({ success: false, code: "NFT_ALREADY_LISTED", error: "This NFT Item already has a marketplace product record." }, 409, origin);
    }

    const now = new Date().toISOString();
    const { data: product, error: insertError } = await admin
      .from("products")
      .insert({
        name,
        type: assetType,
        description,
        price: priceRaw,
        currency: "GRAM",
        image_url: imageUrl,
        status: "listed",
        seller_wallet_raw: sellerRaw,
        nft_item_address: nftRaw,
        collection_address: collectionRaw,
        item_index: itemIndex.toString(),
        marketplace_contract_address: marketplaceRaw,
        marketplace_product_id: productId.toString(),
        marketplace_query_id: queryId.toString(),
        escrow_id: requestedEscrowId.toString(),
        chain_status: "escrowed",
        chain_verified_at: now,
      })
      .select("id, name, price, currency, status")
      .single();

    if (insertError || !product) {
      console.error("Verified Marketplace V2 listing database insert failed", insertError?.message);
      return reply({ success: false, error: "The NFT is escrowed on-chain, but the database listing could not be created. Contact support with the NFT Item address; do not transfer it again." }, 500, origin);
    }

    return reply({
      success: true,
      product: { id: product.id },
      onchain: {
        marketplace_product_id: productId.toString(),
        query_id: queryId.toString(),
        escrow_id: requestedEscrowId.toString(),
        marketplace_product_status: productRecord.status,
        nft_item_code_hash: itemCodeHash,
        verified_at: now,
      },
    }, 200, origin);
  } catch (error) {
    console.error("publish-nft-product verification failed", error);
    return reply({ success: false, error: error instanceof Error ? error.message : "Unable to verify NFT escrow listing" }, 500, origin);
  }
});
