import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const edge = readFileSync("supabase/functions/marketplace-v3-testnet-readonly/index.ts", "utf8");
const client = readFileSync("src/lib/marketplaceV3TestnetReadonly.ts", "utf8");
const diagnostics = readFileSync("src/lib/marketplaceV3TestnetDiagnostics.ts", "utf8");

function quotedMembers(source, declaration) {
  const start = source.indexOf(declaration);
  assert.ok(start !== -1, `Missing declaration: ${declaration}`);
  const opening = source.indexOf("[", start + declaration.length);
  const closing = source.indexOf("]", opening + 1);
  assert.ok(opening !== -1 && closing > opening, `Invalid declaration: ${declaration}`);
  return new Set([...source.slice(opening + 1, closing).matchAll(/"([^"]+)"/g)]
    .map((match) => match[1]));
}
const backendGetters = quotedMembers(edge, "const GETTERS = new Set(");
const backendProduct = quotedMembers(edge, "const WITH_PRODUCT_ID = new Set(");
const backendOrder = quotedMembers(edge, "const WITH_ORDER_ID = new Set(");
const frontendGetters = quotedMembers(client, "export const V3_TESTNET_READONLY_METHODS =");
const frontendProduct = quotedMembers(client, "const PRODUCT_METHODS = new Set");

test("read-only getter allowlists match between client and server", () => {
  assert.deepEqual([...backendGetters].sort(), [...frontendGetters].sort());
});
test("product and order getter parameter contracts match", () => {
  assert.deepEqual([...backendProduct].sort(), [...frontendProduct].sort());
  for (const getter of backendProduct) assert.ok(backendGetters.has(getter));
  for (const getter of backendOrder) {
    assert.ok(backendGetters.has(getter));
    assert.ok(!backendProduct.has(getter));
  }
});
test("diagnostics only call supported getters", () => {
  const methods = quotedMembers(diagnostics, "const methods =");
  assert.ok(methods.size > 0);
  for (const getter of methods) {
    assert.ok(backendGetters.has(getter), `Unknown diagnostic getter: ${getter}`);
  }
});

test("listed products fail closed on missing contract bindings and escrow", () => {
  assert.match(diagnostics, /Listed V3 product has incomplete contract bindings/);
  assert.match(diagnostics, /Listed V3 product has no escrow binding/);
  assert.match(diagnostics, /Listed V3 product already has an order/);
  assert.match(diagnostics, /Allocated V3 product has no readable status/);
});
test("read-only diagnostics never authorize a purchase", () => {
  assert.match(diagnostics, /purchaseAuthorized: false/);
  assert.match(client, /verified_purchase_eligibility: false/);
  assert.match(edge, /verified_purchase_eligibility: false/);
});

test("NFT custody observation stays read-only and requires matching escrow", () => {
  assert.match(client, /export async function inspectV3TestnetNftCustody/);
  assert.match(client, /custodyMatches: actual\.equals\(expected\)/);
  assert.match(client, /purchaseAuthorized: false/);
  assert.ok(backendGetters.has("get_nft_data"));
  assert.ok(!backendProduct.has("get_nft_data"));
  assert.ok(!backendOrder.has("get_nft_data"));
});
