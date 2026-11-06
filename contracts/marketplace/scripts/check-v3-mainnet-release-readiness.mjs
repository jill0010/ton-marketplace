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
  if (/simulation.only|not deployable|test.only|experimental/i.test(source.slice(0, 2000))) {
    console.error("BLOCKED: nonproduction " + label + " (" + relative + ")"); failures++;
  } else {
    console.log("PRESENT (not independently audited): " + label);
  }
}
if (failures) {
  console.error("MAINNET RELEASE BLOCKED: " + failures + " missing or experimental components. No transactions sent.");
  process.exitCode = 1;
} else {
  console.error("Files present only; this is NOT an audit or authorization to deploy Mainnet funds.");
}
