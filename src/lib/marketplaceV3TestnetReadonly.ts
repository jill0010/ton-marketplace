import { Address } from "@ton/core";
import { supabase } from "./supabase";

export const V3_TESTNET_READONLY_METHODS = [
  "purchaseSchemaVersionV3",
  "nextOrderIdV3",
  "nextProductIdV2",
  "nextQueryIdV2",
  "escrowConfiguredV2",
  "treasuryConfiguredV2",
  "marketplaceReserveCoordinatorConfiguredV3",
  "productStatusV2",
  "productEscrowIdV2",
  "productQueryIdV2",
  "productV2",
  "orderIdForProductV2",
  "marketplaceReserveStatusV3",
  "get_nft_data",
  "escrowV2",
] as const;

export type V3TestnetReadonlyMethod = typeof V3_TESTNET_READONLY_METHODS[number];
export type V3TestnetReadonlyResult = Readonly<{
  network: "testnet";
  contract_address: string;
  method: V3TestnetReadonlyMethod;
  product_id: string | null;
  order_id: string | null;
  nft_item_address: string | null;
  stack: unknown[];
  observed_at: string;
  verified_purchase_eligibility: false;
}>;

const PRODUCT_METHODS = new Set<V3TestnetReadonlyMethod>([
  "productStatusV2",
  "productEscrowIdV2",
  "productQueryIdV2",
  "productV2",
  "orderIdForProductV2",
]);

/**
 * Read-only diagnostics only. A successful response is not proof of
 * custody or a purchase authorization. Never pass the returned stack
 * directly into TON Connect.
 */
export async function readMarketplaceV3TestnetGetter(
  method: V3TestnetReadonlyMethod,
  productId?: bigint,
  orderId?: bigint,
  nftItemAddress?: string,
): Promise<V3TestnetReadonlyResult> {
  if (!V3_TESTNET_READONLY_METHODS.includes(method)) {
    throw new Error("Unsupported V3 Testnet getter");
  }
  const requiresProduct = PRODUCT_METHODS.has(method);
  if ((method === "get_nft_data") !== (nftItemAddress !== undefined)) {
    throw new Error("Unexpected or missing V3 NFT item address");
  }
  const nftItem = nftItemAddress === undefined ? null : Address.parse(nftItemAddress);
  if (nftItem && nftItem.workChain !== 0) throw new Error("Invalid Testnet NFT item address");
  if (requiresProduct !== (productId !== undefined)) {
    throw new Error("Unexpected or missing V3 Testnet product ID");
  }
  if ((method === "marketplaceReserveStatusV3") !== (orderId !== undefined)) {
    throw new Error("Unexpected or missing V3 Testnet order ID");
  }
  if (orderId !== undefined && (orderId <= 0n || orderId > 0xffff_ffff_ffff_ffffn)) {
    throw new Error("Invalid V3 Testnet order ID");
  }
  if (productId !== undefined && (productId <= 0n || productId > 0xffff_ffff_ffff_ffffn)) {
    throw new Error("Invalid V3 Testnet product ID");
  }
  const { data, error } = await supabase.functions.invoke(
    "marketplace-v3-testnet-readonly",
    { body: { method, ...(productId !== undefined ? { product_id: productId.toString(10) } : {}), ...(orderId !== undefined ? { order_id: orderId.toString(10) } : {}), ...(nftItem ? { nft_item_address: nftItem.toRawString() } : {}) } },
  );
  if (error) throw new Error("V3 Testnet RPC is unavailable");
  const now = Date.now();
  const observed = Date.parse(data?.observed_at);
  if (!Number.isFinite(observed) || observed > now + 5000 || now - observed > 15000) {
    throw new Error("V3 Testnet RPC returned stale or invalid observation time");
  }
  if (!data || data.success !== true || data.network !== "testnet" ||
      data.method !== method || data.verified_purchase_eligibility !== false ||
      typeof data.contract_address !== "string" || !Array.isArray(data.stack) ||
      typeof data.observed_at !== "string" ||
      data.product_id !== (productId === undefined ? null : productId.toString(10)) ||
      data.order_id !== (orderId === undefined ? null : orderId.toString(10)) ||
      data.nft_item_address !== (nftItem ? nftItem.toRawString() : null)) {
    throw new Error("V3 Testnet RPC returned an invalid response");
  }
  let parsedAddress: Address;
  try {
    parsedAddress = Address.parse(data.contract_address);
  } catch {
    throw new Error("V3 Testnet RPC returned an invalid contract address");
  }
  if (parsedAddress.workChain !== 0 ||
      (nftItem && !parsedAddress.equals(nftItem)) || data.stack.length > 8 ||
      data.stack.some((entry: unknown) =>
        !entry || typeof entry !== "object" || Array.isArray(entry) ||
        typeof (entry as { type?: unknown }).type !== "string")) {
    throw new Error("V3 Testnet RPC returned invalid contract data");
  }
  return {
    network: "testnet",
    contract_address: parsedAddress.toRawString(),
    method,
    product_id: data.product_id,
    order_id: data.order_id,
    nft_item_address: data.nft_item_address,
    stack: data.stack,
    observed_at: data.observed_at,
    verified_purchase_eligibility: false,
  };
}

/**
 * Standard TEP-62 get_nft_data stack:
 * [init?, index, collection_address, owner_address, individual_content].
 * Only a fully initialized NFT with a decodable owner is accepted.
 * This is a read-only ownership observation, not a purchase authorization.
 */
export async function readV3TestnetNftOwner(nftItemAddress: string): Promise<{
  nftItemAddress: string;
  ownerAddress: string;
  observedAt: string;
  purchaseAuthorized: false;
}> {
  const result = await readMarketplaceV3TestnetGetter(
    "get_nft_data", undefined, undefined, nftItemAddress,
  );
  const stack = result.stack;
  if (stack.length !== 5) throw new Error("Invalid Testnet NFT data stack");
  const init = stack[0] as Record<string, unknown>;
  if (init?.type !== "num" || !["-1", "-0x1"].includes(String(init.value))) {
    throw new Error("Testnet NFT item is not initialized");
  }
  const owner = stack[3] as Record<string, unknown>;
  if (!owner || owner.type !== "slice") {
    throw new Error("Testnet NFT owner is not a slice");
  }
  // TON Center v3 represents TVM slices as a base64-encoded cell.
  // Reject unknown representations instead of guessing an owner.
  const encoded = typeof owner.cell === "string" ? owner.cell :
    typeof owner.value === "string" ? owner.value : null;
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length > 4096) {
    throw new Error("Unsupported Testnet NFT owner encoding");
  }
  const { Cell } = await import("@ton/core");
  const cells = Cell.fromBase64(encoded);
  const slice = cells.beginParse();
  const address = slice.loadAddress();
  if (slice.remainingBits !== 0 || slice.remainingRefs !== 0 || address.workChain !== 0) {
    throw new Error("Invalid Testnet NFT owner address");
  }
  return {
    nftItemAddress: Address.parse(nftItemAddress).toRawString(),
    ownerAddress: address.toRawString(),
    observedAt: result.observed_at,
    purchaseAuthorized: false,
  };
}

/**
 * Independent NFT item ownership observation. The expected escrow MUST come
 * from verified marketplace state; a caller-provided address alone is not
 * evidence of an active listing or a safe purchase.
 */
export async function inspectV3TestnetNftCustody(
  nftItemAddress: string,
  expectedEscrowAddress: string,
): Promise<{
  nftItemAddress: string;
  ownerAddress: string;
  escrowAddress: string;
  custodyMatches: boolean;
  observedAt: string;
  purchaseAuthorized: false;
}> {
  const expected = Address.parse(expectedEscrowAddress);
  const nft = Address.parse(nftItemAddress);
  if (expected.workChain !== 0 || expected.equals(nft)) {
    throw new Error("Invalid expected V3 escrow address");
  }
  const observation = await readV3TestnetNftOwner(nftItemAddress);
  const actual = Address.parse(observation.ownerAddress);
  return {
    nftItemAddress: observation.nftItemAddress,
    ownerAddress: actual.toRawString(),
    escrowAddress: expected.toRawString(),
    custodyMatches: actual.equals(expected),
    observedAt: observation.observedAt,
    purchaseAuthorized: false,
  };
}

/** Reads the escrow binding from the Marketplace itself, never user input. */
export async function readV3TestnetMarketplaceEscrow(): Promise<{
  marketplaceAddress: string;
  escrowAddress: string;
  observedAt: string;
  purchaseAuthorized: false;
}> {
  const result = await readMarketplaceV3TestnetGetter("escrowV2");
  if (result.stack.length !== 1) throw new Error("Invalid marketplace escrow getter");
  const entry = result.stack[0] as Record<string, unknown>;
  if (!entry || entry.type !== "slice") throw new Error("Marketplace escrow is not an address slice");
  const encoded = typeof entry.cell === "string" ? entry.cell :
    typeof entry.value === "string" ? entry.value : null;
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length > 4096) {
    throw new Error("Invalid marketplace escrow encoding");
  }
  const { Cell } = await import("@ton/core");
  const slice = Cell.fromBase64(encoded).beginParse();
  const escrow = slice.loadAddress();
  if (slice.remainingBits !== 0 || slice.remainingRefs !== 0 ||
      escrow.workChain !== 0 || escrow.equals(Address.parse(result.contract_address))) {
    throw new Error("Invalid marketplace escrow binding");
  }
  return {
    marketplaceAddress: result.contract_address,
    escrowAddress: escrow.toRawString(),
    observedAt: result.observed_at,
    purchaseAuthorized: false,
  };
}
