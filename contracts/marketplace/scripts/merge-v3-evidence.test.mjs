import test from "node:test";
import assert from "node:assert/strict";
import { mergeV3Evidence } from "./merge-v3-evidence.mjs";
import { normalizeV3TestnetAddress } from "./verify-v3-testnet.mjs";
import { V3_TESTNET_OWNER, V3_TESTNET_TREASURY } from "./verify-v3-testnet-bindings.mjs";

const addresses = {
  marketplace: "0:" + "1".repeat(64),
  escrow: "0:" + "2".repeat(64),
  coordinator: "0:" + "3".repeat(64),
};
const owner = normalizeV3TestnetAddress(V3_TESTNET_OWNER);
const treasury = normalizeV3TestnetAddress(V3_TESTNET_TREASURY);
const methods = {
  marketplaceOwner: ["marketplace", "ownerV2", owner],
  marketplaceEscrow: ["marketplace", "escrowV2", addresses.escrow],
  marketplaceTreasury: ["marketplace", "treasuryV2", treasury],
  marketplaceCoordinator: ["marketplace", "testReserveCoordinator", addresses.coordinator],
  escrowMarketplace: ["escrow", "marketplace", addresses.marketplace],
  escrowOwner: ["escrow", "owner", owner],
  coordinatorMarketplace: ["coordinator", "testReserveMarketplace", addresses.marketplace],
  coordinatorOwner: ["coordinator", "testReserveOwner", owner],
};
function fixture() {
  const deployment = {
    network: "testnet", mainnetApproved: false,
    postflight: {
      network: "testnet", allActive: true, allCodePresent: true,
      codeHashesVerified: false, noTransactionSent: true,
      contracts: Object.fromEntries(Object.entries(addresses).map(([k, address]) => [k, { address }])),
    },
  };
  const binding = {
    network: "testnet", bindingsVerified: true, noTransactionSent: true, mainnetApproved: false,
    checks: Object.fromEntries(Object.entries(methods).map(([name, [contract, method, actual]]) =>
      [name, { contract, method, actual, expected: actual, matches: true }])),
  };
  return { deployment, binding };
}
test("combines activated contracts and eight matching bindings without approving funds", () => {
  const { deployment, binding } = fixture();
  const report = mergeV3Evidence(deployment, binding);
  assert.equal(report.activeAndBound, true);
  assert.equal(report.mainnetApproved, false);
  assert.equal(report.realFundsApproved, false);
  assert.equal(report.evidenceComplete, false);
  assert.ok(report.missingProof.includes("RESERVE_REFUND_FINALITY_AND_IDEMPOTENCY"));
});
test("rejects cross-deployment coordinator mismatch even if self-reported matches", () => {
  const { deployment, binding } = fixture();
  binding.checks.marketplaceCoordinator.actual = addresses.escrow;
  binding.checks.marketplaceCoordinator.expected = addresses.escrow;
  assert.throws(() => mergeV3Evidence(deployment, binding), /Cross-deployment mismatch/);
});
test("rejects missing or contradictory binding checks", () => {
  const { deployment, binding } = fixture();
  delete binding.checks.escrowOwner;
  assert.throws(() => mergeV3Evidence(deployment, binding), /eight binding checks/);
});
test("rejects evidence claiming mainnet approval", () => {
  const { deployment, binding } = fixture();
  binding.mainnetApproved = true;
  assert.throws(() => mergeV3Evidence(deployment, binding), /Unsafe or contradictory/);
});

test("rejects self-consistent but attacker-controlled privileged wallet bindings", () => {
  const { deployment, binding } = fixture();
  binding.checks.marketplaceTreasury.actual = addresses.marketplace;
  binding.checks.marketplaceTreasury.expected = addresses.marketplace;
  assert.throws(() => mergeV3Evidence(deployment, binding), /Privileged binding mismatch/);
});
test("rejects incomplete verification even when all individual checks look valid", () => {
  const { deployment, binding } = fixture();
  binding.bindingsVerified = false;
  assert.throws(() => mergeV3Evidence(deployment, binding), /Unverified account or binding evidence/);
});

test("caller-supplied matching hashes never count as independent reproducible build proof", () => {
  const { deployment, binding } = fixture();
  deployment.postflight.codeHashesVerified = true;
  const report = mergeV3Evidence(deployment, binding);
  assert.equal(report.observedCodeHashesMatchExpected, true);
  assert.equal(report.trustedCodeHashes, false);
  assert.ok(report.missingProof.includes("TRUSTED_ONCHAIN_CODE_HASH_MATCH"));
  assert.equal(report.mainnetApproved, false);
});
