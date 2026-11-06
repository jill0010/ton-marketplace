import test from "node:test";
import assert from "node:assert/strict";
import { beginCell } from "@ton/core";
import { decodeTestReserveBuyerPaymentBody, TEST_RESERVE_BUYER_PAYMENT_OPCODE } from "./v3-refund-body-decoder.mjs";

const encode = (opcode, orderId, queryId) => beginCell()
  .storeUint(opcode, 32).storeUint(orderId, 64).storeUint(queryId, 64)
  .endCell().toBoc().toString("base64");

test("decodes exact V3 buyer payment body as unverified", () => {
  const decoded = decodeTestReserveBuyerPaymentBody(encode(TEST_RESERVE_BUYER_PAYMENT_OPCODE, 1, 2));
  assert.deepEqual(decoded, {
    opcode: TEST_RESERVE_BUYER_PAYMENT_OPCODE,
    orderId: "1",
    queryId: "2",
    verified: false,
  });
});
test("rejects other opcodes, extra bits, references and malformed BOC", () => {
  assert.equal(decodeTestReserveBuyerPaymentBody(encode(0x72730104, 1, 2)), null);
  assert.equal(decodeTestReserveBuyerPaymentBody("not-boc"), null);
  assert.equal(decodeTestReserveBuyerPaymentBody(""), null);
  const extra = beginCell().storeUint(TEST_RESERVE_BUYER_PAYMENT_OPCODE, 32)
    .storeUint(1, 64).storeUint(2, 64).storeBit(true).endCell();
  assert.equal(decodeTestReserveBuyerPaymentBody(extra.toBoc().toString("base64")), null);
  const ref = beginCell().storeUint(TEST_RESERVE_BUYER_PAYMENT_OPCODE, 32)
    .storeUint(1, 64).storeUint(2, 64).storeRef(beginCell().endCell()).endCell();
  assert.equal(decodeTestReserveBuyerPaymentBody(ref.toBoc().toString("base64")), null);
});
