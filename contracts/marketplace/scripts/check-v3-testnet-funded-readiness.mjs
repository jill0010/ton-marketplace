// Fail-closed readiness assessment for a funded production V3 Testnet trial.
// Pure filesystem checks; never loads a mnemonic or sends a transaction.
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  ["production V3 Testnet deployment script", "scripts/deploy-v3-production-testnet.tolk"],
  ["four-account production V3 postflight verifier", "scripts/verify-v3-production-testnet.mjs"],
  ["production V3 immutable binding verifier", "scripts/verify-v3-production-testnet-bindings.mjs"],
  ["production V3 deployment evidence postflight", "scripts/postflight-v3-production-testnet.mjs"],
  ["production V3 emulator purchase rehearsal", "scripts/rehearse-v3-production-purchase.tolk"],
  ["production V3 deployment workflow", "../../.github/workflows/deploy-marketplace-v3-production-testnet.yml"],
];
const blockers = [
  {
    label: "independent settlement attestor",
    path: "scripts/v3-settlement-attestor.mjs",
    reason: "MISSING_FINALIZED_TRANSACTION_PROOF_VALIDATOR_AND_SIGNER",
  },
  {
    label: "validator key custody and rotation review",
    path: "audits/v3-validator-key-custody-review.md",
    reason: "MISSING_INDEPENDENT_REVIEW",
  },
  {
    label: "funded purchase, NFT delivery, reserve refund and retry trace",
    path: "audits/v3-funded-testnet-settlement-trace.md",
    reason: "NO_REAL_FUNDED_END_TO_END_TESTNET_TRACE",
  },
  {
    label: "independent production contract security review",
    path: "audits/v3-production-contract-security-review.md",
    reason: "MISSING_SECURITY_SIGNOFF",
  },
];

for (const [label, relative] of required) {
  const full = path.resolve(root, relative);
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
for (const item of blockers.slice()) {
  if (item.path.startsWith("audits/") || item.path.startsWith("scripts/v3-settlement-attestor")) {
    try {
      await access(path.join(root, item.path));
      // Presence is not approval; reviewers must explicitly replace the blocker
      // in a separately reviewed readiness change.
    } catch {}
  }
}
const report = {
  network: "testnet",
  implementation: "production-v3-contract-candidate",
  deploymentWorkflowAvailable: true,
  executionAllowed: false,
  fundedTrialReady: false,
  blockers,
  requiresHumanReview: true,
  noTransactionSent: true,
};
console.log(JSON.stringify(report, null, 2));
console.error("PRODUCTION V3 TESTNET FUNDED TRIAL BLOCKED; no signer or transaction used");
