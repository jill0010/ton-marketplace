import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const workflow=readFileSync(new URL("../../../.github/workflows/deploy-marketplace-v3-production-testnet.yml",import.meta.url),"utf8");
test("historical funded deployment is disabled before checkout or transaction steps",()=>{
 const stop=workflow.indexOf("- name: Block historical funded V3 deployment and duplicate purchase");
 const checkout=workflow.indexOf("- name: Checkout");
 const deploy=workflow.indexOf("- name: Deploy Marketplace V3, Reserve Coordinator");
 const purchase=workflow.indexOf("- name: Submit one real Testnet purchase");
 assert.ok(stop>0 && stop<checkout && checkout<deploy && deploy<purchase);
 assert.match(workflow,/Historical V3 funded Testnet deployment is permanently disabled after order 1 settled/);
 assert.match(workflow,/Use the separate read-only verification workflow/);
});

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

test("purchase and settlement verifiers bind to the exact NFT and distinguish payout status from receipt",()=>{
 const purchase=readFileSync(new URL("./verify-v3-production-testnet-purchase.tolk",import.meta.url),"utf8");
 const settlement=readFileSync(new URL("./verify-v3-production-testnet-settlement.tolk",import.meta.url),"utf8");
 for(const script of [purchase,settlement]){
   assert.match(script,/assetProductIdV2\(nftItem!!\)/);
   assert.match(script,/orderIdForProductV2\(/);
   assert.match(script,/reserveCoordinatorVaultV3/);
   assert.match(script,/reserveVaultPrincipalV3/);
   assert.match(script,/grams\("0\.2"\)/);
 }
 assert.match(purchase,/Reserve is in-flight pending actual buyer receipt attestation/);
 assert.match(settlement,/INDEPENDENT TRANSFER FINALITY NOT ATTESTED/);
 assert.match(settlement,/recipient credit requires independent trace verification/);
 assert.match(settlement,/independent recipient receipt and validator quorum evidence must be audited separately/);
});

test("attestation uses verified dynamic order ID instead of defaulting to order one",()=>{
 const attest=readFileSync(new URL("./attest-v3-testnet-reserve-refund.mjs",import.meta.url),"utf8");
 assert.match(workflow,/Bind attestation to the verified on-chain order ID/);
 assert.match(workflow,/V3_TESTNET_ORDER_ID=/);
 assert.match(attest,/BigInt\(required\("V3_TESTNET_ORDER_ID"\)\)/);
 assert.doesNotMatch(attest,/V3_TESTNET_ORDER_ID \?\? "1"/);
 assert.match(attest,/findConfirmedPayouts\(owner\.toString\(\), buyerAddress\.toString\(\), marketplace\.toString\(\), orderId\)/);
 assert.match(attest,/0x71b00101, orderId/);
 assert.match(attest,/0x71b00102, orderId/);
});

test("settlement CI checks the exact verifier output and preserves read-only purchase evidence",()=>{
 assert.match(workflow,/grep -Fq "PRODUCTION V3 TESTNET ON-CHAIN STATE CHECK PASSED; INDEPENDENT TRANSFER FINALITY NOT ATTESTED\." v3-production-testnet-settlement\.log/);
 assert.match(workflow,/contracts\/marketplace\/v3-production-testnet-purchase-verification\.log/);
 assert.match(workflow,/contracts\/marketplace\/v3-production-testnet-purchase-verification-attempt-\*\.log/);
 assert.doesNotMatch(workflow,/grep -Fq "PRODUCTION V3 TESTNET END-TO-END SETTLEMENT VERIFIED\."/);
});

test("Testnet receipt attestor retries transient gateway 542 without archival lookup",()=>{
 const attest=readFileSync(new URL("./attest-v3-testnet-reserve-refund.mjs",import.meta.url),"utf8");
 assert.match(attest,/500, 502, 503, 504, 520, 522, 524, 542/);
 assert.doesNotMatch(attest,/archival: "true"/);
});


test("final settlement audit compiles with network and IO imports and never sends transactions",()=>{
 const script=readFileSync(new URL("./verify-v3-production-testnet-settlement.tolk",import.meta.url),"utf8");
 const audit=readFileSync(new URL("../../../.github/workflows/verify-existing-v3-testnet-settlement-readonly.yml",import.meta.url),"utf8");
 assert.match(script,/import "@acton\/io"/);
 assert.match(script,/import "@acton\/emulation\/network"/);
 assert.match(script,/assert \(orderId!! == 1\) throw 939/);
 assert.match(script,/reserveVaultStatusV3/);
 assert.match(script,/reserveVaultPaidV3/);
 assert.match(script,/reserveVaultInFlightV3/);
 assert.match(script,/reserveVaultAvailableV3/);
 assert.doesNotMatch(script,/\.send[A-Z]|sendMessage|sendTransaction|deploy\(/);
 assert.match(audit,/acton script scripts\/verify-v3-production-testnet-settlement\.tolk --net testnet/);
 assert.doesNotMatch(audit,/--net mainnet|attest-v3-testnet-reserve-refund|buy-v3-production-testnet-fixture|sendTransaction/);
});
