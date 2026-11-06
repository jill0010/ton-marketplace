// Strictly inspect the *shape* of a reported rich-bounce body.
// This is NOT cryptographic proof that TON generated the bounce. A provider
// or caller may fabricate a BOC with the same bytes.
import { Cell, beginCell } from "@ton/core";
import { decodeTestReserveBuyerPaymentBody } from "./v3-refund-body-decoder.mjs";

export const RICH_BOUNCE_PREFIX = 0xfffffffe;
export function inspectV3RichBounceBody(bodyBocBase64) {
  if (typeof bodyBocBase64 !== "string" || bodyBocBase64.length > 4096 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(bodyBocBase64)) return null;
  try {
    const raw = Buffer.from(bodyBocBase64, "base64");
    if (raw.toString("base64") !== bodyBocBase64) return null;
    const roots = Cell.fromBoc(raw);
    if (roots.length !== 1) return null;
    const slice = roots[0].beginParse();
    if (slice.remainingBits < 32 || slice.loadUint(32) !== RICH_BOUNCE_PREFIX) return null;
    // This experimental payment body is stored inline, with no references.
    if (slice.remainingRefs !== 0) return null;
    const original = beginCell().storeSlice(slice).endCell();
    const decoded = decodeTestReserveBuyerPaymentBody(original.toBoc().toString("base64"));
    if (!decoded) return null;
    return {
      orderId: decoded.orderId,
      queryId: decoded.queryId,
      amountNano: decoded.amountNano,
      envelopeStatus: "SHAPE_ONLY_UNVERIFIED",
      cryptographicallyVerified: false,
      mayRetry: false,
    };
  } catch {
    return null;
  }
}
