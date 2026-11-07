import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const workflow=readFileSync(new URL("../../../.github/workflows/deploy-marketplace-v3-production-testnet.yml",import.meta.url),"utf8");
test("funded V3 Testnet workflow requires independent deployment and purchase consent",()=>{
 assert.match(workflow,/confirm_production_v3_testnet_only == true && inputs\.confirm_one_funded_testnet_purchase == true && github\.run_attempt == 1/);
 assert.match(workflow,/confirm_one_funded_testnet_purchase:[\s\S]*?default: false/);
 assert.match(workflow,/confirm_production_v3_testnet_only:[\s\S]*?default: false/);
});
test("funded V3 Testnet workflow rejects reruns before deployment or payment",()=>{
 assert.match(workflow,/test "\$GITHUB_RUN_ATTEMPT" = "1"/);
 assert.match(workflow,/Rerun blocked: cannot safely repeat a potentially submitted Testnet purchase/);
});
test("funded V3 Testnet workflow does not invoke mainnet",()=>{
 assert.doesNotMatch(workflow,/acton (?:script|rpc)[^\n]*--net mainnet/);
 assert.match(workflow,/acton script scripts\/buy-v3-production-testnet-fixture\.tolk --net testnet/);
});

test("purchase script verifies listing, ownership and uniqueness before sending",()=>{
 const script=readFileSync(new URL("./buy-v3-production-testnet-fixture.tolk",import.meta.url),"utf8");
 const send=script.indexOf("marketplace.sendBuyProductV2(");
 assert.ok(send>0);
 for(const guard of ["assetProductIdV2(nftItem!!)", "productStatusV2(productId)", "orderIdForProductV2(productId) == null", "listing!!.price == grams(\"0.01\")", "listing!!.seller != buyer.address", "paymentQueryUsedV3", "get_nft_data", "marketplaceReserveCoordinatorConfiguredV3"]) {
   assert.ok(script.indexOf(guard)>=0 && script.indexOf(guard)<send, "Missing pre-send guard: "+guard);
 }
 assert.match(script,/value: grams\("0\.21"\)/);
 assert.match(script,/result\.waitForTrace\(\)/);
 assert.match(script,/if \(persistedOrderId == null\)/);
});
