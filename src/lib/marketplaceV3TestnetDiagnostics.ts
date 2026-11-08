import { readMarketplaceV3TestnetGetter } from "./marketplaceV3TestnetReadonly";

export type V3TestnetDiagnostic = Readonly<{
  marketplaceAddress: string;
  productId: bigint;
  schemaVersion: bigint;
  status: bigint | null;
  escrowId: bigint | null;
  existingOrderId: bigint | null;
  escrowConfigured: boolean;
  treasuryConfigured: boolean;
  coordinatorConfigured: boolean;
  observedAt: string;
  purchaseAuthorized: false;
}>;

function oneNumber(stack: unknown[], nullable: boolean): bigint | null {
  if (stack.length !== 1 || !stack[0] || typeof stack[0] !== "object" ||
      Array.isArray(stack[0])) throw new Error("Invalid V3 getter stack");
  const item = stack[0] as Record<string, unknown>;
  if (nullable && item.type === "null") return null;
  if (item.type !== "num" || typeof item.value !== "string" ||
      !/^(0|[1-9][0-9]*)$/.test(item.value)) throw new Error("Invalid V3 getter number");
  const number = BigInt(item.value);
  if (number > 0xffff_ffff_ffff_ffffn) throw new Error("V3 getter uint64 overflow");
  return number;
}
function tvmBoolean(stack: unknown[]): boolean {
  if (stack.length !== 1 || !stack[0] || typeof stack[0] !== "object" ||
      Array.isArray(stack[0])) throw new Error("Invalid V3 getter boolean");
  const item = stack[0] as Record<string, unknown>;
  if (item.type !== "num" || (item.value !== "-1" && item.value !== "0")) {
    throw new Error("Invalid V3 TVM boolean");
  }
  return item.value === "-1";
}

/**
 * Concurrent read-only diagnostics. Multiple getter responses are not an
 * atomic block snapshot, so this is NOT eligible for purchase preflight.
 */
export async function inspectMarketplaceV3TestnetProduct(productId: bigint): Promise<V3TestnetDiagnostic> {
  const methods = [
    "purchaseSchemaVersionV3",
    "productStatusV2",
    "productEscrowIdV2",
    "orderIdForProductV2",
    "escrowConfiguredV2",
    "treasuryConfiguredV2",
    "marketplaceReserveCoordinatorConfiguredV3",
  ] as const;
  const results = await Promise.all(methods.map((method) =>
    readMarketplaceV3TestnetGetter(
      method,
      method === "productStatusV2" || method === "productEscrowIdV2" ||
        method === "orderIdForProductV2" ? productId : undefined,
    ),
  ));
  const address = results[0].contract_address;
  if (results.some((r) => r.contract_address !== address)) {
    throw new Error("V3 Testnet contract changed during inspection");
  }
  const schemaVersion = oneNumber(results[0].stack, false);
  const status = oneNumber(results[1].stack, true);
  const escrowId = oneNumber(results[2].stack, true);
  const existingOrderId = oneNumber(results[3].stack, true);
  if (schemaVersion === null) throw new Error("Missing V3 schema version");
  return {
    marketplaceAddress: address,
    productId,
    schemaVersion,
    status,
    escrowId,
    existingOrderId,
    escrowConfigured: tvmBoolean(results[4].stack),
    treasuryConfigured: tvmBoolean(results[5].stack),
    coordinatorConfigured: tvmBoolean(results[6].stack),
    observedAt: results.map((r) => r.observed_at).sort()[0],
    purchaseAuthorized: false,
  };
}
