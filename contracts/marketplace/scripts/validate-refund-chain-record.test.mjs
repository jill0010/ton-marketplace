import test from "node:test";
import assert from "node:assert/strict";
import { validateRefundChainRecord as validate } from "./validate-refund-chain-record.mjs";
const base = {
  orderId: "order-2", operationId: "refund-1",
  transactionId: "a".repeat(64),
  accountAddress: "0:" + "b".repeat(64),
  counterpartyAddress: "0:" + "c".repeat(64),
  amountNano: "200000000", logicalTime: "107886213000003",
};
test("well-formed TON transaction metadata remains unverified", () => {
  assert.deepEqual(validate(base), {
    valid: true, reason: "STRUCTURE_ONLY_NOT_VERIFIED", verified: false,
  });
});
test("reject malformed hashes, addresses, amounts, and logical times", () => {
  for (const fields of [
    { transactionId: "not-a-hash" },
    { accountAddress: "UQfake" },
    { counterpartyAddress: "" },
    { amountNano: "-1" },
    { amountNano: "0" },
    { amountNano: "0.2" },
    { logicalTime: "0" },
    { logicalTime: "1e3" },
    { orderId: "" },
    { operationId: "" },
  ]) {
    const result = validate({ ...base, ...fields });
    assert.equal(result.valid, false);
    assert.equal(result.verified, false);
  }
});
test("malformed record objects fail closed", () => {
  for (const input of [null, [], 5, "record"]) {
    assert.throws(() => validate(input), TypeError);
  }
});
