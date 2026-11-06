import test from "node:test";
import assert from "node:assert/strict";
import { beginCell } from "@ton/core";
import { inspectV3RichBounceBody, RICH_BOUNCE_PREFIX } from "./v3-refund-rich-bounce-body.mjs";

const original = () => beginCell().storeUint(0x72730105, 32)
  .storeUint(1, 64).storeUint(2, 64).storeCoins(194000000n).endCell();
const encode = (prefix, body = original()) => beginCell()
  .storeUint(prefix, 32).storeSlice(body.beginParse()).endCell()
  .toBoc().toString("base64");

test("accepts rich bounce envelope shape but never trusts or retries", () => {
  assert.deepEqual(inspectV3RichBounceBody(encode(RICH_BOUNCE_PREFIX)), {
    orderId: "1", queryId: "2", amountNano: "194000000",
    envelopeStatus: "SHAPE_ONLY_UNVERIFIED",
    cryptographicallyVerified: false, mayRetry: false,
  });
});
test("rejects ordinary bounce, missing prefix and wrong original opcode", () => {
  assert.equal(inspectV3RichBounceBody(encode(0xffffffff)), null);
  assert.equal(inspectV3RichBounceBody(original().toBoc().toString("base64")), null);
  const other = beginCell().storeUint(0x72730104, 32)
    .storeUint(1, 64).storeUint(2, 64).storeCoins(194000000n).endCell();
  assert.equal(inspectV3RichBounceBody(encode(RICH_BOUNCE_PREFIX, other)), null);
});
test("rejects trailing data, malformed BOC, references and noncanonical base64", () => {
  const extra = beginCell().storeUint(0x72730105, 32)
    .storeUint(1, 64).storeUint(2, 64).storeCoins(194000000n).storeBit(true).endCell();
  assert.equal(inspectV3RichBounceBody(encode(RICH_BOUNCE_PREFIX, extra)), null);
  const ref = beginCell().storeUint(RICH_BOUNCE_PREFIX, 32)
    .storeSlice(original().beginParse()).storeRef(beginCell().endCell()).endCell();
  assert.equal(inspectV3RichBounceBody(ref.toBoc().toString("base64")), null);
  assert.equal(inspectV3RichBounceBody("not-a-boc"), null);
  assert.equal(inspectV3RichBounceBody(""), null);
  assert.equal(inspectV3RichBounceBody(encode(RICH_BOUNCE_PREFIX) + "="), null);
});
