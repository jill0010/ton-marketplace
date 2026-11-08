// Secret-free testnet evidence pipeline: discover exact transfer, then verify both accounts.
// Ambiguous matches, incomplete history and missing recipient credit always fail closed.
import { pathToFileURL } from "node:url";
import { discoverTestnetTransfers } from "./discover-v3-testnet-transfers.mjs";
import { verifyTransferFinality } from "./verify-v3-transfer-finality.mjs";

export async function auditHistoricalTransfer(expected, fetcher = fetch) {
  const discovery = await discoverTestnetTransfers(expected, fetcher);
  const candidates = discovery.candidates.filter(c =>
    c.sourceAborted === false && c.sourceActionSuccess === true);
  if (!discovery.historyComplete) return {
    readOnly: true, verified: false, reason: "DISCOVERY_HISTORY_INCOMPLETE",
    candidateCount: candidates.length, discovery,
  };
  if (candidates.length !== 1) return {
    readOnly: true, verified: false,
    reason: candidates.length ? "AMBIGUOUS_TRANSFER_CANDIDATES" : "NO_SUCCESSFUL_TRANSFER_CANDIDATE",
    candidateCount: candidates.length, discovery,
  };
  const candidate = candidates[0];
  const evidence = await verifyTransferFinality({
    source: candidate.source, recipient: candidate.recipient,
    amountNano: candidate.amountNano, messageHash: candidate.messageHash,
  }, fetcher);
  return {
    readOnly: true, verified: evidence.assessment.verified === true,
    reason: evidence.assessment.verified ? "TWO_SIDED_EVIDENCE_MATCHED" : evidence.assessment.reason,
    candidateCount: 1, candidate, evidence,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await auditHistoricalTransfer({
      source: process.env.V3_SOURCE_ADDRESS,
      recipient: process.env.V3_RECIPIENT_ADDRESS,
      amountNano: process.env.V3_AMOUNT_NANO,
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.verified) process.exitCode = 1;
  } catch (error) {
    console.error("HISTORICAL_TRANSFER_UNVERIFIED:", error.message);
    process.exitCode = 1;
  }
}
