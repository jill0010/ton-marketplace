// Independently re-query live testnet account state and all eight bindings in one run.
// No signer, no wallet key, no transaction broadcasting.
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { collectV3TestnetEvidence } from "./collect-v3-testnet-evidence.mjs";
import { verifyV3Bindings } from "./verify-v3-testnet-bindings.mjs";
import { mergeV3Evidence } from "./merge-v3-evidence.mjs";

export async function auditV3Testnet(addresses, fetcher = fetch, expectedHashes = null) {
  const deployment = await collectV3TestnetEvidence(addresses, fetcher, expectedHashes);
  const bindings = await verifyV3Bindings(addresses, fetcher);
  return {
    schemaVersion: 1,
    collectedAt: new Date().toISOString(),
    deployment,
    bindings,
    assessment: mergeV3Evidence(deployment, bindings),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = await auditV3Testnet({
      marketplace: process.env.V3_TESTNET_MARKETPLACE_ADDRESS,
      escrow: process.env.V3_TESTNET_ESCROW_ADDRESS,
      coordinator: process.env.V3_TESTNET_COORDINATOR_ADDRESS,
    }, fetch, {
      marketplace: process.env.V3_EXPECTED_MARKETPLACE_CODE_HASH,
      escrow: process.env.V3_EXPECTED_ESCROW_CODE_HASH,
      coordinator: process.env.V3_EXPECTED_COORDINATOR_CODE_HASH,
    });
    if (process.env.V3_COMBINED_EVIDENCE_OUTPUT) {
      await writeFile(process.env.V3_COMBINED_EVIDENCE_OUTPUT, JSON.stringify(report, null, 2) + "\n",
        { flag: "wx", mode: 0o600 });
    }
    console.log(JSON.stringify(report.assessment, null, 2));
    if (!report.assessment.activeAndBound) process.exitCode = 1;
  } catch (error) {
    console.error("V3 combined on-chain audit blocked: " + error.message);
    process.exitCode = 1;
  }
}
