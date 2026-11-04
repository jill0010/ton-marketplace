import { Address, beginCell, toNano } from "@ton/core";

export const MARKETPLACE_V2_OPCODES = {
  publishProduct: 0x71b0000a,
  buyProduct: 0x71b00100,
  nftTransfer: 0x5fcc3d14,
} as const;

export const MARKETPLACE_V2_EXECUTION_RESERVE = toNano("0.2");
export const MARKETPLACE_V2_LISTING_MESSAGE_VALUE = toNano("0.2");
export const MARKETPLACE_V2_NFT_TRANSFER_MESSAGE_VALUE = toNano("0.2");
export const MARKETPLACE_V2_NFT_FORWARD_AMOUNT = toNano("0.05");

export const MarketplaceV2AssetKind = {
  Username: 1,
  PhoneNumber: 2,
  Gift: 3,
} as const;

export type MarketplaceV2AssetKind =
  typeof MarketplaceV2AssetKind[keyof typeof MarketplaceV2AssetKind];

export type PublishProductV2Input = {
  expectedProductId: bigint;
  queryId: bigint;
  nftItem: string;
  collection: string;
  itemIndex: bigint;
  kind: MarketplaceV2AssetKind;
  priceTon: string;
};

export type BuyProductV2Input = {
  productId: bigint;
  expectedPriceNano: bigint;
  queryId: bigint;
  deadline: number;
};

function asUint64(value: bigint, field: string): bigint {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${field} must fit uint64`);
  }
  return value;
}

export function createMarketplaceV2PaymentQueryId(now = Date.now()): bigint {
  // Payment query IDs live above the Marketplace's monotonically allocated
  // listing/release/payout query namespace. Add random entropy so two buyers
  // creating orders in the same millisecond do not reuse the same query ID.
  const entropy = new Uint32Array(1);
  globalThis.crypto.getRandomValues(entropy);
  const queryId = BigInt(now) * 1_000_000n + BigInt(entropy[0] % 1_000_000);
  return asUint64(queryId, "queryId");
}

export function buildPublishProductV2Payload(
  input: PublishProductV2Input,
): string {
  const expectedProductId = asUint64(input.expectedProductId, "expectedProductId");
  const queryId = asUint64(input.queryId, "queryId");
  if (input.itemIndex < 0n || input.itemIndex > (1n << 256n) - 1n) {
    throw new Error("itemIndex must fit uint256");
  }
  if (!Object.values(MarketplaceV2AssetKind).includes(input.kind)) {
    throw new Error("Unsupported Marketplace V2 asset kind");
  }

  const extra = beginCell()
    .storeUint(input.itemIndex, 256)
    .storeUint(input.kind, 8)
    .storeCoins(toNano(input.priceTon))
    .endCell();

  return beginCell()
    .storeUint(MARKETPLACE_V2_OPCODES.publishProduct, 32)
    .storeUint(expectedProductId, 64)
    .storeUint(queryId, 64)
    .storeAddress(Address.parse(input.nftItem))
    .storeAddress(Address.parse(input.collection))
    .storeRef(extra)
    .endCell()
    .toBoc()
    .toString("base64");
}

export function buildNftEscrowTransferPayload(
  queryIdValue: bigint,
  escrowAddress: string,
  sellerAddress: string,
): string {
  const queryId = asUint64(queryIdValue, "queryId");

  // Escrow expects this marker/query tuple in TEP-62 ownership_assigned.
  const forwardPayload = beginCell()
    .storeUint(1, 1)
    .storeRef(
      beginCell()
        .storeUint(0x53564950, 32)
        .storeUint(queryId, 64)
        .endCell(),
    )
    .endCell();

  return beginCell()
    .storeUint(MARKETPLACE_V2_OPCODES.nftTransfer, 32)
    .storeUint(queryId, 64)
    .storeAddress(Address.parse(escrowAddress))
    .storeAddress(Address.parse(sellerAddress))
    .storeBit(0) // custom_payload: none
    .storeCoins(MARKETPLACE_V2_NFT_FORWARD_AMOUNT)
    .storeSlice(forwardPayload.beginParse())
    .endCell()
    .toBoc()
    .toString("base64");
}

export function buildBuyProductV2Payload(input: BuyProductV2Input): string {
  const productId = asUint64(input.productId, "productId");
  const queryId = asUint64(input.queryId, "queryId");
  if (input.expectedPriceNano <= 0n) {
    throw new Error("Purchase price must be positive");
  }
  if (!Number.isInteger(input.deadline) || input.deadline <= 0 || input.deadline > 0xffff_ffff) {
    throw new Error("deadline must fit uint32");
  }

  return beginCell()
    .storeUint(MARKETPLACE_V2_OPCODES.buyProduct, 32)
    .storeUint(productId, 64)
    .storeCoins(input.expectedPriceNano)
    .storeUint(queryId, 64)
    .storeUint(input.deadline, 32)
    .endCell()
    .toBoc()
    .toString("base64");
}

export function marketplaceV2PurchaseValue(priceNano: bigint): bigint {
  if (priceNano <= 0n) {
    throw new Error("Purchase price must be positive");
  }
  return priceNano + MARKETPLACE_V2_EXECUTION_RESERVE;
}
