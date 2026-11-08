import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./verify-v3-testnet-deployed-code.mjs", import.meta.url));
const addresses = {
  V3_TESTNET_MARKETPLACE_ADDRESS: "kQB9Q03obJYKG84bfXFrpL6OtUcX41z54A3m4LFGf_0a14D_",
  V3_TESTNET_ESCROW_ADDRESS: "kQAp5SqhqBj1LK3q9mHpBDsVzUnMyWBiH-nvtTB7q0vdP0mG",
  V3_TESTNET_COORDINATOR_ADDRESS: "kQAhqpc_v-G6PDX5BavZPT0SsqmOWm9hvBomPZIJ9cOHdQop",
};
test("deployed hash verifier rejects missing contract address before any RPC request", () => {
  const dir = mkdtempSync(join(tmpdir(), "v3-postflight-"));
  try {
    const env = { ...process.env, ...addresses, V3_TESTNET_ESCROW_ADDRESS: "", V3_EVIDENCE_OUTPUT: join(dir, "evidence.json") };
    const run = spawnSync(process.execPath, [script], { env, encoding: "utf8", timeout: 15000 });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /Missing testnet escrow address/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("deployed hash verifier rejects malformed address without RPC request", () => {
  const dir = mkdtempSync(join(tmpdir(), "v3-postflight-"));
  try {
    const env = { ...process.env, ...addresses, V3_TESTNET_MARKETPLACE_ADDRESS: "invalid", V3_EVIDENCE_OUTPUT: join(dir, "evidence.json") };
    const run = spawnSync(process.execPath, [script], { env, encoding: "utf8", timeout: 15000 });
    assert.notEqual(run.status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("read-only verifier records RPC failures and exits nonzero", () => {
  const dir = mkdtempSync(join(tmpdir(), "v3-postflight-"));
  try {
    const env = { ...process.env, ...addresses, V3_EVIDENCE_OUTPUT: join(dir, "evidence.json") };
    const runner = `
      globalThis.fetch = async () => ({ ok: false, status: 503 });
      await import(${JSON.stringify(new URL("./verify-v3-testnet-deployed-code.mjs", import.meta.url).href)});
    `;
    const run = spawnSync(process.execPath, ["--input-type=module", "-e", runner], { env, encoding: "utf8", timeout: 15000 });
    assert.notEqual(run.status, 0);
    const evidence = JSON.parse(readFileSync(join(dir, "evidence.json"), "utf8"));
    assert.equal(evidence.allMatch, false);
    for (const role of ["marketplace", "escrow", "coordinator"]) {
      assert.equal(evidence.contracts[role].match, false);
      assert.match(evidence.contracts[role].error, /HTTP 503/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
