import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  extractV3TestnetGetterStack,
  parseV3TestnetBoolean,
  parseV3TestnetUint64,
} from "./marketplace-v3-testnet-getter.ts";

test("decodes valid uint64 including zero and max", () => {
  assert.equal(parseV3TestnetUint64({ exit_code: 0, stack: [{ type: "num", value: "0" }] }), 0n);
  assert.equal(parseV3TestnetUint64({ exit_code: 0, stack: [{ type: "num", value: "18446744073709551615" }] }), 0xffff_ffff_ffff_ffffn);
});
test("null getter value stays null, never a valid product", () => {
  assert.equal(parseV3TestnetUint64({ exit_code: 0, stack: [{ type: "null" }] }), null);
});
test("TON boolean accepts only TVM -1 and 0", () => {
  assert.equal(parseV3TestnetBoolean({ exit_code: 0, stack: [{ type: "num", value: "-1" }] }), true);
  assert.equal(parseV3TestnetBoolean({ exit_code: 0, stack: [{ type: "num", value: "0" }] }), false);
  for (const value of ["1", "-2", "true", ""]) {
    assert.throws(() => parseV3TestnetBoolean({ exit_code: 0, stack: [{ type: "num", value }] }));
  }
});
test("rejects failed getter, missing exit code, malformed and oversized stacks", () => {
  for (const response of [
    null, [], {}, { exit_code: 1, stack: [] },
    { stack: [] }, { exit_code: 0, stack: {} },
    { exit_code: 0, stack: Array(9).fill({ type: "num", value: "0" }) },
    { exit_code: 0, stack: [null] },
    { exit_code: 0, stack: [{ type: "bogus", value: "0" }] },
  ]) assert.throws(() => extractV3TestnetGetterStack(response));
});
test("rejects uint64 overflow, negatives, leading zeros and non-numbers", () => {
  for (const entry of [
    { type: "num", value: "18446744073709551616" },
    { type: "num", value: "-1" },
    { type: "num", value: "01" },
    { type: "num", value: 1 },
    { type: "cell", value: "AAAA" },
  ]) assert.throws(() => parseV3TestnetUint64({ exit_code: 0, stack: [entry] }));
});
