import { readFile } from "node:fs/promises";
import path from "node:path";

const workflowPath = path.resolve(
  process.cwd(),
  "../../.github/workflows/deploy-marketplace-v2-mainnet.yml",
);
const source = await readFile(workflowPath, "utf8");

const required = [
  "Marketplace V2 Mainnet Preflight (No Transactions)",
  "confirm_mainnet_preflight:",
  "default: false",
  "check-mainnet-fragment-libraries.mjs",
  "No mainnet transaction was signed or broadcast.",
  "acton script scripts/deploy-v2.tolk --net mainnet --tonconnect",
];
for (const value of required) {
  if (!source.includes(value)) {
    console.error(`Mainnet preflight workflow is missing required safety marker: ${value}`);
    process.exit(1);
  }
}

const forbidden = [
  "DEPLOYER_MNEMONIC",
  "Deploy and verify on TON Mainnet",
  "acton script scripts/deploy-v2.tolk --net mainnet 2>&1",
];
for (const value of forbidden) {
  if (source.includes(value)) {
    console.error(`Mainnet preflight workflow contains a forbidden deployment marker: ${value}`);
    process.exit(1);
  }
}

console.log("Mainnet workflow safety check passed: read-only preflight, no mnemonic, no mainnet broadcast.");
