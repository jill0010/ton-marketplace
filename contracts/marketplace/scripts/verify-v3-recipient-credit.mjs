// Testnet-only, read-only recipient credit evidence. Never signs or broadcasts.
// A matching inbound message is evidence of receipt, not proof of a complete order settlement.
import { pathToFileURL } from "node:url";
import { normalizeV3TestnetAddress } from "./verify-v3-testnet.mjs";
import { fetchTestnetTransactionHistory } from "./fetch-v3-testnet-history.mjs";
const hex = (v) => {
  if (typeof v !== "string") return null;
  if (/^[0-9a-f]{64}$/i.test(v)) return v.toLowerCase();
  try { const b = Buffer.from(v, "base64"); return b.length === 32 ? b.toString("hex") : null; }
  catch { return null; }
};
const nano = (v) => typeof v === "string" && /^(0|[1-9][0-9]*)$/.test(v) ? BigInt(v) : null;
export function assessRecipientCredit(transactions, expected) {
  if (!Array.isArray(transactions)) throw new TypeError("transactions must be an array");
  const recipient = normalizeV3TestnetAddress(expected.recipient);
  const source = normalizeV3TestnetAddress(expected.source);
  const messageHash = hex(expected.messageHash);
  const amount = nano(expected.amountNano);
  if (!messageHash || amount === null || amount <= 0n || source === recipient) throw new Error("Invalid expected transfer identity");
  const matches = transactions.filter((tx) => {
    const m = tx?.in_msg;
    return tx?.account && normalizeV3TestnetAddress(tx.account) === recipient &&
      m && hex(m.hash) === messageHash;
  });
  if (matches.length !== 1) return { verified: false, reason: matches.length ? "DUPLICATE_INBOUND_MESSAGE" : "INBOUND_MESSAGE_NOT_FOUND" };
  const tx = matches[0], inbound = tx.in_msg;
  if (!inbound.source || normalizeV3TestnetAddress(inbound.source) !== source)
    return { verified: false, reason: "SOURCE_MISMATCH" };
  if (nano(String(inbound.value ?? "")) !== amount)
    return { verified: false, reason: "AMOUNT_MISMATCH" };
  // A plain wallet credit can legitimately skip TVM compute (no contract code).
  // Accept only an explicitly successful compute or an explicitly skipped compute,
  // with no failed action phase and no aborted transaction.
  const compute = tx.compute_phase;
  const computeOk = compute?.success === true ||
    (compute?.skipped === true && compute?.success !== false);
  if (tx.aborted !== false || !computeOk || tx.action_phase?.success === false)
    return { verified: false, reason: "RECIPIENT_EXECUTION_NOT_CONFIRMED" };
  const transactionHash = hex(tx.hash);
  if (!transactionHash || !/^(0|[1-9][0-9]*)$/.test(String(tx.lt ?? "")))
    return { verified: false, reason: "TRANSACTION_IDENTITY_MISSING" };
  return { verified: true, network: "testnet", recipient, source, amountNano: String(amount),
    inboundMessageHash: messageHash, recipientTransactionHash: transactionHash,
    recipientTransactionLt: String(tx.lt) };
}
export async function checkRecipientCredit(expected, fetcher = fetch) {
  const recipient = normalizeV3TestnetAddress(expected.recipient);
  const history = await fetchTestnetTransactionHistory(recipient, fetcher);
  return { readOnly: true, pageComplete: history.pageComplete, pagesFetched: history.pagesFetched,
    ...assessRecipientCredit(history.transactions, expected) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const expected = { recipient: process.env.V3_RECIPIENT_ADDRESS, source: process.env.V3_SOURCE_ADDRESS,
      messageHash: process.env.V3_OUTBOUND_MESSAGE_HASH, amountNano: process.env.V3_AMOUNT_NANO };
    const result = await checkRecipientCredit(expected);
    console.log(JSON.stringify(result, null, 2));
    if (!result.verified) process.exitCode = 1;
  } catch (error) { console.error("RECIPIENT_CREDIT_UNVERIFIED:", error.message); process.exitCode = 1; }
}
