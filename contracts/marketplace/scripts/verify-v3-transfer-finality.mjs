// Testnet-only independent transfer evidence: both source outbound and recipient inbound.
// This module performs GET requests only; missing evidence always fails closed.
import { pathToFileURL } from "node:url";
import { checkOutboundEvidence } from "./verify-v3-outbound-evidence.mjs";
import { checkRecipientCredit } from "./verify-v3-recipient-credit.mjs";

export function reconcileTransferEvidence(outbound, inbound) {
  if (outbound?.pageComplete === false || inbound?.pageComplete === false) return {\n    verified: false, reason: "TRANSFER_HISTORY_WINDOW_INCOMPLETE",\n    outboundVerified: outbound?.verified === true, inboundVerified: inbound?.verified === true,\n  };\n  if (!outbound?.verified || !inbound?.verified) return {
    verified: false, reason: "INCOMPLETE_TRANSFER_EVIDENCE",
    outboundVerified: outbound?.verified === true, inboundVerified: inbound?.verified === true,
  };
  if (outbound.network !== "testnet" || inbound.network !== "testnet" ||
      outbound.source !== inbound.source || outbound.recipient !== inbound.recipient ||
      outbound.amountNano !== inbound.amountNano ||
      outbound.outboundMessageHash !== inbound.inboundMessageHash)
    return { verified: false, reason: "TRANSFER_EVIDENCE_MISMATCH" };
  return {
    verified: true, network: "testnet", source: outbound.source, recipient: outbound.recipient,
    amountNano: outbound.amountNano, messageHash: outbound.outboundMessageHash,
    sourceTransactionHash: outbound.sourceTransactionHash, sourceTransactionLt: outbound.sourceTransactionLt,
    recipientTransactionHash: inbound.recipientTransactionHash, recipientTransactionLt: inbound.recipientTransactionLt,
  };
}

export async function verifyTransferFinality(expected, fetcher = fetch) {
  const [outbound, inbound] = await Promise.all([
    checkOutboundEvidence(expected, fetcher),
    checkRecipientCredit(expected, fetcher),
  ]);
  return { readOnly: true, outbound, inbound, assessment: reconcileTransferEvidence(outbound, inbound) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const expected = {
      source: process.env.V3_SOURCE_ADDRESS, recipient: process.env.V3_RECIPIENT_ADDRESS,
      messageHash: process.env.V3_OUTBOUND_MESSAGE_HASH, amountNano: process.env.V3_AMOUNT_NANO,
    };
    const result = await verifyTransferFinality(expected);
    console.log(JSON.stringify(result, null, 2));
    if (!result.assessment.verified) process.exitCode = 1;
  } catch (error) {
    console.error("TRANSFER_FINALITY_UNVERIFIED:", error.message);
    process.exitCode = 1;
  }
}
