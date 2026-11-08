import { Address } from "@ton/core";
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

function parseUnsignedTVMNumber(value: unknown): bigint {
  if (typeof value !== "string" ||
      !(/^(0|[1-9][0-9]*)$/.test(value) || /^0x[0-9a-fA-F]+$/.test(value))) {
    throw new Error("Invalid V3 getter number");
  }
  const number = BigInt(value);
  if (number > 0xffff_ffff_ffff_ffffn) throw new Error("V3 getter uint64 overflow");
  return number;
}

function oneNumber(stack: unknown[], nullable: boolean): bigint | null {
  if (stack.length !== 1 || !stack[0] || typeof stack[0] !== "object" ||
      Array.isArray(stack[0])) throw new Error("Invalid V3 getter stack");
  const item = stack[0] as Record<string, unknown>;
  if (nullable && item.type === "null") return null;
  if (item.type !== "num") throw new Error("Invalid V3 getter number");
  return parseUnsignedTVMNumber(item.value);
}
function tvmBoolean(stack: unknown[]): boolean {
  if (stack.length !== 1 || !stack[0] || typeof stack[0] !== "object" ||
      Array.isArray(stack[0])) throw new Error("Invalid V3 getter boolean");
  const item = stack[0] as Record<string, unknown>;
  if (item.type !== "num" || !["-1", "-0x1", "0", "0x0"].includes(String(item.value))) {
    throw new Error("Invalid V3 TVM boolean");
  }
  return item.value === "-1" || item.value === "-0x1";
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
  const expectedAddress = Address.parse(address);
  if (results.some((r) => !Address.parse(r.contract_address).equals(expectedAddress))) {
    throw new Error("V3 Testnet contract changed during inspection");
  }
  const schemaVersion = oneNumber(results[0].stack, false);
  const status = oneNumber(results[1].stack, true);
  const escrowId = oneNumber(results[2].stack, true);
  const existingOrderId = oneNumber(results[3].stack, true);
  if (schemaVersion !== 3n) throw new Error("Unexpected Marketplace V3 schema version");
  if (status !== null && status > 3n) throw new Error("Unknown V3 product status");
  if (status === null && (escrowId !== null || existingOrderId !== null)) {
    throw new Error("Missing V3 product has orphaned escrow or order data");
  }
  if (status === 2n && existingOrderId !== null) {
    throw new Error("Listed V3 product already has an order");
  }
  if (status === 2n && (escrowId === null || escrowId === 0n)) {
    throw new Error("Listed V3 product has no escrow binding");
  }
  const times = results.map((r) => Date.parse(r.observed_at));
  const now = Date.now();
  if (times.some((time) => !Number.isFinite(time) || time > now + 5000 || now - time > 15000) ||
      Math.max(...times) - Math.min(...times) > 5000) {
    throw new Error("V3 Testnet observations are stale or inconsistent");
  }
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
    observedAt: new Date(Math.min(...times)).toISOString(),
    purchaseAuthorized: false,
  };
}
