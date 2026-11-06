import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inspectV3TestnetReadiness } from "./check-v3-testnet-live-readiness.mjs";
const source = readFileSync(new URL("../contracts/TestReserveVault.tolk", import.meta.url), "utf8");
const marketplace = readFileSync(new URL("../contracts/Marketplace.tolk", import.meta.url), "utf8");
const escrow = readFileSync(new URL("../contracts/NFTEscrow.tolk", import.meta.url), "utf8");
test("V3 live testnet refund remains blocked without independent proof", () => {
  const result = inspectV3TestnetReadiness(source, marketplace, escrow);
  assert.equal(result.contractFound, true);
  assert.equal(result.ownerAttestationOnly, false);
  assert.equal(result.testnetDeploymentApproved, false);
  assert.equal(result.liveRefundTestApproved, false);
  assert.equal(result.liveRetryApproved, false);
  assert.equal(result.mainnetApproved, false);
  assert.equal(result.hasPurchaseHandler, false);
  assert.equal(result.hasNftReleaseHandler, false);
  assert.equal(result.hasSettlementHandler, false);
  assert.ok(result.reasons.includes("NO_ONCHAIN_PURCHASE_HANDLER"));
  assert.ok(result.reasons.includes("NO_NFT_DELIVERY_HANDLER"));
  assert.ok(result.reasons.includes("NO_SELLER_FEE_SETTLEMENT_HANDLER"));
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
