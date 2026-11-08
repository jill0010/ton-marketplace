import { Address } from "@ton/core";
import { supabase } from "./supabase";

export const V3_TESTNET_READONLY_METHODS = [
  "purchaseSchemaVersionV3",
  "escrowConfiguredV2",
  "treasuryConfiguredV2",
  "marketplaceReserveCoordinatorConfiguredV3",
  "productStatusV2",
  "productEscrowIdV2",
  "productV2",
  "orderIdForProductV2",
  "marketplaceReserveStatusV3",
] as const;

export type V3TestnetReadonlyMethod = typeof V3_TESTNET_READONLY_METHODS[number];
export type V3TestnetReadonlyResult = Readonly<{
  network: "testnet";
  contract_address: string;
  method: V3TestnetReadonlyMethod;
  product_id: string | null;
  order_id: string | null;
  stack: unknown[];
  observed_at: string;
  verified_purchase_eligibility: false;
}>;

const PRODUCT_METHODS = new Set<V3TestnetReadonlyMethod>([
  "productStatusV2",
  "productEscrowIdV2",
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
): Promise<V3TestnetReadonlyResult> {
  if (!V3_TESTNET_READONLY_METHODS.includes(method)) {
    throw new Error("Unsupported V3 Testnet getter");
  }
  const requiresProduct = PRODUCT_METHODS.has(method);
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
    { body: { method, ...(productId !== undefined ? { product_id: productId.toString(10) } : {}), ...(orderId !== undefined ? { order_id: orderId.toString(10) } : {}) } },
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
      data.order_id !== (orderId === undefined ? null : orderId.toString(10))) {
    throw new Error("V3 Testnet RPC returned an invalid response");
  }
  let parsedAddress: Address;
  try {
    parsedAddress = Address.parse(data.contract_address);
  } catch {
    throw new Error("V3 Testnet RPC returned an invalid contract address");
  }
  if (parsedAddress.workChain !== 0 || data.stack.length > 8 ||
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
    stack: data.stack,
    observed_at: data.observed_at,
    verified_purchase_eligibility: false,
  };
}
