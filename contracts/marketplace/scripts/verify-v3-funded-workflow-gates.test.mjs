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
