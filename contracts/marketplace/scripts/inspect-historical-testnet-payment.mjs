// Strictly read-only historical payment inspection; no wallet, signer or transfer.
import { normalizeV3TestnetAddress } from "./verify-v3-testnet.mjs";
import { pathToFileURL } from "node:url";
export const HISTORICAL_PAYMENT = Object.freeze({
  marketplace: "kQDC5qBHrvcwaJamwEzZTbuI4YjKX3fEegQHV2IXgu9Fro8Y",
  hash: "e7a04f5f059ae336811a4b135231a5ad5785743c08e01098b34788c18d527e9f",
  amountNano: "210000000",
});
function hashHex(value) {
  if (typeof value !== "string") return null;
  if (/^[a-f0-9]{64}$/i.test(value)) return value.toLowerCase();
  try {
    const bytes = Buffer.from(value, "base64");
    if (bytes.length === 32) return bytes.toString("hex");
  } catch {}
  return null;
}
export function classifyHistoricalPayment(txs, payment = HISTORICAL_PAYMENT) {
  if (!Array.isArray(txs)) throw new TypeError("Expected transactions array");
  const matches = txs.filter(t => hashHex(t.transaction_id?.hash) === payment.hash);
  if (matches.length !== 1) return { state: "UNRESOLVED", reason: matches.length ? "DUPLICATE_TRANSACTION" : "TRANSACTION_NOT_IN_PAGE", refundConfirmed: false, retryAuthorized: false };
  const tx = matches[0];
  const inbound = tx.in_msg;
  const inboundValue = String(inbound?.value ?? "");
  const outbound = Array.isArray(tx.out_msgs) ? tx.out_msgs : null;
  const inboundMatches = inboundValue === payment.amountNano;
  // TON transaction fees, storage charges and balance changes require independent
  // ledger reconciliation. A missing outbound message does NOT prove custody.
  return {
    state: "UNRESOLVED", reason: inboundMatches ? "INBOUND_FOUND_OUTBOUND_FINALITY_UNVERIFIED" : "INBOUND_AMOUNT_MISMATCH",
    transactionHash: payment.hash, inboundNano: inboundValue,
    inboundMatches, outboundCount: outbound?.length ?? null,
    aborted: tx.description?.compute_ph?.success === false || tx.compute_phase?.exit_code === 212,
    refundConfirmed: false, retryAuthorized: false, mainnetApproved: false,
    requiresIndependentBalanceAndRecipientTrace: true,
  };
}
export async function inspectHistoricalTestnetPayment(fetcher = fetch) {
  const address = normalizeV3TestnetAddress(HISTORICAL_PAYMENT.marketplace);
  const url = new URL("https://testnet.toncenter.com/api/v2/getTransactions");
  url.searchParams.set("address", address);
  url.searchParams.set("limit", "100");
  url.searchParams.set("archival", "true");
  const response = await fetcher(url.toString(), {
    method: "GET", redirect: "error",
    headers: process.env.TONCENTER_API_KEY ? { "X-API-Key": process.env.TONCENTER_API_KEY } : {},
  });
  if (!response.ok) throw new Error("Historical transaction RPC HTTP " + response.status);
  const body = await response.json();
  if (body.ok !== true || !Array.isArray(body.result)) throw new Error("Invalid historical transaction RPC response");
  return { network: "testnet", marketplace: address, ...classifyHistoricalPayment(body.result),
    inspectedTransactions: body.result.length, readOnly: true };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await inspectHistoricalTestnetPayment();
    console.log(JSON.stringify(result, null, 2));
    if (!result.inboundMatches) process.exitCode = 1;
  } catch (error) {
    console.error("HISTORICAL_PAYMENT_UNRESOLVED:", error.message);
    process.exitCode = 1;
  }
}
