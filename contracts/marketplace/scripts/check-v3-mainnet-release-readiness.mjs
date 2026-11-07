// Read-only release gate. This file must fail closed until production V3 exists.
// It does not sign, broadcast, or claim that emulator tests prove Mainnet safety.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checks = [
  ["production V3 marketplace", "contracts/MarketplaceReserveV3.tolk"],
  ["production V3 coordinator", "contracts/ReserveCoordinatorV3.tolk"],
  ["production V3 reserve vault", "contracts/ReserveVaultV3.tolk"],
  ["V3 Mainnet deployment script", "scripts/deploy-v3-mainnet.tolk"],
  ["V3 Mainnet post-deployment verification", "scripts/verify-v3-mainnet.mjs"],
];
let failures = 0;
for (const [label, relative] of checks) {
  let source;
  try { source = await readFile(path.join(root, relative), "utf8"); }
  catch { console.error("BLOCKED: missing " + label + " (" + relative + ")"); failures++; continue; }
  if (!source.trim() || /simulation.only|not deployable|test.only|experimental/i.test(source.slice(0, 2000))) {
    console.error("BLOCKED: nonproduction " + label + " (" + relative + ")"); failures++;
  } else if (relative.endsWith(".tolk") &&
    !/\bcontract\s+[A-Za-z][A-Za-z0-9_]*/.test(source)) {
    console.error("BLOCKED: missing contract declaration in " + relative); failures++;
  } else if (relative.endsWith(".mjs") &&
    !/\b(import|export|const|let|function|await)\b/.test(source)) {
    console.error("BLOCKED: verification script has no executable JS in " + relative); failures++;
  } else {
    console.log("PRESENT (not independently audited): " + label);
  }
}
// A source-file presence check can NEVER approve a production release.
// Explicitly require independently verified safety evidence, not filenames,
// testnet account activation, owner-supplied hashes, or emulator-only tests.
const mandatoryProofs = [
  "TRUSTED_REPRODUCIBLE_PRODUCTION_CODE_HASHES",
  "INDEPENDENT_SECURITY_REVIEW",
  "REAL_TESTNET_PURCHASE_DELIVERY_SETTLEMENT",
  "RESERVE_REFUND_FINALITY_NO_DOUBLE_PAYOUT",
  "PRODUCTION_DEPLOYMENT_CONFIGURATION_AND_ROLLBACK",
];
for (const proof of mandatoryProofs) {
  console.error("BLOCKED: independent release proof required: " + proof);
}
console.error("MAINNET RELEASE BLOCKED: " + failures + " missing or experimental components; " +
  mandatoryProofs.length + " independent release proofs outstanding. No transactions sent.");
process.exitCode = 1;
