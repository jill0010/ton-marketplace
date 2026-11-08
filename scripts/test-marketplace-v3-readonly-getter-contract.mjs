import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const edge = readFileSync("supabase/functions/marketplace-v3-testnet-readonly/index.ts", "utf8");
const client = readFileSync("src/lib/marketplaceV3TestnetReadonly.ts", "utf8");
const diagnostics = readFileSync("src/lib/marketplaceV3TestnetDiagnostics.ts", "utf8");

function quotedMembers(source, constant) {
  const match = source.match(new RegExp("const " + constant + " = (?:new Set(?:<[^>]+>)?\\(\\[|\\[)([\\s\\S]*?)\\](?:\\)|)\\s*(?:as const)?;"));
  assert.ok(match, `Missing ${constant} declaration`);
  return new Set([...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]));
}
const backendGetters = quotedMembers(edge, "GETTERS");
const backendProduct = quotedMembers(edge, "WITH_PRODUCT_ID");
const backendOrder = quotedMembers(edge, "WITH_ORDER_ID");
const frontendGetters = quotedMembers(client, "V3_TESTNET_READONLY_METHODS");
const frontendProduct = quotedMembers(client, "PRODUCT_METHODS");

test("read-only getter allowlists are identical between client and server", () => {
  assert.deepEqual([...backendGetters].sort(), [...frontendGetters].sort());
});
test("all product getters require an ID on both sides", () => {
  assert.deepEqual([...backendProduct].sort(), [...frontendProduct].sort());
  for (const getter of backendProduct) assert.ok(backendGetters.has(getter));
  for (const getter of backendOrder) assert.ok(backendGetters.has(getter));
  for (const getter of backendOrder) assert.ok(!backendProduct.has(getter));
});
test("diagnostics call only supported getters", () => {
  const match = diagnostics.match(/const methods = \\[([\\s\\S]*?)\\] as const;/);
  assert.ok(match);
  for (const [, getter] of match[1].matchAll(/"([^"]+)"/g)) {
    assert.ok(backendGetters.has(getter), `Unknown diagnostic getter: ${getter}`);
  }
});
