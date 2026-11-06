// Decode the full opcode, order, query and coin amount of a TON V3 refund body from an externally supplied
// base64 BOC. Parsing is not cryptographic verification of the source transaction.
import { Cell } from "@ton/core";

export const TEST_RESERVE_BUYER_PAYMENT_OPCODE = 0x72730105;

export function decodeTestReserveBuyerPaymentBody(bodyBocBase64) {
  if (typeof bodyBocBase64 !== "string" || bodyBocBase64.length > 4096 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(bodyBocBase64)) {
    return null;
  }
  try {
    const cells = Cell.fromBoc(Buffer.from(bodyBocBase64, "base64"));
    if (cells.length !== 1) return null;
    const slice = cells[0].beginParse();
    if (slice.remainingBits < 32 + 64 + 64 || slice.remainingRefs !== 0) return null;
    const opcode = slice.loadUint(32);
    if (opcode !== TEST_RESERVE_BUYER_PAYMENT_OPCODE) return null;
    const orderId = slice.loadUintBig(64);
    const queryId = slice.loadUintBig(64);
    const amountNano = slice.loadCoins();
    if (amountNano <= 0n || slice.remainingBits !== 0 || slice.remainingRefs !== 0) return null;
    return { opcode, orderId: orderId.toString(), queryId: queryId.toString(), amountNano: amountNano.toString(), verified: false };
  } catch {
    return null;
  }
}
