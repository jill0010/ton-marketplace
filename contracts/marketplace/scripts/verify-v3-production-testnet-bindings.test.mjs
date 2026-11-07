import test from "node:test";
import assert from "node:assert/strict";
import { beginCell } from "@ton/core";
import { decodeV3IntegerGetter, verifyV3ProductionBindings } from "./verify-v3-production-testnet-bindings.mjs";

const addresses = {
  marketplace: "0:" + "01".repeat(32),
  escrow: "0:" + "02".repeat(32),
  coordinator: "0:" + "03".repeat(32),
  verifier: "0:" + "04".repeat(32),
};

function addrStack(raw) {
  const [wc, hash] = raw.split(":");
  const cell = beginCell().storeAddress({ workChain: Number(wc), hash: Buffer.from(hash, "hex") }).endCell();
  return [["cell", { bytes: cell.toBoc().toString("base64") }]];
}

test("numeric getter decoder handles signed and unsigned TVM integers", () => {
  assert.equal(decodeV3IntegerGetter([["num", "-0x3"]]), -3n);
  assert.equal(decodeV3IntegerGetter([["num", "0x2"]]), 2n);
  assert.throws(() => decodeV3IntegerGetter([["cell", {}]]));
});

test("production V3 binding verifier checks marketplace, escrow, coordinator and verifier configuration", async () => {
  const vaultHash = "ab".repeat(32);
  const values = {
    ownerV2: addrStack(addresses.marketplace),
    escrowV2: addrStack(addresses.escrow),
    treasuryV2: addrStack("0:" + "05".repeat(32)),
    reserveCoordinatorV3: addrStack(addresses.coordinator),
    marketplace: addrStack(addresses.marketplace),
    reserveCoordinatorMarketplaceV3: addrStack(addresses.marketplace),
    reserveCoordinatorVerifierV3: addrStack(addresses.verifier),
    reserveCoordinatorOwnerV3: addrStack(addresses.marketplace),
    verifierMarketplace: addrStack(addresses.marketplace),
    verifierNetwork: [["num", "-0x3"]],
    verifierEpoch: [["num", "0x1"]],
    verifierThreshold: [["num", "0x2"]],
    reserveCoordinatorVaultCodeHashV3: [["num", "0x" + vaultHash]],
    verifierValidatorKey: [["num", "0x" + "01".repeat(32)]],
  };
  const calls = [];
  const fetcher = async (_url, init) => {
    const request = JSON.parse(init.body);
    calls.push(request.method);
    let stack = values[request.method];
    if (request.method === "verifierValidatorKey") {
      const index = Number(BigInt(request.stack[0][1]));
      stack = [["num", "0x" + String(index + 1).padStart(64, "0")]];
    }
    return { ok: true, json: async () => ({ ok: true, result: { exit_code: 0, stack } }) };
  };
  const report = await verifyV3ProductionBindings(addresses, vaultHash, fetcher);
  assert.equal(report.bindingsVerified, true);
  assert.equal(report.checks.validatorSet.matches, true);
  assert.equal(calls.filter((name) => name === "verifierValidatorKey").length, 3);
  assert.equal(report.mainnetApproved, false);
});
