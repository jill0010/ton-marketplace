import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/check-v3-testnet-funded-readiness.mjs", import.meta.url));
test("funded testnet readiness assessment remains fail-closed and names blockers", () => {
  const run = spawnSync(process.execPath, [script], {
    encoding: "utf8", timeout: 10000,
    env: { PATH: process.env.PATH },
  });
  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.equal(report.network, "testnet");
  assert.equal(report.executionAllowed, false);
  assert.equal(report.fundedTrialReady, false);
  assert.equal(report.requiresHumanReview, true);
  assert.equal(report.noTransactionSent, true);
  assert.ok(Array.isArray(report.blockers));
  assert.ok(report.blockers.some(x => x.reason === "SIMULATION_ONLY"));
  assert.match(run.stderr, /V3 TESTNET FUNDED TRIAL BLOCKED/);
});
