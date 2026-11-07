// Combine separately collected V3 testnet proofs without ever approving mainnet.
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { normalizeV3TestnetAddress } from "./verify-v3-testnet.mjs";
import { V3_TESTNET_OWNER, V3_TESTNET_TREASURY } from "./verify-v3-testnet-bindings.mjs";

export function mergeV3Evidence(deployment, binding) {
  if (deployment?.network !== "testnet" || binding?.network !== "testnet" ||
      deployment?.postflight?.network !== "testnet") throw new Error("Expected testnet evidence");
  const contracts = deployment.postflight.contracts;
  if (!contracts || !binding.checks || Object.keys(binding.checks).length !== 8) {
    throw new Error("Missing contract evidence or eight binding checks");
  }
  const expectedMethods = {
    marketplaceOwner: ["marketplace", "ownerV2"],
    marketplaceEscrow: ["marketplace", "escrowV2"],
    marketplaceTreasury: ["marketplace", "treasuryV2"],
    marketplaceCoordinator: ["marketplace", "testReserveCoordinator"],
    escrowMarketplace: ["escrow", "marketplace"],
    escrowOwner: ["escrow", "owner"],
    coordinatorMarketplace: ["coordinator", "testReserveMarketplace"],
    coordinatorOwner: ["coordinator", "testReserveOwner"],
  };
  for (const [name, [contract, method]] of Object.entries(expectedMethods)) {
    const check = binding.checks[name];
    if (!check || check.contract !== contract || check.method !== method ||
        check.matches !== true || check.actual !== check.expected) {
      throw new Error("Binding evidence invalid: " + name);
    }
    if (!contracts[contract]?.address) throw new Error("Missing contract address: " + contract);
  }
  // Rebind critical cross-contract references to the same deployment evidence.
  const addr = Object.fromEntries(Object.entries(contracts).map(([k, v]) =>
    [k, normalizeV3TestnetAddress(v.address)]));
  const cross = {
    marketplaceEscrow: addr.escrow,
    marketplaceCoordinator: addr.coordinator,
    escrowMarketplace: addr.marketplace,
    coordinatorMarketplace: addr.marketplace,
  };
  for (const [name, expected] of Object.entries(cross)) {
    if (binding.checks[name].actual !== expected) throw new Error("Cross-deployment mismatch: " + name);
  }
  // Self-reported matches are insufficient: pin privileged addresses too.
  const privileged = {
    marketplaceOwner: normalizeV3TestnetAddress(V3_TESTNET_OWNER),
    escrowOwner: normalizeV3TestnetAddress(V3_TESTNET_OWNER),
    coordinatorOwner: normalizeV3TestnetAddress(V3_TESTNET_OWNER),
    marketplaceTreasury: normalizeV3TestnetAddress(V3_TESTNET_TREASURY),
  };
  for (const [name, expected] of Object.entries(privileged)) {
    if (binding.checks[name].actual !== expected) throw new Error("Privileged binding mismatch: " + name);
  }
  if (new Set(Object.values(addr)).size !== 3) throw new Error("Duplicate deployed contract addresses");
  if (deployment.postflight.allActive !== true || deployment.postflight.allCodePresent !== true ||
      binding.bindingsVerified !== true) throw new Error("Unverified account or binding evidence");
  if (binding.noTransactionSent !== true || deployment.postflight.noTransactionSent !== true ||
      binding.mainnetApproved !== false || deployment.mainnetApproved !== false) {
    throw new Error("Unsafe or contradictory evidence flags");
  }
  const activeAndBound = deployment.postflight.allActive === true &&
    deployment.postflight.allCodePresent === true && binding.bindingsVerified === true;
  // A matching caller-supplied expected hash is not an independently reproducible build.
  // Keep trusted-code status false until an independent compiler artifact is attested.
  const observedCodeHashesMatchExpected = deployment.postflight.codeHashesVerified === true;
  const trustedCodeHashes = false;
  return {
    schemaVersion: 1,
    network: "testnet",
    contracts: addr,
    activeAndBound,
    trustedCodeHashes,
    observedCodeHashesMatchExpected,
    // On-chain activation and binding proofs do not establish safe fund settlement.
    evidenceComplete: false,
    realFundsApproved: false,
    mainnetApproved: false,
    missingProof: [
      ...(!trustedCodeHashes ? ["TRUSTED_ONCHAIN_CODE_HASH_MATCH"] : []),
      "REAL_TESTNET_PURCHASE_DELIVERY_SETTLEMENT",
      "RESERVE_REFUND_FINALITY_AND_IDEMPOTENCY",
      "INDEPENDENT_SECURITY_REVIEW",
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [deploymentPath, bindingsPath, outputPath] = process.argv.slice(2);
    if (!deploymentPath || !bindingsPath || !outputPath) throw new Error("Usage: merge-v3-evidence.mjs DEPLOYMENT_JSON BINDINGS_JSON OUTPUT_JSON");
    const deployment = JSON.parse(await readFile(deploymentPath, "utf8"));
    const bindings = JSON.parse(await readFile(bindingsPath, "utf8"));
    const report = mergeV3Evidence(deployment, bindings);
    await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify(report, null, 2));
    if (!report.activeAndBound) process.exitCode = 1;
  } catch (error) {
    console.error("V3 evidence merge blocked: " + error.message);
    process.exitCode = 1;
  }
}
