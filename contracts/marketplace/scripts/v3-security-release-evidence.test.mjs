import test from "node:test";
import assert from "node:assert/strict";
import { evaluateV3ReleaseEvidence } from "./v3-security-release-evidence.mjs";

test("empty security evidence blocks all live-funds release", () => {
  const gate = evaluateV3ReleaseEvidence({});
  assert.equal(gate.releaseApproved, false);
  assert.equal(gate.realFundsAllowed, false);
  assert.equal(gate.retryAllowed, false);
  assert.equal(gate.unverifiedChecks.length, 10);
});
test("forged all-green evidence cannot authorize mainnet", () => {
  const empty = evaluateV3ReleaseEvidence();
  const fake = Object.fromEntries(empty.requiredChecks.map((key) =>
    [key, { status: "verified", independent: true,
      artifact: "sha256:" + "a".repeat(64) }]));
  fake.releaseApproved = true;
  const gate = evaluateV3ReleaseEvidence(fake);
  assert.equal(gate.manifestComplete, true);
  assert.equal(gate.evidenceAuthenticated, false);
  assert.equal(gate.mainnetDeployAllowed, false);
  assert.equal(gate.realFundsAllowed, false);
  assert.ok(gate.ignoredClaims.includes("releaseApproved"));
});
test("invalid and partial audit evidence fail closed", () => {
  assert.throws(() => evaluateV3ReleaseEvidence(null), TypeError);
  const gate = evaluateV3ReleaseEvidence({
    independentContractAudit: {
      status: "verified", independent: true, artifact: "https://example.com/audit",
    },
  });
  assert.ok(gate.unverifiedChecks.includes("independentContractAudit"));
  assert.equal(gate.releaseApproved, false);
});
