// Fail-closed source invariant checks for the experimental V3 deploy candidate.
// These checks do not establish correctness or authorize live deployments.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const sourcePath = fileURLToPath(new URL("./deploy-v3-testnet.tolk", import.meta.url));

export function inspectV3DeploymentScript(source) {
  if (typeof source !== "string") throw new TypeError("Expected Tolk source");
  const required = [
    'env<bool>("V3_TESTNET_DEPLOY_APPROVED")',
    'env<address>("V3_TESTNET_DEPLOYER_ADDRESS")',
    'scripts.wallet("deployer").address == expectedDeployer!',
    "marketplaceRes.waitForFirstTransaction()",
    "escrowRes.waitForFirstTransaction()",
    "configureEscrow.waitForFirstTransaction()",
    "configureTreasury.waitForFirstTransaction()",
    "coordinatorDeploy.waitForFirstTransaction()",
    "coordinatorConfigure.waitForFirstTransaction()",
    "marketplace.escrowConfiguredV2()",
    "marketplace.treasuryConfiguredV2()",
    "escrow.marketplace() != marketplace.address",
  ];
  const missing = required.filter((value) => !source.includes(value));
  const unauthorizedBypass = source.includes("V3_TESTNET_EMULATION") ||
    /emulation\s*\|\|/.test(source);
  // A deployment error must not be reported as a successful script exit.
  const silentFailure = /(?:failed|aborted|verification failed)"\);\s*return;/i.test(source);
  // Deployment must not report success before all transaction checks.
  const orderedStages = [
    "marketplaceRes.waitForFirstTransaction()",
    "escrowRes.waitForFirstTransaction()",
    "configureEscrow.waitForFirstTransaction()",
    "configureTreasury.waitForFirstTransaction()",
    "coordinatorDeploy.waitForFirstTransaction()",
    "coordinatorConfigure.waitForFirstTransaction()",
    'println("V3 testnet candidate marketplace:',
  ];
  const stagePositions = orderedStages.map((stage) => source.indexOf(stage));
  const ordered = stagePositions.every((position, i) =>
    position >= 0 && (i === 0 || position > stagePositions[i - 1]));
  const guardedTransactions = [
    "marketplaceRes", "escrowRes", "configureEscrow", "configureTreasury",
    "coordinatorDeploy", "coordinatorConfigure",
  ].every((name) => {
    const match = source.match(new RegExp(`(?:if\\s*\\(\\s*${name}\\.waitForFirstTransaction\\(\\)\\s*==\\s*null\\s*\\)|assert\\s*\\(\\s*${name}\\.waitForFirstTransaction\\(\\)\\s*!=\\s*null\\s*\\))`));
    return Boolean(match);
  });
  return {
    ordered,
    guardedTransactions,
    requiredGuardsPresent: missing.length === 0,
    missing,
    unauthorizedBypass,
    silentFailure,
    safeToAttemptTestnet: missing.length === 0 && !unauthorizedBypass && !silentFailure && ordered && guardedTransactions,
    mainnetApproved: false,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = inspectV3DeploymentScript(readFileSync(sourcePath, "utf8"));
  console.log(JSON.stringify(result, null, 2));
  if (!result.safeToAttemptTestnet) process.exitCode = 1;
}
