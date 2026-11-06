import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

test("V3 Mainnet release is blocked while production components are absent", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const result = spawnSync(process.execPath, [path.join(here, "check-v3-mainnet-release-readiness.mjs")], {
    encoding: "utf8", timeout: 15000,
  });
  assert.equal(result.status, 1, "Preflight must fail closed until production V3 is implemented");
  assert.match(result.stderr, /MAINNET RELEASE BLOCKED/);
  assert.match(result.stderr, /No transactions sent/);
  assert.match(result.stderr, /production V3 marketplace/);
  assert.match(result.stderr, /production V3 coordinator/);
  assert.match(result.stderr, /production V3 reserve vault/);
});
