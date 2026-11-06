import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inspectV3TestnetReadiness } from "./check-v3-testnet-live-readiness.mjs";
const source = readFileSync(new URL("../contracts/TestReserveVault.tolk", import.meta.url), "utf8");
const marketplace = readFileSync(new URL("../contracts/MarketplaceV2.tolk", import.meta.url), "utf8");
const escrow = readFileSync(new URL("../contracts/NFTEscrowV2.tolk", import.meta.url), "utf8");
test("V3 live testnet refund remains blocked without independent proof", () => {
  const result = inspectV3TestnetReadiness(source, marketplace, escrow);
  assert.equal(result.contractFound, true);
  assert.equal(result.ownerAttestationOnly, false);
  assert.equal(result.testnetDeploymentApproved, false);
  assert.equal(result.liveRefundTestApproved, false);
  assert.equal(result.liveRetryApproved, false);
  assert.equal(result.mainnetApproved, false);
  assert.equal(result.hasPurchaseHandler, true);
  assert.equal(result.hasNftReleaseHandler, true);
  assert.equal(result.hasSettlementHandler, true);
  assert.ok(result.reasons.includes("V3_VAULT_NOT_INTEGRATED_WITH_V2_PURCHASE_SETTLEMENT"));
  assert.ok(!result.reasons.includes("OWNER_ATTESTED_RETURN_CAN_TRIGGER_RETRY"));
});
test("malformed or missing contract fails closed", () => {
  assert.throws(() => inspectV3TestnetReadiness(""), TypeError);
});

test("partial handler stubs cannot open production release gate", () => {
  const stubMarketplace = marketplace + "\n| BuyProduct\nBuyProduct => {}\n| SettlePurchase\nSettlePurchase => {}";
  const stubEscrow = escrow + "\n| ReleaseNft\nReleaseNft => {}";
  const result = inspectV3TestnetReadiness(source, stubMarketplace, stubEscrow);
  assert.equal(result.testnetDeploymentApproved, false);
  assert.equal(result.mainnetApproved, false);
  assert.ok(result.reasons.includes("NO_INDEPENDENT_ONCHAIN_SETTLEMENT_PROOF"));
});
