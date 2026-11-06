import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inspectV3TestnetReadiness } from "./check-v3-testnet-live-readiness.mjs";
const source = readFileSync(new URL("../contracts/TestReserveVault.tolk", import.meta.url), "utf8");
test("V3 live testnet refund remains blocked without independent proof", () => {
  const result = inspectV3TestnetReadiness(source);
  assert.equal(result.contractFound, true);
  assert.equal(result.ownerAttestationOnly, false);
  assert.equal(result.testnetDeploymentApproved, false);
  assert.equal(result.liveRefundTestApproved, false);
  assert.equal(result.liveRetryApproved, false);
  assert.equal(result.mainnetApproved, false);
  assert.ok(!result.reasons.includes("OWNER_ATTESTED_RETURN_CAN_TRIGGER_RETRY"));
});
test("malformed or missing contract fails closed", () => {
  assert.throws(() => inspectV3TestnetReadiness(""), TypeError);
});
