// S07-04: read-only admission gate for a NEW production-code testnet purchase.
// This does not create a listing, deploy an NFT, or send TON.
import { readFileSync } from "node:fs";
import { verifyV3ProductionTestnet } from "./verify-v3-production-testnet.mjs";
import { verifyV3ProductionBindings } from "./verify-v3-production-testnet-bindings.mjs";

const addresses = {
  marketplace: "kQC_UhR2wStYmFmPl_W2acYW7aeLUMBWn7GgQN4b1GmxqCyA",
  escrow: "kQBMWX9agczB5MGgqHQTBU2yhVS7ApWAjhgaeoFHdkQBRsCy",
  coordinator: "kQAxUi7LTfvy02mzY_d3odgbIklni0lNtOn5VEwta4ZMFowc",
  verifier: "kQB91R0ihPflIhFRFrfEKq0IhIQfzcoazsf6BPUa01_27Xu0",
};
const hashes = {
  marketplace: "ad3dee71e21d733399b82421d16bc74268f47c9ac068b73ba159a0aba64650eb",
  escrow: "b4672de5774209c33b39c6d20a2763749911b28484b5e3795cd8b165ea824f38",
  coordinator: "9371f8ccaeb8327a793bfb65e42caa55476c2242459b2c73551d85ac8092c0d4",
  verifier: "58bd090fb8b11c904d7635b355a1ca1b07faffbe8c7c25570058bf6b4ba15615",
};
const vaultHash = "d5225b3d77a5700476a3046d663a66907162849989c49caa4b98412ace60be1e";
const files = [
  "contracts/marketplace/scripts/run-v3-production-testnet-fixture.tolk",
  "contracts/marketplace/scripts/buy-v3-production-testnet-fixture.tolk",
  "contracts/marketplace/scripts/verify-v3-production-testnet-purchase.tolk",
  "contracts/marketplace/scripts/verify-v3-production-testnet-settlement.tolk",
];
const source = Object.fromEntries(files.map(p => [p, readFileSync(p, "utf8")]));
const sourceChecks = {
  buyUsesMarketplaceV2Wrapper: source[files[1]].includes('import "@wrappers/MarketplaceV2.gen"'),
  buyReadsExplicitMarketplaceAddress: source[files[1]].includes('env<address>("V3_PRODUCTION_TESTNET_MARKETPLACE_ADDRESS")'),
  buyChecksUnpurchasedListing: source[files[1]].includes("orderIdForProductV2(productId) == null"),
  buyChecksReserveCoordinatorConfigured: source[files[1]].includes("marketplaceReserveCoordinatorConfiguredV3"),
  buyWaitsForFullTrace: source[files[1]].includes("waitForTrace()"),
  fixtureUsesExplicitMarketplaceAddress: source[files[0]].includes("V3_PRODUCTION_TESTNET_MARKETPLACE_ADDRESS"),
};
const code = await verifyV3ProductionTestnet(addresses, undefined, hashes);
const bindings = await verifyV3ProductionBindings(addresses, vaultHash);
const sourceCompatible = Object.values(sourceChecks).every(Boolean);
const report = {
  stage: "S07-04-02",
  network: "testnet",
  addresses,
  sourceChecks,
  sourceCompatible,
  contractsActive: code.allActive,
  codeHashesVerified: code.codeHashesVerified,
  bindingsVerified: bindings.bindingsVerified,
  failedBindings: Object.entries(bindings.checks ?? {}).filter(([, v]) => !v.matches).map(([k]) => k),
  freshListingPrepared: false,
  fundedPurchaseVerified: false,
  settlementVerified: false,
  mainnetApproved: false,
  noTransactionSent: true,
};
console.log(JSON.stringify(report, null, 2));
if (!report.contractsActive || !report.codeHashesVerified || !report.bindingsVerified || !sourceCompatible) process.exitCode = 1;
