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

test("production V3 contract source preserves custody, owner, and reserve authorization gates",()=>{
 const root=new URL("../contracts/",import.meta.url);
 const market=readFileSync(new URL("MarketplaceReserveV3.tolk",root),"utf8");
 const coordinator=readFileSync(new URL("ReserveCoordinatorV3.tolk",root),"utf8");
 const vault=readFileSync(new URL("ReserveVaultV3.tolk",root),"utf8");
 for(const snippet of [
  "in.senderAddress == storage.owner",
  "!purchase.coordinatorConfigured && purchase.nextOrderId == 1",
  "!storage.escrowConfigured",
  "!purchase.treasuryConfigured",
  "purchase.nextOrderId == 1",
  "purchase.schemaVersion == 3",
  "in.valueCoins == product.price + grams(\"0.2\")",
  "!orderStorage.productToOrder.get(msg.productId).isFound",
  "!orderStorage.paymentQueryToOrder.get(msg.queryId).isFound",
 ]) assert.ok(market.includes(snippet),"Marketplace missing security gate: "+snippet);
 for(const snippet of [
  "in.senderAddress == storage.marketplace",
  "!storage.bindings.get(msg.orderId).isFound",
  "in.valueCoins == grams(\"0.28\")",
  "in.senderAddress == binding.vault",
  "in.senderAddress == storage.owner",
 ]) assert.ok(coordinator.includes(snippet),"Coordinator missing security gate: "+snippet);
 for(const snippet of [
  "in.senderAddress == funding.fundingSource",
  "in.senderAddress == funding.marketplace",
  "in.senderAddress == funding.marketplace || in.senderAddress == storage.owner",
  "in.senderAddress == parties.verifier",
  "root.networkGlobalId == -3",
  "!storage.consumedStatements.get(msg.statement.hash()).isFound",
  "msg.statementHash == operation.activeStatementHash",
  "msg.settledAmount == balances.inFlight",
  "operation.retryCount == 0",
 ]) assert.ok(vault.includes(snippet),"Vault missing security gate: "+snippet);
});

test("all V3 transaction scripts remain explicitly Testnet-gated and legacy workflow remains disabled",()=>{
 const scripts=[
  ["deploy-v3-production-testnet.tolk","V3_PRODUCTION_TESTNET_DEPLOY_APPROVED"],
  ["buy-v3-production-testnet-fixture.tolk","V3_TESTNET_PURCHASE_ENABLED"],
 ];
 for(const [filename,flag] of scripts){
  const source=readFileSync(new URL("./"+filename,import.meta.url),"utf8");
  assert.ok(source.includes('env<bool>("'+flag+'") ?? false'),filename+" missing fail-closed authorization");
  assert.ok(source.includes("throw "),filename+" missing authorization failure");
  assert.doesNotMatch(source,/--net mainnet|networkGlobalId:\\s*-239/);
 }
 const deploy=readFileSync(new URL("../../../.github/workflows/deploy-marketplace-v3-production-testnet.yml",import.meta.url),"utf8");
 const guard=deploy.indexOf("- name: Block historical funded V3 deployment and duplicate purchase");
 const firstCheckout=deploy.indexOf("- name: Checkout");
 assert.ok(guard>=0 && guard<firstCheckout);
 assert.match(deploy.slice(guard,firstCheckout),/exit 1/);
 assert.doesNotMatch(deploy,/acton (?:script|rpc)[^\\n]*--net mainnet/);
});

test("settlement quorum verifier enforces domain, network, expiry, signatures and one-time statements",()=>{
 const verifier=readFileSync(new URL("../contracts/SettlementAttestationVerifierV3.tolk",import.meta.url),"utf8");
 for(const gate of [
  "root.domain == SETTLEMENT_DOMAIN_V3",
  "root.schemaVersion == SETTLEMENT_SCHEMA_V3",
  "root.networkGlobalId == storage.networkGlobalId",
  "identity.marketplace == storage.marketplace",
  "identity.vault == in.senderAddress",
  "result.epoch == storage.epoch",
  "result.expiresAt >= blockchain.now()",
  "result.expiresAt <= blockchain.now() + 900",
  "storage.threshold >= 2 && storage.threshold <= 3",
  "validator0.loadValue() != validator1.loadValue()",
  "validator0.loadValue() != validator2.loadValue()",
  "validator1.loadValue() != validator2.loadValue()",
  "signatureSlice.remainingBitsCount() == 512",
  "signatureSlice.remainingRefsCount() == 0",
  "isSignatureValid(statementHash, signatureSlice, keyFound.loadValue())",
  "validSignatures >= storage.threshold",
  "!storage.consumedStatements.get(statementHash).isFound",
  "storage.consumedStatements.set(statementHash, 1)",
  "in.senderAddress == storage.owner",
 ]) assert.ok(verifier.includes(gate),"Settlement verifier missing protection: "+gate);
 const vault=readFileSync(new URL("../contracts/ReserveVaultV3.tolk",import.meta.url),"utf8");
 assert.ok(vault.includes("in.senderAddress == parties.verifier"));
 assert.ok(vault.includes("msg.statementHash == operation.activeStatementHash"));
 assert.ok(vault.includes("storage.consumedStatements.set(msg.statementHash, true)"));
});

test("V3 payout and reserve settlement keep delivery, refund and retry paths mutually gated",()=>{
 const market=readFileSync(new URL("../contracts/MarketplaceReserveV3.tolk",import.meta.url),"utf8");
 const section=(start,end)=>{const a=market.indexOf(start);const b=market.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,"missing handler boundary "+start);return market.slice(a,b)};
 const delivery=section("EscrowReleasedV2 => {","RetryPayoutV2 => {");
 for(const guard of [
  "reserve.status == 2 && reserve.vault != null",
  "in.senderAddress == storage.escrow",
  "order.status == 2 && order.deliveryStatus == 1",
  "sellerPayout.status == 1 && platformPayout.status == 1",
  "operations.releaseQueryId == msg.queryId",
  "storage.save()",
  "DispatchReserveRefundV3 { orderId: order.id }",
 ]) assert.ok(delivery.includes(guard),"delivery protection missing: "+guard);
 assert.ok(delivery.indexOf("storage.save()")<delivery.indexOf("sellerTransfer.send("));
 const retry=section("RetryPayoutV2 => {","PublishProductV2 => {");
 assert.ok(retry.includes("assert (payout.status == 3)"));
 assert.ok(retry.includes("if (payout.kind == 3)"));
 assert.ok(retry.includes("throw ErrorsV2.InvalidPayout;"));
 assert.ok(retry.includes("order.deliveryStatus == 2"));
 const refund=section("EscrowRefundedV2 => {","get fun ");
 assert.ok(refund.includes("in.senderAddress == storage.escrow"));
 assert.ok(refund.includes("if (refundPayout.status == 0)"));
 assert.ok(refund.includes("reserve.status == 2 && reserve.vault != null"));
 assert.ok(refund.includes("reserve.status == 3 && reserve.vault != null"));
});

test("seller and platform payout retries require matching rich bounce and current operation identity",()=>{
 const market=readFileSync(new URL("../contracts/MarketplaceReserveV3.tolk",import.meta.url),"utf8");
 const bounce=market.slice(market.indexOf("fun onBouncedMessage("));
 const retry=market.slice(market.indexOf("RetryPayoutV2 => {"),market.indexOf("PublishProductV2 => {"));
 for(const gate of [
  "in.bouncedBody.preloadUint(32) != 0xfffffffe",
  "RichBounceBody.fromSlice(in.bouncedBody)",
  "SellerPayoutV2.fromCell(originalBody)",
  "PlatformPayoutV2.fromCell(originalBody)",
  "payout.beneficiary != in.senderAddress",
  "payout.queryId != bounced.queryId",
  "payout.status != 2",
  "order.deliveryStatus != 2",
  "payout.status = 3",
 ]) assert.ok(bounce.includes(gate),"payout bounce correlation missing: "+gate);
 assert.ok(retry.includes("assert (payout.status == 3)"));
 assert.ok(retry.includes("payout.queryId = newQueryId"));
 assert.ok(retry.includes("payout.status = 2"));
 assert.ok(retry.includes("if (payout.kind == 3)"));
 assert.ok(retry.includes("throw ErrorsV2.InvalidPayout;"));
});
