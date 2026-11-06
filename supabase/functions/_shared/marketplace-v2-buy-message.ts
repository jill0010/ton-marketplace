import { Address, Cell } from "npm:@ton/core@0.63.1";

export const MARKETPLACE_V2_BUY_OPCODE = 0x71b00100;
export const MARKETPLACE_V2_PROCESSING_RESERVE_NANO = 200_000_000n;

export type DecodedBuyProductV2 = {
  productId: bigint;
  expectedPriceNano: bigint;
  queryId: bigint;
  deadline: number;
  reserveNano: bigint;
  totalPaymentNano: bigint;
};

function decodeBase64(value: string): Uint8Array {
  if (!value || value.length > 100_000 || !/^[A-Za-z0-9_+/=-]+$/.test(value)) {
    throw new Error("Invalid TON message body encoding");
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Decode the exact MarketplaceV2 BuyProductV2 ABI. This only validates a
 * candidate message; it does not prove transaction finality or create a DB row.
 */
export function decodeBuyProductV2Body(bodyBocBase64: string): Omit<DecodedBuyProductV2, "reserveNano" | "totalPaymentNano"> {
  const roots = Cell.fromBoc(decodeBase64(bodyBocBase64));
  if (roots.length !== 1) throw new Error("BuyProductV2 body must contain exactly one root cell");

  const slice = roots[0].beginParse();
  if (slice.remainingBits < 32) throw new Error("BuyProductV2 body is truncated");
  const opcode = slice.loadUint(32);
  if (opcode !== MARKETPLACE_V2_BUY_OPCODE) throw new Error("Unexpected Marketplace V2 inbound opcode");

  const productId = slice.loadUintBig(64);
  const expectedPriceNano = slice.loadCoins();
  const queryId = slice.loadUintBig(64);
  const deadline = slice.loadUint(32);

  if (productId <= 0n || expectedPriceNano <= 0n || queryId <= 0n || deadline <= 0) {
    throw new Error("BuyProductV2 contains a zero or invalid required field");
  }
  if (slice.remainingBits !== 0 || slice.remainingRefs !== 0) {
    throw new Error("BuyProductV2 body contains unexpected trailing data");
  }
  return { productId, expectedPriceNano, queryId, deadline };
}

export function validateBuyProductV2Transaction(input: {
  bodyBocBase64: string;
  destination: string;
  expectedMarketplaceAddress: string;
  source: string;
  transactionValueNano: string;
  transactionHash: string;
  messageHash: string;
  masterchainBlockSeqno: number;
  emulated: boolean;
  aborted: boolean;
  computeSuccess: boolean;
  actionSuccess: boolean;
}): DecodedBuyProductV2 & { buyerRaw: string; paymentTransactionHash: string; inboundMessageHash: string } {
  const marketplace = Address.parse(input.expectedMarketplaceAddress).toRawString().toLowerCase();
  const destination = Address.parse(input.destination).toRawString().toLowerCase();
  const buyerRaw = Address.parse(input.source).toRawString().toLowerCase();
  if (destination !== marketplace) throw new Error("Inbound message destination is not the configured Marketplace V2");
  if (!/^[0-9a-f]{64}$/i.test(input.transactionHash) || !/^[0-9a-f]{64}$/i.test(input.messageHash)) {
    throw new Error("Invalid transaction or inbound message hash");
  }
  if (!Number.isSafeInteger(input.masterchainBlockSeqno) || input.masterchainBlockSeqno <= 0) {
    throw new Error("Marketplace transaction is not masterchain-finalized");
  }
  if (input.emulated || input.aborted || !input.computeSuccess || !input.actionSuccess) {
    throw new Error("Marketplace purchase transaction did not execute successfully on chain");
  }
  if (!/^(0|[1-9][0-9]*)$/.test(input.transactionValueNano)) {
    throw new Error("Invalid inbound transaction value");
  }
  const decoded = decodeBuyProductV2Body(input.bodyBocBase64);
  const reserveNano = MARKETPLACE_V2_PROCESSING_RESERVE_NANO;
  const totalPaymentNano = decoded.expectedPriceNano + reserveNano;
  if (BigInt(input.transactionValueNano) !== totalPaymentNano) {
    throw new Error("Inbound payment does not equal gross price plus the exact 0.2 TON reserve");
  }
  return {
    ...decoded,
    reserveNano,
    totalPaymentNano,
    buyerRaw,
    paymentTransactionHash: input.transactionHash.toLowerCase(),
    inboundMessageHash: input.messageHash.toLowerCase(),
  };
}
