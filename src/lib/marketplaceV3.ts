import { Address, toNano } from "@ton/core";
import {
  buildBuyProductV2Payload,
  createMarketplaceV2PaymentQueryId,
  marketplaceV2PurchaseValue,
} from "./marketplaceV2";

/**
 * MarketplaceReserveV3 deliberately reuses the BuyProductV2 wire format.
 * This module only prepares a transaction: it NEVER submits one.
 *
 * Production Mainnet remains disabled until a separately audited release.
 */
export const MARKETPLACE_V3_TESTNET_CHAIN = "-3" as const;
export const MARKETPLACE_V3_MAINNET_CHAIN = "-239" as const;
export const MARKETPLACE_V3_RESERVE_NANO = toNano("0.2");

export type MarketplaceV3TestnetQuote = Readonly<{
  network: typeof MARKETPLACE_V3_TESTNET_CHAIN;
  address: string;
  productId: bigint;
  priceNano: bigint;
  reserveNano: bigint;
  totalNano: bigint;
  queryId: bigint;
  deadline: number;
  payload: string;
}>;

export type PrepareMarketplaceV3TestnetPurchaseInput = {
  marketplaceAddress: string;
  walletChain: string;
  productId: bigint;
  priceNano: bigint;
  deadline: number;
  nowSeconds?: number;
  queryId?: bigint;
};

/**
 * Fail closed: Testnet only. A quote is not evidence of an active listing,
 * escrow ownership, coordinator binding, adequate wallet balance, or payment.
 * Those must be verified against the actual chain immediately before signing.
 */
export function prepareMarketplaceV3TestnetPurchase(
  input: PrepareMarketplaceV3TestnetPurchaseInput,
): MarketplaceV3TestnetQuote {
  if (input.walletChain !== MARKETPLACE_V3_TESTNET_CHAIN) {
    throw new Error("Marketplace V3 purchase preparation is restricted to TON Testnet.");
  }
  const address = Address.parse(input.marketplaceAddress);
  if (address.workChain !== 0) {
    throw new Error("Marketplace V3 contract must be on TON workchain 0.");
  }
  if (input.productId <= 0n || input.productId > 0xffff_ffff_ffff_ffffn) {
    throw new Error("Invalid V3 product ID.");
  }
  // TON coins are encoded as VarUInteger 16 (at most 120 bits).
  if (input.priceNano <= 0n || input.priceNano + MARKETPLACE_V3_RESERVE_NANO >= (1n << 120n)) {
    throw new Error("Invalid V3 listing price.");
  }
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new Error("Invalid current timestamp.");
  }
  if (!Number.isSafeInteger(input.deadline) || input.deadline <= now ||
      input.deadline > now + 600 || input.deadline > 0xffff_ffff) {
    throw new Error("V3 purchase deadline must be within the next 10 minutes.");
  }
  const queryId = input.queryId ?? createMarketplaceV2PaymentQueryId();
  if (queryId <= 0n || queryId > 0xffff_ffff_ffff_ffffn) {
    throw new Error("V3 query ID must be a nonzero uint64.");
  }
  const totalNano = marketplaceV2PurchaseValue(input.priceNano);
  return Object.freeze({
    network: MARKETPLACE_V3_TESTNET_CHAIN,
    address: address.toString({ testOnly: true, bounceable: true }),
    productId: input.productId,
    priceNano: input.priceNano,
    reserveNano: MARKETPLACE_V3_RESERVE_NANO,
    totalNano,
    queryId,
    deadline: input.deadline,
    payload: buildBuyProductV2Payload({
      productId: input.productId,
      expectedPriceNano: input.priceNano,
      queryId,
      deadline: input.deadline,
    }),
  });
}
