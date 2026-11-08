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
] as const;

export type V3TestnetReadonlyMethod = typeof V3_TESTNET_READONLY_METHODS[number];
export type V3TestnetReadonlyResult = Readonly<{
  network: "testnet";
  contract_address: string;
  method: V3TestnetReadonlyMethod;
  product_id: string | null;
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
): Promise<V3TestnetReadonlyResult> {
  if (!V3_TESTNET_READONLY_METHODS.includes(method)) {
    throw new Error("Unsupported V3 Testnet getter");
  }
  const requiresProduct = PRODUCT_METHODS.has(method);
  if (requiresProduct !== (productId !== undefined)) {
    throw new Error("Unexpected or missing V3 Testnet product ID");
  }
  if (productId !== undefined && (productId <= 0n || productId > 0xffff_ffff_ffff_ffffn)) {
    throw new Error("Invalid V3 Testnet product ID");
  }
  const { data, error } = await supabase.functions.invoke(
    "marketplace-v3-testnet-readonly",
    { body: { method, ...(productId !== undefined ? { product_id: productId.toString(10) } : {}) } },
  );
  if (error) throw new Error("V3 Testnet RPC is unavailable");
  if (!data || data.success !== true || data.network !== "testnet" ||
      data.method !== method || data.verified_purchase_eligibility !== false ||
      typeof data.contract_address !== "string" || !Array.isArray(data.stack) ||
      typeof data.observed_at !== "string" ||
      data.product_id !== (productId === undefined ? null : productId.toString(10))) {
    throw new Error("V3 Testnet RPC returned an invalid response");
  }
  return {
    network: "testnet",
    contract_address: data.contract_address,
    method,
    product_id: data.product_id,
    stack: data.stack,
    observed_at: data.observed_at,
    verified_purchase_eligibility: false,
  };
}
