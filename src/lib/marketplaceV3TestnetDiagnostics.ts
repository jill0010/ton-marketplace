import { Address } from "@ton/core";
import { readMarketplaceV3TestnetGetter } from "./marketplaceV3TestnetReadonly";

export type V3TestnetDiagnostic = Readonly<{
  marketplaceAddress: string;
  productId: bigint;
  schemaVersion: bigint;
  nextOrderId: bigint;
  nextProductId: bigint;
  nextQueryId: bigint;
  productQueryId: bigint | null;
  status: bigint | null;
  escrowId: bigint | null;
  existingOrderId: bigint | null;
  reserveStatus: bigint | null;
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
    "nextOrderIdV3",
    "nextProductIdV2",
    "nextQueryIdV2",
    "productStatusV2",
    "productEscrowIdV2",
    "productQueryIdV2",
    "orderIdForProductV2",
    "escrowConfiguredV2",
    "treasuryConfiguredV2",
    "marketplaceReserveCoordinatorConfiguredV3",
  ] as const;
  const results = await Promise.all(methods.map((method) =>
    readMarketplaceV3TestnetGetter(
      method,
      method === "productStatusV2" || method === "productEscrowIdV2" ||
        method === "productQueryIdV2" ||
        method === "orderIdForProductV2" ? productId : undefined,
    ),
  ));
  const address = results[0].contract_address;
  const expectedAddress = Address.parse(address);
  if (results.some((r) => !Address.parse(r.contract_address).equals(expectedAddress))) {
    throw new Error("V3 Testnet contract changed during inspection");
  }
  const byMethod = new Map(methods.map((method, index) => [method, results[index]] as const));
  const numberFor = (method: typeof methods[number], nullable: boolean) => {
    const response = byMethod.get(method);
    if (!response) throw new Error("Missing V3 getter result");
    return oneNumber(response.stack, nullable);
  };
  const schemaVersion = numberFor("purchaseSchemaVersionV3", false);
  const nextOrderId = numberFor("nextOrderIdV3", false);
  const nextProductId = numberFor("nextProductIdV2", false);
  const nextQueryId = numberFor("nextQueryIdV2", false);
  const status = numberFor("productStatusV2", true);
  const escrowId = numberFor("productEscrowIdV2", true);
  const productQueryId = numberFor("productQueryIdV2", true);
  const existingOrderId = numberFor("orderIdForProductV2", true);
  if (nextOrderId === null || nextOrderId < 1n ||
      nextProductId === null || nextProductId < 1n ||
      nextQueryId === null || nextQueryId < 1n) {
    throw new Error("Invalid V3 allocation counters");
  }
  if (status === null && productId < nextProductId) {
    throw new Error("Allocated V3 product has no readable status");
  }
  if (status !== null && productId >= nextProductId) {
    throw new Error("V3 product exists outside allocated product range");
  }
  if (status !== null && (productQueryId === null || productQueryId === 0n)) {
    throw new Error("V3 product has no immutable query ID");
  }
  if (productQueryId !== null && productQueryId >= nextQueryId) {
    throw new Error("V3 product query ID exceeds allocated query range");
  }
  if (status === null && productQueryId !== null) {
    throw new Error("Missing V3 product has an orphaned query ID");
  }
  if (existingOrderId !== null && (existingOrderId === 0n || existingOrderId >= nextOrderId)) {
    throw new Error("V3 order reference is outside allocated order range");
  }
  if (schemaVersion !== 3n) throw new Error("Unexpected Marketplace V3 schema version");
  if (status !== null && ![1n, 2n, 3n, 5n, 6n].includes(status)) {
    throw new Error("Unknown V3 product status");
  }
  if (status === null && (escrowId !== null || existingOrderId !== null)) {
    throw new Error("Missing V3 product has orphaned escrow or order data");
  }
  const reserveResult = existingOrderId !== null
    ? await readMarketplaceV3TestnetGetter("marketplaceReserveStatusV3", undefined, existingOrderId)
    : null;
  if (reserveResult && !Address.parse(reserveResult.contract_address).equals(expectedAddress)) {
    throw new Error("V3 reserve status contract address mismatch");
  }
  const reserveStatus = reserveResult ? oneNumber(reserveResult.stack, false) : null;
  if (reserveStatus !== null && reserveStatus > 3n) {
    throw new Error("Unexpected V3 reserve status");
  }
  // Reserve allocation failure is recorded atomically with the product's
  // refund transition in MarketplaceReserveV3; it cannot remain purchased.
  if (reserveStatus === 3n && status !== 6n && status !== 5n) {
    throw new Error("V3 failed reserve allocation without refund/cancellation state");
  }
  if (reserveStatus !== null && reserveStatus !== 0n && existingOrderId === null) {
    throw new Error("V3 reserve binding exists without a linked order");
  }
  if (status === 2n && (!tvmBoolean(byMethod.get("escrowConfiguredV2")!.stack) ||
      !tvmBoolean(byMethod.get("treasuryConfiguredV2")!.stack) ||
      !tvmBoolean(byMethod.get("marketplaceReserveCoordinatorConfiguredV3")!.stack))) {
    throw new Error("Listed V3 product has incomplete contract bindings");
  }
  if (status === 2n && existingOrderId !== null) {
    throw new Error("Listed V3 product already has an order");
  }
  if (status === 2n && (escrowId === null || escrowId === 0n)) {
    throw new Error("Listed V3 product has no escrow binding");
  }
  const times = [...results, ...(reserveResult ? [reserveResult] : [])].map((r) => Date.parse(r.observed_at));
  const now = Date.now();
  if (times.some((time) => !Number.isFinite(time) || time > now + 5000 || now - time > 15000) ||
      Math.max(...times) - Math.min(...times) > 5000) {
    throw new Error("V3 Testnet observations are stale or inconsistent");
  }
  return {
    marketplaceAddress: address,
    productId,
    schemaVersion,
    nextOrderId,
    nextProductId,
    nextQueryId,
    productQueryId,
    status,
    escrowId,
    existingOrderId,
    reserveStatus,
    escrowConfigured: tvmBoolean(byMethod.get("escrowConfiguredV2")!.stack),
    treasuryConfigured: tvmBoolean(byMethod.get("treasuryConfiguredV2")!.stack),
    coordinatorConfigured: tvmBoolean(byMethod.get("marketplaceReserveCoordinatorConfiguredV3")!.stack),
    observedAt: new Date(Math.min(...times)).toISOString(),
    purchaseAuthorized: false,
  };
}
