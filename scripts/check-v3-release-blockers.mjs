import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (p) => readFileSync(p, "utf8");
const quote = read("src/lib/marketplaceV3.ts");
const preflight = read("src/lib/marketplaceV3Preflight.ts");
const product = read("src/pages/ProductPage.tsx");
const retired = read(".github/workflows/finalize-existing-v3-order-3-testnet.yml");
const readonly = read(".github/workflows/v3-order-3-settlement-readonly.yml");

assert.match(quote, /MARKETPLACE_V3_TESTNET_CHAIN = "-3"/);
assert.match(quote, /input\.walletChain !== MARKETPLACE_V3_TESTNET_CHAIN/);
assert.match(preflight, /s\.existingOrderId !== null/);
assert.match(preflight, /s\.productStatus !== 2/);
assert.match(preflight, /input\.nowSeconds - s\.fetchedAtSeconds > 15/);
assert.match(product, /create-manual-product-order/);
assert.doesNotMatch(product, /prepareMarketplaceV3TestnetPurchase\(/);
assert.doesNotMatch(retired, /\$\{\{\s*secrets\./);
assert.doesNotMatch(retired, /acton script|sendTransaction|attest-v3-testnet-reserve-refund/);
assert.match(readonly, /verify-v3-order-3-settlement\.tolk/);
assert.doesNotMatch(readonly, /attest-v3-testnet-reserve-refund/);
console.log("V3 release blocked: Testnet guards preserved; settled-order signing retired; customer V3 checkout not yet enabled.");
