import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { Address, Cell, toNano } from "npm:@ton/core";
import { Buffer } from "node:buffer";

const ALLOWED_ORIGINS = new Set([
  "https://ton-marketplace-cvj.pages.dev",
  "http://localhost:5173",
]);
const TONCENTER_BASE = "https://toncenter.com/api/v2";
const PUBLISH_OPCODE = 0x71b0000a;
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

function decodePublishBody(bodyBase64: string) {
  const roots = Cell.fromBoc(Buffer.from(bodyBase64, "base64"));
  if (roots.length !== 1) return null;
  const slice = roots[0].beginParse();
  if (slice.loadUint(32) !== PUBLISH_OPCODE) return null;
  const productId = slice.loadUintBig(64);
  const queryId = slice.loadUintBig(64);
  const nftItem = slice.loadAddress();
  const collection = slice.loadAddress();
  const extra = slice.loadRef().beginParse();
  const itemIndex = extra.loadUintBig(256);
  const kind = extra.loadUint(8);
  const price = extra.loadCoins();
  extra.endParse();
  slice.endParse();
  if (!nftItem || !collection) return null;
  return {
    productId,
    queryId,
    nftItem: nftItem.toRawString(),
    collection: collection.toRawString(),
    itemIndex,
    kind,
    price,
  };
}

function hashHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (/^[0-9a-f]{64}$/i.test(value)) return value.toLowerCase();
  try {
    const decoded = Buffer.from(value, "base64");
    return decoded.length === 32 ? decoded.toString("hex") : null;
  } catch {
    return null;
  }
}

async function findPublishTransaction(
  marketplaceRaw: string,
  sellerRaw: string,
  expected: {
    productId: bigint;
    queryId: bigint;
    nftItem: string;
    collection: string;
    itemIndex: bigint;
    kind: number;
    price: bigint;
  },
) {
  const apiKey = Deno.env.get("TONCENTER_API_KEY");
  if (!apiKey) throw new Error("TONCENTER_API_KEY is not configured");
  const response = await fetch(
    TONCENTER_BASE + "/getTransactions?address=" + encodeURIComponent(marketplaceRaw) + "&limit=100",
    { headers: { Accept: "application/json", "X-API-Key": apiKey }, signal: AbortSignal.timeout(15000) },
  );
  if (!response.ok) throw new Error("TON listing transaction lookup failed (" + response.status + ")");
  const data = await response.json();
  if (data?.ok !== true || !Array.isArray(data.result)) {
    throw new Error("TON Center returned an invalid marketplace transaction response");
  }

  const earliest = Date.now() - 24 * 60 * 60 * 1000;
  for (const tx of data.result as Record<string, unknown>[]) {
    const incoming = tx.in_msg as Record<string, unknown> | null;
    if (!incoming || incoming.bounced === true) continue;
    try {
      if (Address.parse(String(incoming.destination ?? "")).toRawString() !== marketplaceRaw) continue;
      if (Address.parse(String(incoming.source ?? "")).toRawString() !== sellerRaw) continue;
    } catch {
      continue;
    }
    const utime = Number(tx.utime);
    if (!Number.isFinite(utime) || utime * 1000 < earliest) continue;
    const description = tx.description as Record<string, unknown> | null;
    if (description?.aborted === true) continue;
    const msgData = incoming.msg_data as Record<string, unknown> | null;
    if (typeof msgData?.body !== "string") continue;
    let decoded: ReturnType<typeof decodePublishBody>;
    try {
      decoded = decodePublishBody(msgData.body);
    } catch {
      continue;
    }
    if (!decoded) continue;
    if (
      decoded.productId !== expected.productId ||
      decoded.queryId !== expected.queryId ||
      decoded.nftItem !== expected.nftItem ||
      decoded.collection !== expected.collection ||
      decoded.itemIndex !== expected.itemIndex ||
      decoded.kind !== expected.kind ||
      decoded.price !== expected.price
    ) continue;
    const txHash = hashHex((tx.transaction_id as Record<string, unknown> | null)?.hash);
    if (!txHash) continue;
    return { txHash, timestamp: new Date(utime * 1000).toISOString() };
  }
  return null;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) return new Response("Forbidden", { status: 403 });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply({ success: false, error: "Method not allowed" }, 405, origin);

  try {
    const authToken = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!authToken) return reply({ success: false, error: "Authentication required" }, 401, origin);

    if (Deno.env.get("MARKETPLACE_V2_LISTING_ENABLED") !== "true") {
      return reply({
        success: false,
        code: "MARKETPLACE_V2_LISTING_PAUSED",
        error: "Marketplace V2 NFT listings remain paused until mainnet deployment and testnet rehearsal are approved.",
      }, 503, origin);
    }

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
      return reply({ success: false, error: "A valid anonymous buyer session is required" }, 401, origin);
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

    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
    const description = typeof body?.description === "string" ? body.description.trim().slice(0, 2000) : "";
    const imageUrl = typeof body?.image_url === "string" && body.image_url.startsWith("https://")
      ? body.image_url.slice(0, 2048)
      : null;
    if (!name) return reply({ success: false, error: "NFT display name is required" }, 400, origin);

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

    const [productStatus, productEscrowId, registeredEscrowId] = await Promise.all([
      runGetMethod(marketplaceRaw, "productStatusV2", [["num", "0x" + productId.toString(16)]]),
      runGetMethod(marketplaceRaw, "productEscrowIdV2", [["num", "0x" + productId.toString(16)]]),
      runGetMethod(escrowRaw, "escrowIdForQueryV2", [["num", "0x" + queryId.toString(16)]]),
    ]);
    if (productStatus !== 2n || productEscrowId <= 0n ||
        productEscrowId !== requestedEscrowId || registeredEscrowId !== requestedEscrowId) {
      return reply({ success: false, code: "ESCROW_NOT_CONFIRMED", error: "The NFT is not yet confirmed as deposited in the Marketplace V2 escrow. Retry after the on-chain callback completes." }, 409, origin);
    }

    const publishTx = await findPublishTransaction(marketplaceRaw, sellerRaw, {
      productId,
      queryId,
      nftItem: nftRaw,
      collection: collectionRaw,
      itemIndex,
      kind,
      price: priceNano,
    });
    if (!publishTx) {
      return reply({ success: false, code: "PUBLISH_TRANSACTION_NOT_FOUND", error: "The Marketplace V2 listing transaction from this verified seller was not found. The database listing was not created." }, 409, origin);
    }

    const tokenResponse = await fetch(TONCENTER_BASE + "/getTokenData", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ address: nftRaw }),
      signal: AbortSignal.timeout(12000),
    });
    if (!tokenResponse.ok) return reply({ success: false, error: "Unable to verify the NFT Item owner on TON Mainnet" }, 502, origin);
    const tokenData = await tokenResponse.json();
    const nftItemData = tokenData?.result ?? tokenData;
    const ownerValue = nftItemData?.owner_address ?? nftItemData?.owner;
    const collectionValue = nftItemData?.collection_address ?? nftItemData?.collection;
    if (typeof ownerValue !== "string" || Address.parse(ownerValue).toRawString() !== escrowRaw) {
      return reply({ success: false, code: "NFT_NOT_IN_ESCROW", error: "TON Mainnet does not report the NFT Item as owned by the Marketplace Escrow." }, 409, origin);
    }
    if (typeof collectionValue === "string" && Address.parse(collectionValue).toRawString() !== collectionRaw) {
      return reply({ success: false, code: "NFT_COLLECTION_MISMATCH", error: "The NFT Item collection does not match the approved collection." }, 409, origin);
    }

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
        price: Number(priceRaw),
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
        listing_tx_hash: publishTx.txHash,
        verified_at: now,
      },
    }, 200, origin);
  } catch (error) {
    console.error("publish-nft-product verification failed", error);
    return reply({ success: false, error: error instanceof Error ? error.message : "Unable to verify NFT escrow listing" }, 500, origin);
  }
});
