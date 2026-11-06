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
  assert.equal(result.unsafeBuyerRefundRetry, false);
  assert.ok(!result.reasons.includes("V2_BUYER_REFUND_RETRY_LACKS_INDEPENDENT_RETURN_PROOF"));
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

test("reopening bounce-only buyer refund retry blocks release readiness", () => {
  const unsafeMarketplace = marketplace.replace(
    /if \(payout\.kind == 3\) \{(?:\s|\/\/[^\n]*\n)*throw ErrorsV2\.InvalidPayout;/,
    "if (payout.kind == 3) {\n                assert (order.refundStatus == 3) throw ErrorsV2.InvalidPayout;",
  );
  assert.notEqual(unsafeMarketplace, marketplace, "fixture must remove the refund guard");
  const result = inspectV3TestnetReadiness(source, unsafeMarketplace, escrow);
  assert.equal(result.unsafeBuyerRefundRetry, true);
  assert.ok(result.reasons.includes("V2_BUYER_REFUND_RETRY_LACKS_INDEPENDENT_RETURN_PROOF"));
  assert.equal(result.mainnetApproved, false);
});

test("refund retry guard must not be bypassed by adding an earlier unsafe branch", () => {
  const unsafeMarketplace = marketplace.replace(
    "RetryPayoutV2 => {",
    "RetryPayoutV2 => {\n            // A new refund path ahead of the existing fail-closed guard.\n            if (false) {\n                val bypass = BuyerRefundV2 { orderId: 1, operationId: 1, queryId: 1 };\n            }",
  );
  assert.notEqual(unsafeMarketplace, marketplace);
  const result = inspectV3TestnetReadiness(source, unsafeMarketplace, escrow);
  assert.equal(result.mainnetApproved, false);
});
