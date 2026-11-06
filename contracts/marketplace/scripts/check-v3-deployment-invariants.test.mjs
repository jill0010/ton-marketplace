import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inspectV3DeploymentScript } from "./check-v3-deployment-invariants.mjs";

const source = readFileSync(new URL("./deploy-v3-testnet.tolk", import.meta.url), "utf8");

test("current V3 deployment script retains critical fail-closed guards", () => {
  const result = inspectV3DeploymentScript(source);
  assert.equal(result.safeToAttemptTestnet, true, JSON.stringify(result));
  assert.equal(result.mainnetApproved, false);
});

test("rejects simulation authorization bypass", () => {
  assert.equal(inspectV3DeploymentScript(source + '\nval emulation = env<bool>("V3_TESTNET_EMULATION");').safeToAttemptTestnet, false);
});

test("rejects silent deployment failure and removed signer checks", () => {
  assert.equal(inspectV3DeploymentScript(source + '\nprintln("Deployment aborted"); return;').safeToAttemptTestnet, false);
  assert.equal(inspectV3DeploymentScript(source.replace('scripts.wallet("deployer").address == expectedDeployer!', "true")).safeToAttemptTestnet, false);
});
