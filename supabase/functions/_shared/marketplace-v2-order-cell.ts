import { Address, Cell } from "npm:@ton/core@0.63.1";
import { Buffer } from "node:buffer";

export type MarketplaceV2OrderSnapshot = {
  id: string;
  productId: string;
  status: number;
  deliveryStatus: number;
  sellerPayoutStatus: number;
  platformPayoutStatus: number;
  refundStatus: number;
  createdAt: number;
  buyer: string;
  seller: string;
  treasury: string;
  nftItem: string;
  collection: string;
  itemIndex: string;
  escrowId: string;
  grossNano: string;
  feeBps: number;
  feeRoundingVersion: number;
  platformFeeNano: string;
  sellerProceedsNano: string;
  processingReserveNano: string;
  paymentQueryId: string;
  releaseQueryId: string;
  sellerPayoutOperationId: string;
  platformPayoutOperationId: string;
  buyerRefundOperationId: string;
  sellerPayoutQueryId: string;
  platformPayoutQueryId: string;
  buyerRefundQueryId: string;
};

function decodeBoc(value: string): Cell {
  if (!value || value.length > 100_000 || !/^[A-Za-z0-9_+/=-]+$/.test(value)) {
    throw new Error("Invalid order cell BOC encoding");
  }
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Buffer.from(binary, "binary");
  const roots = Cell.fromBoc(bytes);
  if (roots.length !== 1) throw new Error("Order cell BOC must contain exactly one root");
  return roots[0];
}

function requireAddress(value: Address | null, field: string): string {
  if (!value) throw new Error(`Order cell is missing ${field}`);
  return value.toRawString().toLowerCase();
}

function requireEmpty(slice: ReturnType<Cell["beginParse"]>, field: string): void {
  if (slice.remainingBits !== 0 || slice.remainingRefs !== 0) {
    throw new Error(`Order cell ${field} contains unexpected trailing data`);
  }
}

/**
 * Decode MarketplaceV2Order and its four referenced immutable snapshot cells.
 * Field order and widths are taken directly from contracts/marketplace/contracts/types.tolk.
 */
export function decodeMarketplaceV2OrderCell(orderCellBocBase64: string): MarketplaceV2OrderSnapshot {
  const root = decodeBoc(orderCellBocBase64);
  const order = root.beginParse();

  const id = order.loadUintBig(64);
  const productId = order.loadUintBig(64);
  const status = order.loadUint(8);
  const deliveryStatus = order.loadUint(8);
  const sellerPayoutStatus = order.loadUint(8);
  const platformPayoutStatus = order.loadUint(8);
  const refundStatus = order.loadUint(8);
  const createdAt = order.loadUint(32);
  if (order.remainingBits !== 0 || order.remainingRefs !== 1) {
    throw new Error("MarketplaceV2Order root must contain exactly one extra reference");
  }

  const extra = order.loadRef().beginParse();
  if (extra.remainingBits !== 0 || extra.remainingRefs !== 4) {
    throw new Error("MarketplaceV2OrderExtra must contain exactly four snapshot references");
  }
  const parties = extra.loadRef().beginParse();
  const asset = extra.loadRef().beginParse();
  const settlement = extra.loadRef().beginParse();
  const operations = extra.loadRef().beginParse();
  requireEmpty(extra, "extra");

  const buyer = requireAddress(parties.loadAddress(), "buyer");
  const seller = requireAddress(parties.loadAddress(), "seller");
  const treasury = requireAddress(parties.loadAddress(), "treasury");
  requireEmpty(parties, "parties");

  const nftItem = requireAddress(asset.loadAddress(), "NFT item");
  const collection = requireAddress(asset.loadAddress(), "collection");
  const itemIndex = asset.loadUintBig(256).toString();
  const escrowId = asset.loadUintBig(64).toString();
  requireEmpty(asset, "asset");

  const grossNano = settlement.loadCoins().toString();
  const feeBps = settlement.loadUint(16);
  const feeRoundingVersion = settlement.loadUint(8);
  const platformFeeNano = settlement.loadCoins().toString();
  const sellerProceedsNano = settlement.loadCoins().toString();
  const processingReserveNano = settlement.loadCoins().toString();
  requireEmpty(settlement, "settlement");

  const paymentQueryId = operations.loadUintBig(64).toString();
  const releaseQueryId = operations.loadUintBig(64).toString();
  const sellerPayoutOperationId = operations.loadUintBig(64).toString();
  const platformPayoutOperationId = operations.loadUintBig(64).toString();
  const buyerRefundOperationId = operations.loadUintBig(64).toString();
  const sellerPayoutQueryId = operations.loadUintBig(64).toString();
  const platformPayoutQueryId = operations.loadUintBig(64).toString();
  const buyerRefundQueryId = operations.loadUintBig(64).toString();
  requireEmpty(operations, "operations");

  if (id === 0n || productId === 0n || grossNano === "0" || processingReserveNano !== "200000000") {
    throw new Error("MarketplaceV2Order has invalid identity, gross amount, or processing reserve");
  }
  if (grossNano !== (BigInt(platformFeeNano) + BigInt(sellerProceedsNano)).toString()) {
    throw new Error("MarketplaceV2Order settlement amounts do not reconcile");
  }

  return {
    id: id.toString(), productId: productId.toString(), status, deliveryStatus,
    sellerPayoutStatus, platformPayoutStatus, refundStatus, createdAt,
    buyer, seller, treasury, nftItem, collection, itemIndex, escrowId,
    grossNano, feeBps, feeRoundingVersion, platformFeeNano, sellerProceedsNano,
    processingReserveNano, paymentQueryId, releaseQueryId, sellerPayoutOperationId,
    platformPayoutOperationId, buyerRefundOperationId, sellerPayoutQueryId,
    platformPayoutQueryId, buyerRefundQueryId,
  };
}
