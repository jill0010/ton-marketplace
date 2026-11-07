import test from "node:test";
import assert from "node:assert/strict";
import { sign, verify } from "node:crypto";
import { deriveV3ValidatorKey, deriveV3ValidatorSet } from "./derive-v3-validator-keys.mjs";

test("derives stable Ed25519 public keys and decimal TVM uint256 values", () => {
  const seed = "01".repeat(32);
  const a = deriveV3ValidatorKey(seed);
  const b = deriveV3ValidatorKey(seed);
  assert.equal(a.publicKeyHex, b.publicKeyHex);
  assert.equal(a.publicKeyDecimal, BigInt("0x" + a.publicKeyHex).toString());
  const message = Buffer.from("TON Market V3 settlement test");
  const signature = sign(null, message, a.privateKey);
  assert.equal(verify(null, message, a.privateKey, signature), true);
});

test("requires three distinct non-zero 32-byte validator seeds", () => {
  assert.throws(() => deriveV3ValidatorKey("01"));
  assert.throws(() => deriveV3ValidatorKey("00".repeat(32)));
  assert.throws(() => deriveV3ValidatorSet({
    V3_VALIDATOR_0_SEED: "01".repeat(32),
    V3_VALIDATOR_1_SEED: "01".repeat(32),
    V3_VALIDATOR_2_SEED: "02".repeat(32),
  }));
  assert.equal(deriveV3ValidatorSet({
    V3_VALIDATOR_0_SEED: "01".repeat(32),
    V3_VALIDATOR_1_SEED: "02".repeat(32),
    V3_VALIDATOR_2_SEED: "03".repeat(32),
  }).length, 3);
});
