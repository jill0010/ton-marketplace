import test from "node:test";
import assert from "node:assert/strict";
import { inspectV3MainnetEnvironment } from "./preflight-v3-mainnet-environment.mjs";

const sample = {
  V3_MAINNET_DEPLOY_APPROVED: "true",
  V3_MAINNET_DEPLOYER_ADDRESS: "UQ" + "a".repeat(46),
  PLATFORM_TREASURY_ADDRESS: "UQ" + "b".repeat(46),
  V3_VALIDATOR_0_PUBLIC_KEY: "1",
  V3_VALIDATOR_1_PUBLIC_KEY: "2",
  V3_VALIDATOR_2_PUBLIC_KEY: "3",
  V3_MAINNET_DEPLOYMENT_NONCE: "42"
};
test("checks public inputs without authorizing any broadcast", () => {
  const report = inspectV3MainnetEnvironment(sample);
  assert.equal(report.environmentValid, true);
  assert.equal(report.safeToBroadcast, false);
  assert.equal(report.signerVerified, false);
  assert.equal(report.contractReleaseApproved, false);
});
test("missing approval fails closed", () => {
  const report = inspectV3MainnetEnvironment({ ...sample, V3_MAINNET_DEPLOY_APPROVED: "false" });
  assert.equal(report.environmentValid, false);
  assert.match(report.problems.join(" "), /V3_MAINNET_DEPLOY_APPROVED/);
});
test("rejects duplicate validator keys and out of range keys", () => {
  assert.equal(inspectV3MainnetEnvironment({ ...sample, V3_VALIDATOR_1_PUBLIC_KEY: "01" }).environmentValid, false);
  assert.equal(inspectV3MainnetEnvironment({ ...sample, V3_VALIDATOR_2_PUBLIC_KEY: (1n << 256n).toString() }).environmentValid, false);
});
test("checks nonce bounds and optional signer mismatch", () => {
  assert.equal(inspectV3MainnetEnvironment({ ...sample, V3_MAINNET_DEPLOYMENT_NONCE: "0" }).environmentValid, false);
  assert.equal(inspectV3MainnetEnvironment({ ...sample, V3_CONNECTED_DEPLOYER_ADDRESS: "UQ" + "c".repeat(46) }).environmentValid, false);
});
