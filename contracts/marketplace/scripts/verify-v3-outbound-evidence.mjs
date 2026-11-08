// Read-only testnet outbound evidence; pair with recipient inbound proof.
// Outbound alone is never finality.
import { pathToFileURL } from "node:url";
import { normalizeV3TestnetAddress } from "./verify-v3-testnet.mjs";
const hash = (v) => {
  if (typeof v !== "string") return null;
  if (/^[a-f0-9]{64}$/i.test(v)) return v.toLowerCase();
  try { const b = Buffer.from(v, "base64"); return b.length === 32 ? b.toString("hex") : null; }
  catch { return null; }
};
export function assessOutboundEvidence(transactions, expected) {
  if (!Array.isArray(transactions)) throw new TypeError("transactions must be an array");
  const source = normalizeV3TestnetAddress(expected.source);
  const recipient = normalizeV3TestnetAddress(expected.recipient);
  const messageHash = hash(expected.messageHash);
  if (!messageHash || !/^[1-9][0-9]*$/.test(String(expected.amountNano))) throw new Error("Invalid expected outbound evidence");
  const candidates = transactions.flatMap(tx =>
    tx?.account && normalizeV3TestnetAddress(tx.account) === source && Array.isArray(tx.out_msgs)
      ? tx.out_msgs.filter(msg => hash(msg?.hash) === messageHash).map(msg => ({ tx, msg }))
      : []);
  if (candidates.length !== 1) return { verified: false, reason: candidates.length ? "DUPLICATE_OUTBOUND" : "OUTBOUND_NOT_FOUND" };
  const { tx, msg } = candidates[0];
  if (!msg.destination || normalizeV3TestnetAddress(msg.destination) !== recipient)
    return { verified: false, reason: "DESTINATION_MISMATCH" };
  if (String(msg.value) !== String(expected.amountNano))
    return { verified: false, reason: "AMOUNT_MISMATCH" };
  if (!hash(tx.hash) || !/^(0|[1-9][0-9]*)$/.test(String(tx.lt ?? "")))
    return { verified: false, reason: "SOURCE_TRANSACTION_IDENTITY_MISSING" };
  if (tx.aborted !== false || tx.action_phase?.success !== true)
    return { verified: false, reason: "SOURCE_ACTION_NOT_CONFIRMED" };
  return { verified: true, network: "testnet", source, recipient, amountNano: String(expected.amountNano),
    outboundMessageHash: messageHash, sourceTransactionHash: hash(tx.hash), sourceTransactionLt: String(tx.lt),
    recipientCreditVerified: false };
}
export async function checkOutboundEvidence(expected, fetcher = fetch) {
  const source = normalizeV3TestnetAddress(expected.source);
  const url = new URL("https://testnet.toncenter.com/api/v3/transactions");
  url.searchParams.set("account", source);
  url.searchParams.set("limit", "100");
  const response = await fetcher(url.toString(), { method: "GET", redirect: "error" });
  if (!response.ok) throw new Error("Testnet index HTTP " + response.status);
  const body = await response.json();
  if (!Array.isArray(body.transactions)) throw new Error("Malformed testnet index");
  return { readOnly: true, pageComplete: body.transactions.length < 100,
    ...assessOutboundEvidence(body.transactions, expected) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const expected = { source: process.env.V3_SOURCE_ADDRESS, recipient: process.env.V3_RECIPIENT_ADDRESS,
      messageHash: process.env.V3_OUTBOUND_MESSAGE_HASH, amountNano: process.env.V3_AMOUNT_NANO };
    const result = await checkOutboundEvidence(expected);
    console.log(JSON.stringify(result, null, 2));
    if (!result.verified) process.exitCode = 1;
  } catch (error) { console.error("OUTBOUND_EVIDENCE_UNVERIFIED:", error.message); process.exitCode = 1; }
}
