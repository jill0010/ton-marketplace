import test from "node:test";
import assert from "node:assert/strict";
import { beginCell } from "@ton/core";
import {
  validateV3ProductionAddresses,
  compareV3ProductionCodeHashes,
  verifyV3ProductionTestnet,
} from "./verify-v3-production-testnet.mjs";

const addresses = {
  marketplace: "0:" + "01".repeat(32),
  escrow: "0:" + "02".repeat(32),
  coordinator: "0:" + "03".repeat(32),
  verifier: "0:" + "04".repeat(32),
};

test("production V3 address validation requires four distinct Testnet addresses", () => {
  assert.equal(validateV3ProductionAddresses(addresses).length, 4);
  assert.throws(() => validateV3ProductionAddresses({ ...addresses, verifier: addresses.marketplace }));
  assert.throws(() => validateV3ProductionAddresses({ ...addresses, verifier: undefined }));
});

test("production V3 code hash comparison fails closed when expected hashes are absent", () => {
  assert.equal(compareV3ProductionCodeHashes({}, null).verified, false);
});

test("production V3 read-only postflight verifies all four active account code hashes", async () => {
  const code = beginCell().storeUint(1, 1).endCell();
  const boc = code.toBoc().toString("base64");
  const hash = code.hash().toString("hex");
  const expected = { marketplace: hash, escrow: hash, coordinator: hash, verifier: hash };
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    return {
      ok: true,
      json: async () => ({ ok: true, result: { state: "active", code: boc } }),
    };
  };
  const report = await verifyV3ProductionTestnet(addresses, fetcher, expected);
  assert.equal(calls.length, 4);
  assert.equal(report.allActive, true);
  assert.equal(report.allCodePresent, true);
  assert.equal(report.codeHashesVerified, true);
  assert.equal(report.noTransactionSent, true);
  assert.equal(report.mainnetReleaseApproved, false);
});

test("production V3 postflight reports code mismatch without approving release", async () => {
  const code = beginCell().storeUint(1, 1).endCell();
  const fetcher = async () => ({
    ok: true,
    json: async () => ({ ok: true, result: { state: "active", code: code.toBoc().toString("base64") } }),
  });
  const expected = { marketplace: "00".repeat(32), escrow: "00".repeat(32), coordinator: "00".repeat(32), verifier: "00".repeat(32) };
  const report = await verifyV3ProductionTestnet(addresses, fetcher, expected);
  assert.equal(report.codeHashesVerified, false);
  assert.equal(report.mainnetReleaseApproved, false);
});
