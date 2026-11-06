// Extract exactly three candidate addresses from Acton output, then perform
// a read-only testnet RPC postflight. This is NOT trusted code-hash verification.
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { verifyV3Testnet } from "./verify-v3-testnet.mjs";

export function extractV3CandidateAddresses(log) {
  const labels = {
    marketplace: "V3 testnet candidate marketplace:",
    escrow: "V3 testnet candidate escrow:",
    coordinator: "V3 testnet candidate coordinator:",
  };
  const addresses = {};
  for (const [key, label] of Object.entries(labels)) {
    const matches = log.split(/\r?\n/).filter((line) => line.includes(label));
    if (matches.length !== 1) throw new Error(`Expected exactly one ${key} deployment address`);
    const value = matches[0].slice(matches[0].indexOf(label) + label.length).trim();
    if (!value || /\s/.test(value)) throw new Error(`Invalid ${key} address token`);
    addresses[key] = value;
  }
  return addresses;
}

export async function postflightV3Candidate(log, fetcher = fetch) {
  const addresses = extractV3CandidateAddresses(log);
  const report = await verifyV3Testnet(addresses, fetcher);
  return {
    schemaVersion: 1,
    addresses,
    report,
    candidateAccountsActive: report.allActive && report.allCodePresent,
    codeHashesVerified: false,
    bindingsVerified: false,
    fundedSettlementVerified: false,
    mainnetApproved: false,
    noTransactionSentByVerifier: true,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const logPath = process.argv[2];
    const outputPath = process.argv[3];
    if (!logPath || !outputPath) throw new Error("Usage: postflight-v3-candidate.mjs LOG OUTPUT");
    const result = await postflightV3Candidate(await readFile(logPath, "utf8"));
    await writeFile(outputPath, JSON.stringify(result, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ addresses: result.addresses, candidateAccountsActive: result.candidateAccountsActive, mainnetApproved: false }));
    if (!result.candidateAccountsActive) process.exitCode = 1;
  } catch (error) {
    console.error(`V3 candidate postflight failed: ${error.message}`);
    process.exitCode = 1;
  }
}
