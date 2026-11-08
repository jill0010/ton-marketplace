// Read-only testnet transfer discovery: output candidates, never assert finality.
// Explicit source, recipient and amount; no wallet secrets or transaction broadcasts.
import { pathToFileURL } from "node:url";
import { normalizeV3TestnetAddress } from "./verify-v3-testnet.mjs";
import { fetchTestnetTransactionHistory } from "./fetch-v3-testnet-history.mjs";
function hex(v) {
  if (typeof v !== "string") return null;
  if (/^[a-f0-9]{64}$/i.test(v)) return v.toLowerCase();
  try { const b = Buffer.from(v, "base64"); return b.length === 32 ? b.toString("hex") : null; }
  catch { return null; }
}
export function discoverOutboundCandidates(transactions, expected) {
  if (!Array.isArray(transactions)) throw new TypeError("transactions must be array");
  const source = normalizeV3TestnetAddress(expected.source);
  const recipient = normalizeV3TestnetAddress(expected.recipient);
  const amount = String(expected.amountNano);
  if (!/^[1-9][0-9]*$/.test(amount) || source === recipient) throw new Error("Invalid transfer criteria");
  const candidates = [];
  for (const tx of transactions) {
    if (!tx?.account || normalizeV3TestnetAddress(tx.account) !== source || !Array.isArray(tx.out_msgs)) continue;
    for (const msg of tx.out_msgs) {
      if (!msg?.destination || normalizeV3TestnetAddress(msg.destination) !== recipient || String(msg.value) !== amount) continue;
      const messageHash = hex(msg.hash), sourceTransactionHash = hex(tx.hash);
      if (!messageHash || !sourceTransactionHash || !/^(0|[1-9][0-9]*)$/.test(String(tx.lt ?? ""))) continue;
      candidates.push({ source, recipient, amountNano: amount, messageHash, sourceTransactionHash,
        sourceTransactionLt: String(tx.lt), sourceAborted: tx.aborted, sourceActionSuccess: tx.action_phase?.success,
        recipientCreditVerified: false });
    }
  }
  return candidates;
}
export async function discoverTestnetTransfers(expected, fetcher = fetch) {
  const source = normalizeV3TestnetAddress(expected.source);
  const history = await fetchTestnetTransactionHistory(source, fetcher);
  return { network: "testnet", readOnly: true, inspectedTransactions: history.transactions.length,
    historyComplete: history.pageComplete, pagesFetched: history.pagesFetched,
    candidates: discoverOutboundCandidates(history.transactions, expected), finalityVerified: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const expected = { source: process.env.V3_SOURCE_ADDRESS, recipient: process.env.V3_RECIPIENT_ADDRESS,
      amountNano: process.env.V3_AMOUNT_NANO };
    const result = await discoverTestnetTransfers(expected);
    console.log(JSON.stringify(result, null, 2));
    if (!result.candidates.length) process.exitCode = 1;
  } catch (error) { console.error("TRANSFER_DISCOVERY_UNVERIFIED:", error.message); process.exitCode = 1; }
}
