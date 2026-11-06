// Read-only V3 testnet deployment evidence collector.
// Requires three explicit addresses; never signs, sends, or approves deployment.
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { verifyV3Testnet } from "./verify-v3-testnet.mjs";

export async function collectV3TestnetEvidence(addresses, fetcher = fetch, expectedHashes = null) {
  const postflight = await verifyV3Testnet(addresses, fetcher, expectedHashes);
  return {
    schemaVersion: 1,
    collectedAt: new Date().toISOString(),
    network: "testnet",
    source: "TON Center v2 getAddressInformation",
    postflight,
    evidenceComplete: false,
    // An active account is not proof of the correct code hash or safe settlement.
    deploymentVerified: false,
    realFundsApproved: false,
    mainnetApproved: false,
    missingProof: [
      ...(!postflight.codeHashesVerified ? ["ONCHAIN_CODE_HASH_MATCH"] : []),
      "MARKETPLACE_ESCROW_COORDINATOR_BINDINGS",
      "REAL_TESTNET_SETTLEMENT_TRACE",
      "RESERVE_REFUND_FINALITY_AND_IDEMPOTENCY",
      "INDEPENDENT_SECURITY_REVIEW",
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const evidence = await collectV3TestnetEvidence({
      marketplace: process.env.V3_TESTNET_MARKETPLACE_ADDRESS,
      escrow: process.env.V3_TESTNET_ESCROW_ADDRESS,
      coordinator: process.env.V3_TESTNET_COORDINATOR_ADDRESS,
    }, fetch, {
      marketplace: process.env.V3_EXPECTED_MARKETPLACE_CODE_HASH,
      escrow: process.env.V3_EXPECTED_ESCROW_CODE_HASH,
      coordinator: process.env.V3_EXPECTED_COORDINATOR_CODE_HASH,
    });
    const serialized = JSON.stringify(evidence, null, 2) + "\n";
    if (process.env.V3_EVIDENCE_OUTPUT) {
      await writeFile(process.env.V3_EVIDENCE_OUTPUT, serialized, { flag: "wx", mode: 0o600 });
    }
    process.stdout.write(serialized);
    if (!evidence.postflight.allActive || !evidence.postflight.allCodePresent || !evidence.postflight.codeHashesVerified) process.exitCode = 1;
  } catch (error) {
    console.error(`V3 evidence collection blocked: ${error.message}`);
    process.exitCode = 1;
  }
}
