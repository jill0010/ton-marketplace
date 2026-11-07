import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { normalizeV3CodeHash } from "./verify-v3-testnet.mjs";
import { verifyV3ProductionTestnet } from "./verify-v3-production-testnet.mjs";
import { verifyV3ProductionBindings } from "./verify-v3-production-testnet-bindings.mjs";

const NAMES = ["marketplace", "escrow", "coordinator", "verifier"];

export function extractV3ProductionDeploymentEvidence(log) {
  const addresses = {};
  const hashes = {};
  for (const name of NAMES) {
    const addressLabel = "V3 testnet candidate " + name + ":";
    const addressLines = log.split(/\r?\n/).filter((line) => line.includes(addressLabel));
    if (addressLines.length !== 1) throw new Error("Expected exactly one deployment address for " + name);
    const address = addressLines[0].slice(addressLines[0].indexOf(addressLabel) + addressLabel.length).trim();
    if (!address || /\s/.test(address)) throw new Error("Invalid deployment address for " + name);
    addresses[name] = address;

    const hashLabel = "V3 trusted compiled " + name + " code hash:";
    const hashLines = log.split(/\r?\n/).filter((line) => line.includes(hashLabel));
    if (hashLines.length !== 1) throw new Error("Expected exactly one trusted code hash for " + name);
    hashes[name] = normalizeV3CodeHash(hashLines[0].slice(hashLines[0].indexOf(hashLabel) + hashLabel.length).trim());
  }
  const vaultLabel = "V3 trusted compiled vault code hash:";
  const vaultLines = log.split(/\r?\n/).filter((line) => line.includes(vaultLabel));
  if (vaultLines.length !== 1) throw new Error("Expected exactly one trusted vault code hash");
  hashes.vault = normalizeV3CodeHash(vaultLines[0].slice(vaultLines[0].indexOf(vaultLabel) + vaultLabel.length).trim());
  return { addresses, hashes };
}

export async function postflightV3ProductionDeployment(log, fetcher = fetch) {
  const evidence = extractV3ProductionDeploymentEvidence(log);
  const code = await verifyV3ProductionTestnet(evidence.addresses, fetcher, evidence.hashes);
  let bindings;
  try {
    bindings = await verifyV3ProductionBindings(evidence.addresses, evidence.hashes.vault, fetcher);
  } catch (error) {
    bindings = { bindingsVerified: false, error: error.message, noTransactionSent: true, mainnetApproved: false };
  }
  return {
    schemaVersion: 1,
    ...evidence,
    code,
    bindings,
    candidateAccountsActive: code.allActive && code.allCodePresent,
    codeHashesVerified: code.codeHashesVerified,
    bindingsVerified: bindings.bindingsVerified,
    fundedPurchaseVerified: false,
    settlementVerified: false,
    mainnetApproved: false,
    noTransactionSentByPostflight: true,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const logPath = process.argv[2];
    const outputPath = process.argv[3];
    if (!logPath || !outputPath) throw new Error("Usage: postflight-v3-production-testnet.mjs LOG OUTPUT");
    const log = await readFile(logPath, "utf8");
    const report = await postflightV3ProductionDeployment(log);
    await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({
      addresses: report.addresses,
      candidateAccountsActive: report.candidateAccountsActive,
      codeHashesVerified: report.codeHashesVerified,
      bindingsVerified: report.bindingsVerified,
      mainnetApproved: false,
    }, null, 2));
    if (!report.candidateAccountsActive || !report.codeHashesVerified || !report.bindingsVerified) process.exitCode = 1;
  } catch (error) {
    console.error("Production V3 Testnet postflight failed: " + error.message);
    process.exitCode = 1;
  }
}
