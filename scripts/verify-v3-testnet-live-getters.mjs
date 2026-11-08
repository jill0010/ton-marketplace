import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { Address, beginCell, Cell } from "@ton/core";

const key = process.env.TONCENTER_API_KEY;
const marketplace = Address.parse(process.env.V3_TESTNET_MARKETPLACE_ADDRESS);
const nft = Address.parse(process.env.V3_TESTNET_NFT_ITEM_ADDRESS);
const productId = process.env.V3_TESTNET_PRODUCT_ID;
assert(key, "TONCENTER_TESTNET_API_KEY is required");
assert(marketplace.workChain === 0 && nft.workChain === 0 && !marketplace.equals(nft));
assert(/^[1-9][0-9]{0,19}$/.test(productId) && BigInt(productId) <= 0xffffffffffffffffn);

async function getter(address, method, stack = []) {
  const response = await fetch("https://testnet.toncenter.com/api/v3/runGetMethod", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": key },
    body: JSON.stringify({ address: address.toRawString(), method, stack }),
    signal: AbortSignal.timeout(12000),
  });
  assert(response.ok, `${method}: HTTP ${response.status}`);
  const data = await response.json();
  assert.equal(data.exit_code ?? data.result?.exit_code, 0, `${method}: TVM execution failed`);
  const result = data.stack ?? data.result?.stack;
  assert(Array.isArray(result), `${method}: missing stack`);
  return result;
}
function number(entry) {
  assert.equal(entry?.type, "num");
  assert(typeof entry.value === "string");
  return BigInt(entry.value);
}
function address(entry) {
  assert.equal(entry?.type, "slice");
  const boc = entry.cell ?? entry.value;
  assert(typeof boc === "string");
  const slice = Cell.fromBase64(boc).beginParse();
  const parsed = slice.loadAddress();
  assert.equal(slice.remainingBits, 0);
  assert.equal(slice.remainingRefs, 0);
  return parsed;
}
const idArg = [{ type: "num", value: productId }];
const nftArg = [{ type: "slice", value: beginCell().storeAddress(nft).endCell().toBoc().toString("base64") }];
const [status, bound, escrow, nftData, escrowConfigured] = await Promise.all([
  getter(marketplace, "productStatusV2", idArg),
  getter(marketplace, "assetProductIdV2", nftArg),
  getter(marketplace, "escrowV2"),
  getter(nft, "get_nft_data"),
  getter(marketplace, "escrowConfiguredV2"),
]);
assert.equal(number(status[0]), 2n, "Product is not listed");
assert.equal(number(bound[0]), BigInt(productId), "NFT is not bound to product");
assert.equal(escrowConfigured.length, 1);
assert.equal(number(escrowConfigured[0]), -1n, "Escrow is not configured");
assert.equal(nftData.length, 5);
assert.equal(number(nftData[0]), -1n, "NFT is not initialized");
const escrowAddress = address(escrow[0]);
const ownerAddress = address(nftData[3]);
assert(ownerAddress.equals(escrowAddress), "NFT owner is not the Marketplace escrow");
const statusAfter = await getter(marketplace, "productStatusV2", idArg);
assert.equal(number(statusAfter[0]), 2n, "Listing changed during verification");
const summary = [
  "## V3 Testnet live getter verification",
  `Marketplace: ${marketplace.toRawString()}`,
  `Product ID: ${productId}`,
  `NFT Item: ${nft.toRawString()}`,
  `Escrow and NFT owner: ${escrowAddress.toRawString()}`,
  "Result: NFT custody and listing binding verified by live Testnet RPC.",
  "Read-only evidence only; no purchase authorization, signature or transfer.",
].join("\n");
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
