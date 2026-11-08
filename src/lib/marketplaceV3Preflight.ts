import { Address } from "@ton/core";
import {
  MARKETPLACE_V3_TESTNET_CHAIN,
  prepareMarketplaceV3TestnetPurchase,
  type MarketplaceV3TestnetQuote,
} from "./marketplaceV3";

/**
 * Data must come from a fresh, independently verified Testnet chain read.
 * A Supabase product row, browser URL or cached quote is NOT chain evidence.
 */
export type MarketplaceV3ChainSnapshot = Readonly<{
  chain: string;
  marketplaceAddress: string;
  productId: bigint;
  nftItemAddress: string;
  escrowAddress: string;
  sellerAddress: string;
  buyerAddress: string;
  priceNano: bigint;
  productStatus: number;
  existingOrderId: bigint | null;
  coordinatorConfigured: boolean;
  treasuryConfigured: boolean;
  escrowConfigured: boolean;
  nftOwnerAddress: string;
  escrowId: bigint;
  fetchedAtSeconds: number;
}>;

export type MarketplaceV3PurchasePreflightInput = {
  snapshot: MarketplaceV3ChainSnapshot;
  connectedWalletChain: string;
  connectedBuyerAddress: string;
  expectedMarketplaceAddress: string;
  expectedProductId: bigint;
  expectedNftItemAddress: string;
  expectedPriceNano: bigint;
  nowSeconds: number;
  queryId?: bigint;
};

function sameAddress(left: string, right: string): boolean {
  return Address.parse(left).equals(Address.parse(right));
}

/**
 * This checks a caller-supplied snapshot, but cannot establish that the
 * snapshot is authentic. Only a trusted Testnet RPC reader can provide it.
 * No transaction submission is implemented here.
 */
export function preflightMarketplaceV3TestnetPurchase(
  input: MarketplaceV3PurchasePreflightInput,
): MarketplaceV3TestnetQuote {
  const { snapshot: s } = input;
  if (input.connectedWalletChain !== MARKETPLACE_V3_TESTNET_CHAIN ||
      s.chain !== MARKETPLACE_V3_TESTNET_CHAIN) {
    throw new Error("V3 preflight is restricted to TON Testnet.");
  }
  if (!Number.isSafeInteger(input.nowSeconds) ||
      !Number.isSafeInteger(s.fetchedAtSeconds) ||
      s.fetchedAtSeconds > input.nowSeconds + 5 ||
      input.nowSeconds - s.fetchedAtSeconds > 15) {
    throw new Error("V3 chain snapshot is stale or has an invalid timestamp.");
  }
  if (!sameAddress(s.marketplaceAddress, input.expectedMarketplaceAddress) ||
      !sameAddress(s.nftItemAddress, input.expectedNftItemAddress) ||
      !sameAddress(s.buyerAddress, input.connectedBuyerAddress)) {
    throw new Error("V3 chain snapshot does not match the requested listing or wallet.");
  }
  if (s.productId !== input.expectedProductId ||
      s.priceNano !== input.expectedPriceNano ||
      s.priceNano <= 0n) {
    throw new Error("V3 on-chain listing ID or price differs from checkout.");
  }
  // MarketplaceV2 productStatus 2 means the escrowed NFT is actively listed.
  if (s.productStatus !== 2 || s.existingOrderId !== null) {
    throw new Error("V3 product is not available for a new purchase.");
  }
  if (!s.coordinatorConfigured || !s.treasuryConfigured || !s.escrowConfigured) {
    throw new Error("V3 escrow, coordinator or treasury is not configured.");
  }
  if (s.escrowId <= 0n || !sameAddress(s.nftOwnerAddress, s.escrowAddress)) {
    throw new Error("V3 NFT custody has not been verified at the escrow address.");
  }
  if (sameAddress(s.sellerAddress, s.buyerAddress) ||
      sameAddress(s.sellerAddress, s.escrowAddress)) {
    throw new Error("V3 buyer/seller/escrow identities are invalid.");
  }
  return prepareMarketplaceV3TestnetPurchase({
    marketplaceAddress: s.marketplaceAddress,
    walletChain: input.connectedWalletChain,
    productId: s.productId,
    priceNano: s.priceNano,
    nowSeconds: input.nowSeconds,
    deadline: input.nowSeconds + 300,
    queryId: input.queryId,
  });
}
