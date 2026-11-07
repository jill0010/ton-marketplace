import test from "node:test";
import assert from "node:assert/strict";
import { extractV3ProductionDeploymentEvidence } from "./postflight-v3-production-testnet.mjs";

test("production deployment evidence requires four unique addresses and four trusted hashes plus vault hash", () => {
  const names = ["marketplace", "escrow", "coordinator", "verifier"];
  const lines = [];
  for (const [index, name] of names.entries()) {
    lines.push("V3 testnet candidate " + name + ": 0:" + String(index + 1).padStart(64, "0"));
    lines.push("V3 trusted compiled " + name + " code hash: " + String(index + 1).padStart(64, "0"));
  }
  lines.push("V3 trusted compiled vault code hash: " + "ab".repeat(32));
  const evidence = extractV3ProductionDeploymentEvidence(lines.join("\n"));
  assert.equal(Object.keys(evidence.addresses).length, 4);
  assert.equal(Object.keys(evidence.hashes).length, 5);
  assert.equal(evidence.hashes.vault, "ab".repeat(32));
});

test("production deployment evidence extracts address token before human-readable annotation", () => {
  const names = ["marketplace", "escrow", "coordinator", "verifier"];
  const lines = [];
  for (const [index, name] of names.entries()) {
    lines.push("V3 testnet candidate " + name + ": 0:" + String(index + 1).padStart(64, "0") + " (verified Testnet contract)");
    lines.push("V3 trusted compiled " + name + " code hash: " + String(index + 1).padStart(64, "0"));
  }
  lines.push("V3 trusted compiled vault code hash: " + "ab".repeat(32));
  const evidence = extractV3ProductionDeploymentEvidence(lines.join("\n"));
  assert.equal(evidence.addresses.marketplace, "0:" + "0".repeat(63) + "1");
});

test("production deployment evidence rejects missing and duplicate address labels", () => {
  assert.throws(() => extractV3ProductionDeploymentEvidence(""));
  const line = "V3 testnet candidate marketplace: 0:" + "01".repeat(32);
  assert.throws(() => extractV3ProductionDeploymentEvidence(line + "\n" + line));
});
