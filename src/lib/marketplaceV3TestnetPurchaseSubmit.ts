import { Address, Cell, toNano } from "@ton/core";
import { MARKETPLACE_V2_OPCODES } from "./marketplaceV2";
import {
  MARKETPLACE_V3_TESTNET_CHAIN,
  MARKETPLACE_V3_RESERVE_NANO,
  type MarketplaceV3TestnetQuote,
} from "./marketplaceV3";

/**
 * Converts one newly verified V3 Testnet quote into the exact TON Connect
 * envelope. This function is not authorization: the caller must have freshly
 * checked on-chain listing, NFT custody, seller, order, price and bindings.
 * Mainnet is NEVER permitted here.
 */
export function buildMarketplaceV3TestnetWalletRequest(input: {
  quote: MarketplaceV3TestnetQuote;
  walletChain: string;
  buyerAddress: string;
  nowSeconds: number;
}) {
  const { quote, walletChain, buyerAddress, nowSeconds } = input;
  if (walletChain !== MARKETPLACE_V3_TESTNET_CHAIN ||
      quote.network !== MARKETPLACE_V3_TESTNET_CHAIN) {
    throw new Error("V3 wallet checkout is restricted to TON Testnet");
  }
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds <= 0 ||
      !Number.isSafeInteger(quote.deadline) ||
      quote.deadline <= nowSeconds + 15 ||
      quote.deadline > nowSeconds + 300) {
    throw new Error("V3 Testnet purchase quote has expired or is invalid");
  }
  const recipient = Address.parseFriendly(quote.address);
  const buyer = Address.parse(buyerAddress);
  if (!recipient.isTestOnly || recipient.address.workChain !== 0 ||
      buyer.workChain !== 0 || buyer.equals(recipient.address)) {
    throw new Error("Invalid V3 Testnet contract or buyer address");
  }
  if (quote.productId <= 0n || quote.productId > 0xffff_ffff_ffff_ffffn ||
      quote.queryId <= 0n || quote.queryId > 0xffff_ffff_ffff_ffffn ||
      quote.priceNano <= 0n ||
      quote.reserveNano !== MARKETPLACE_V3_RESERVE_NANO ||
      quote.reserveNano !== toNano("0.2") ||
      quote.totalNano !== quote.priceNano + quote.reserveNano) {
    throw new Error("Invalid V3 Testnet purchase amount or identity");
  }
  const body = Cell.fromBase64(quote.payload).beginParse();
  if (body.loadUint(32) !== MARKETPLACE_V2_OPCODES.buyProduct ||
      body.loadUintBig(64) !== quote.productId ||
      body.loadCoins() !== quote.priceNano ||
      body.loadUintBig(64) !== quote.queryId ||
      body.loadUint(32) !== quote.deadline ||
      body.remainingBits !== 0 || body.remainingRefs !== 0) {
    throw new Error("V3 Testnet payment payload does not match verified quote");
  }
  return {
    network: MARKETPLACE_V3_TESTNET_CHAIN,
    from: buyer.toRawString(),
    validUntil: quote.deadline,
    messages: [{
      address: recipient.address.toString({ testOnly: true, bounceable: true }),
      amount: quote.totalNano.toString(10),
      payload: quote.payload,
    }],
  };
}
