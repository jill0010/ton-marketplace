// S07-03 preflight: refuse writes unless exactly the two observed Marketplace links are missing.
import { verifyV3ProductionBindings } from "./verify-v3-production-testnet-bindings.mjs";
import { verifyV3ProductionTestnet } from "./verify-v3-production-testnet.mjs";
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
const code = await verifyV3ProductionTestnet(addresses, undefined, hashes);
if (!code.allActive || !code.codeHashesVerified) throw new Error("S07-03 blocked: production code changed or inactive");
const bindings = await verifyV3ProductionBindings(addresses, "d5225b3d77a5700476a3046d663a66907162849989c49caa4b98412ace60be1e");
const missing = Object.entries(bindings.checks).filter(([, check]) => !check.matches).map(([key]) => key).sort();
if (JSON.stringify(missing) !== JSON.stringify(["marketplaceCoordinator", "marketplaceEscrow"])) {
  console.error(JSON.stringify({ missing, checks: bindings.checks }, null, 2));
  throw new Error("S07-03 blocked: unexpected chain state or already bound; no transaction sent");
}
console.log("S07-03 preflight passed: only Escrow and Coordinator bindings missing; 4/4 active and trusted hashes matched.");
