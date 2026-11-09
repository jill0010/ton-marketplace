// S04-P001: read-only evidence collector for ONE fresh Testnet failed reserve refund.
// No mnemonic, signatures, transaction submission, or reuse of settled orders.
import { writeFile } from "node:fs/promises";
import { Address } from "@ton/core";

const API = "https://testnet.toncenter.com/api/v2";
const required = (key) => {
  const value = process.env[key]?.trim();
  if (!value) throw new Error("Missing " + key);
  return value;
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function rpc(method, args) {
  const url = new URL(API + "/" + method);
  for (const [key, value] of Object.entries(args)) url.searchParams.set(key, String(value));
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(url, {
      headers: process.env.TONCENTER_TESTNET_API_KEY
        ? { "X-API-Key": process.env.TONCENTER_TESTNET_API_KEY } : {},
      redirect: "error",
    });
    if (response.ok) {
      const payload = await response.json();
      if (payload.ok !== true) throw new Error(method + " returned ok=false");
      return payload.result;
    }
    if (![429, 500, 502, 503, 504, 542].includes(response.status) || attempt === 4)
      throw new Error(method + " HTTP " + response.status);
    await delay(1000 * (attempt + 1));
  }
}
function normalizeAddress(value) {
  if (!value) return null;
  try { return Address.parse(value).toRawString().toLowerCase(); } catch { return null; }
}
function rawAddress(value) {
  if (!/^-?[0-9]+:[0-9a-fA-F]{64}$/.test(value)) throw new Error("Expected raw TON address");
  return value.toLowerCase();
}
function messageArray(messages) {
  return Array.isArray(messages) ? messages : Object.values(messages ?? {});
}
function txId(tx) {
  return { lt: String(tx.transaction_id?.lt ?? ""), hash: tx.transaction_id?.hash ?? "" };
}
function inbound(tx) {
  return tx.in_msg ?? {};
}
function txFailed(tx) {
  const d = tx.description ?? {};
  return tx.aborted === true || d.aborted === true || d.compute_ph?.success === false ||
    d.action?.success === false || inbound(tx).bounced === true;
}
export function inspectFailedRefund({ vault, buyer, vaultTransactions, buyerTransactions, expectedOrderId }) {
  const failedReceipts = [];
  const outbound = [];
  for (const tx of vaultTransactions) {
    for (const msg of messageArray(tx.out_msgs)) {
      if (normalizeAddress(msg.destination ?? msg.dest) !== buyer) continue;
      outbound.push({
        transaction: txId(tx), valueNano: String(msg.value ?? ""),
        messageHash: msg.hash ?? null, createdLt: String(msg.created_lt ?? ""),
      });
    }
    const msg = inbound(tx);
    if (msg.bounced === true && normalizeAddress(msg.source ?? msg.src) === buyer) failedReceipts.push({
      transaction: txId(tx), source: msg.source ?? msg.src ?? null,
      returnedNano: String(msg.value ?? ""), messageHash: msg.hash ?? null,
    });
  }
  const buyerInbound = buyerTransactions.filter((tx) =>
    normalizeAddress(inbound(tx).source ?? inbound(tx).src) === vault).map((tx) => ({
      transaction: txId(tx), valueNano: String(inbound(tx).value ?? ""),
      failed: txFailed(tx), bounced: inbound(tx).bounced === true,
    }));
  return {
    orderId: expectedOrderId, vault, buyer, outbound, failedReceipts, buyerInbound,
    scannedVaultTransactions: vaultTransactions.length,
    scannedBuyerTransactions: buyerTransactions.length,
    evidenceComplete: false,
    reason: "Transaction lists alone cannot prove Vault operation/query linkage, actual returned principal, top-up, or safe retry. Require matching decoded message bodies, get-method states, and signed 3/3 bounce attestation.",
  };
}
async function main() {
  if (process.env.S04_P001_READ_ONLY !== "true") throw new Error("Set S04_P001_READ_ONLY=true");
  const vault = rawAddress(required("S04_P001_NEW_VAULT_RAW"));
  const buyer = rawAddress(required("S04_P001_BUYER_RAW"));
  if (vault === buyer) throw new Error("Vault and buyer must differ");
  const orderId = required("S04_P001_NEW_ORDER_ID");
  if (!/^[1-9][0-9]*$/.test(orderId) || ["1", "2", "4"].includes(orderId))
    throw new Error("Use a fresh order, never settled orders 1, 2 or 4");
  const [vaultTransactions, buyerTransactions] = await Promise.all([
    rpc("getTransactions", { address: vault, limit: 100 }),
    rpc("getTransactions", { address: buyer, limit: 100 }),
  ]);
  const evidence = inspectFailedRefund({ vault, buyer, vaultTransactions, buyerTransactions, expectedOrderId: orderId });
  const output = process.env.S04_P001_EVIDENCE_PATH ?? "s04-p001-failed-refund-evidence.json";
  await writeFile(output, JSON.stringify({
    network: "testnet", collectedAt: new Date().toISOString(), ...evidence,
  }, null, 2) + "\n", { flag: "wx" });
  console.log("Read-only evidence written: " + output);
  if (evidence.outbound.length === 0 || evidence.failedReceipts.length === 0)
    throw new Error("No outbound and genuine bounce candidates found; on-chain failure NOT verified");
  console.log("Candidates collected; S04-P001 remains OPEN pending exact decoded linkage and safe retry");
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href)
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
