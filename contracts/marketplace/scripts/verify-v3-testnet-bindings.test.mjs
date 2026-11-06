import test from "node:test";
import assert from "node:assert/strict";
import { Address, beginCell } from "@ton/core";
import { decodeAddressGetter, verifyV3Bindings } from "./verify-v3-testnet-bindings.mjs";
const addresses = { marketplace: "0:" + "1".repeat(64), escrow: "0:" + "2".repeat(64), coordinator: "0:" + "3".repeat(64) };
const owner = "0:1d4e4b1f51fa4e1d91a8ad293c39a143c2c88e4b9ac7458e45e785af87adccf0";
const getterAddress = (raw) => [["cell", { bytes: beginCell().storeAddress(Address.parse(raw)).endCell().toBoc().toString("base64") }]];
test("address getter decoding accepts a valid address BOC and rejects malformed stacks", () => {
  assert.equal(decodeAddressGetter(getterAddress(addresses.marketplace)), addresses.marketplace);
  assert.throws(() => decodeAddressGetter([]), /stack/);
  assert.throws(() => decodeAddressGetter([["num", "1"]]), /cell\/slice/);
});
test("binding checker fails closed for mismatched contracts", async () => {
  const report = await verifyV3Bindings(addresses, async () => ({
    ok: true, json: async () => ({ ok: true, result: { exit_code: 0, stack: getterAddress(addresses.marketplace) } }),
  }));
  assert.equal(report.bindingsVerified, false);
  assert.equal(report.noTransactionSent, true);
  assert.equal(report.mainnetApproved, false);
  assert.equal(Object.keys(report.checks).length, 8);
});
test("binding checker rejects unsuccessful getter execution", async () => {
  await assert.rejects(verifyV3Bindings(addresses, async () => ({
    ok: true, json: async () => ({ ok: true, result: { exit_code: 9, stack: [] } }),
  })), /Getter failed/);
});
