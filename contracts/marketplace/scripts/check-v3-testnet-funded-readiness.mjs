// Fail-closed readiness assessment for funded V3 testnet trials.
// Pure filesystem checks; never loads a mnemonic or sends a transaction.
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  ["isolated V3 testnet deployment script", "scripts/deploy-v3-testnet.tolk"],
  ["V3 deployment postflight verifier", "scripts/verify-v3-testnet.mjs"],
  ["testnet transaction evidence collector", "scripts/collect-v3-testnet-evidence.mjs"],
  ["V3 contract audit signoff", "audits/v3-testnet-deployment-review.md"],
];
const blockers = [];
for (const [label, relative] of required) {
  const full = path.join(root, relative);
  try {
    await access(full);
    const content = await readFile(full, "utf8");
    if (!content.trim() || /placeholder|not deployable|simulation.only/i.test(content.slice(0, 1500))) {
      blockers.push({ label, path: relative, reason: "EMPTY_OR_EXPERIMENTAL" });
    }
  } catch {
    blockers.push({ label, path: relative, reason: "MISSING" });
  }
}
for (const relative of [
  "contracts/TestMarketplaceReserveV3.tolk",
  "contracts/TestReserveCoordinator.tolk",
  "contracts/TestReserveVault.tolk",
]) {
  const source = await readFile(path.join(root, relative), "utf8");
  if (/simulation.only|not deployable/i.test(source.slice(0, 1500))) {
    blockers.push({ label: "experimental contract", path: relative, reason: "SIMULATION_ONLY" });
  }
}
const report = {
  network: "testnet",
  executionAllowed: false,
  fundedTrialReady: false,
  blockers,
  requiresHumanReview: true,
  noTransactionSent: true,
};
console.log(JSON.stringify(report, null, 2));
if (blockers.length === 0) {
  console.error("BLOCKED: files present but security review and funded-trial authorization are not independently verified");
}
console.error("V3 TESTNET FUNDED TRIAL BLOCKED; no signer or transaction used");
