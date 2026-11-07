import test from "node:test";
import assert from "node:assert/strict";
import { mergeV3Evidence } from "./merge-v3-evidence.mjs";

const addresses = {
  marketplace: "0:" + "1".repeat(64),
  escrow: "0:" + "2".repeat(64),
  coordinator: "0:" + "3".repeat(64),
};
const methods = {
  marketplaceOwner: ["marketplace", "ownerV2", addresses.marketplace],
  marketplaceEscrow: ["marketplace", "escrowV2", addresses.escrow],
  marketplaceTreasury: ["marketplace", "treasuryV2", addresses.marketplace],
  marketplaceCoordinator: ["marketplace", "testReserveCoordinator", addresses.coordinator],
  escrowMarketplace: ["escrow", "marketplace", addresses.marketplace],
  escrowOwner: ["escrow", "owner", addresses.marketplace],
  coordinatorMarketplace: ["coordinator", "testReserveMarketplace", addresses.marketplace],
  coordinatorOwner: ["coordinator", "testReserveOwner", addresses.marketplace],
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
