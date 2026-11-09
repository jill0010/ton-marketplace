// S04-P001: read-only evidence collector for ONE fresh Testnet failed reserve refund.
// No mnemonic, signatures, transaction submission, or reuse of settled orders.
import { writeFile } from "node:fs/promises";
import { Address, Cell } from "@ton/core";

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
function rawBody(message) {
  const body = message?.msg_data?.body ?? message?.message_content?.body;
  if (typeof body !== "string" || !body) return null;
  try {
    const cells = Cell.fromBoc(Buffer.from(body, "base64"));
    if (cells.length !== 1) return null;
    return cells[0];
  } catch { return null; }
}
function bouncedBody(message) {
  const body = rawBody(message);
  if (!body) return null;
  const slice = body.beginParse();
  if (slice.remainingBits < 64) return null;
  if (slice.loadUint(32) !== 0xffffffff) return null;
  return { originalOpcode: slice.loadUint(32), hash: body.hash().toString("hex") };
}
function txStatus(tx) {
  const d = tx.description ?? {};
  const compute = d.compute_ph ?? tx.compute_ph ?? tx.compute_phase ?? {};
  const action = d.action ?? tx.action ?? tx.action_phase ?? {};
  return {
    aborted: tx.aborted ?? d.aborted ?? null,
    computeType: compute.type ?? null,
    computeSuccess: compute.success ?? null,
    computeExitCode: compute.exit_code ?? null,
    actionSuccess: action.success ?? null,
    actionResultCode: action.result_code ?? null,
    outgoing: messageArray(tx.out_msgs).map((msg) => ({
      destination: normalizeAddress(msg.destination ?? msg.dest),
      valueNano: String(msg.value ?? ""),
      bounced: msg.bounced ?? null,
      bounce: msg.bounce ?? null,
      messageHash: msg.hash ?? null,
    })),
  };
}
function txFailed(tx) {
  const status = txStatus(tx);
  return status.aborted === true || status.computeSuccess === false ||
    (status.computeExitCode !== null && status.computeExitCode !== 0) ||
    status.actionSuccess === false || inbound(tx).bounced === true;
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
    const decodedBounce = bouncedBody(msg);
    if (normalizeAddress(msg.source ?? msg.src) === buyer && decodedBounce?.originalOpcode === 0x72730506) {
      failedReceipts.push({
        transaction: txId(tx), source: msg.source ?? msg.src ?? null,
        returnedNano: String(msg.value ?? ""), messageHash: msg.hash ?? null,
        bounced: msg.bounced ?? null, decodedBounce,
        matchingBuyerOutbound: buyerTransactions.some((buyerTx) =>
          messageArray(buyerTx.out_msgs).some((out) =>
            normalizeAddress(out.destination ?? out.dest) === vault &&
            out.hash === msg.hash &&
            String(out.value) === String(msg.value)
          )
        ),
      });
    }
  }
  const buyerInbound = buyerTransactions.filter((tx) =>
    normalizeAddress(inbound(tx).source ?? inbound(tx).src) === vault).map((tx) => ({
      transaction: txId(tx), valueNano: String(inbound(tx).value ?? ""),
      failed: txFailed(tx), bounced: inbound(tx).bounced === true,
      returnedMessageCandidates: messageArray(tx.out_msgs).filter((out) => normalizeAddress(out.destination ?? out.dest) === vault).map((out) => ({
        valueNano: String(out.value ?? ""), messageHash: out.hash ?? null,
        bounced: out.bounced ?? null, decodedBounce: bouncedBody(out),
      })),
      status: txStatus(tx),
    }));
  return {
    orderId: expectedOrderId, vault, buyer, outbound, failedReceipts, buyerInbound,
    vaultInbound: vaultTransactions.map((tx) => ({
      transaction: txId(tx), source: normalizeAddress(inbound(tx).source ?? inbound(tx).src),
      valueNano: String(inbound(tx).value ?? ""), bounced: inbound(tx).bounced ?? null,
      bodyType: inbound(tx).msg_data?.["@type"] ?? null,
      status: txStatus(tx),
    })),
    scannedVaultTransactions: vaultTransactions.length,
    scannedBuyerTransactions: buyerTransactions.length,
    evidenceComplete: false,
    reason: "The transaction list is diagnostic only. A matching recipient inbound transaction is NOT proof of delivery. Bounce must be proved with decoded message linkage and confirmed returned value before any 3/3 attestation, top-up or retry.",
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
  console.log("Dispatches=" + evidence.outbound.length + " buyerInbound=" + evidence.buyerInbound.length + " bounceCandidates=" + evidence.failedReceipts.length);
  for (const tx of evidence.buyerInbound) console.log("Buyer tx " + tx.transaction.lt + " failed=" + tx.failed + " aborted=" + tx.status.aborted + " computeExit=" + tx.status.computeExitCode + " outgoing=" + tx.status.outgoing.length);
  if (evidence.outbound.length !== 1 || evidence.failedReceipts.length !== 1 || !evidence.failedReceipts[0].matchingBuyerOutbound)
    throw new Error("Refund bounce message/body or exact outgoing->incoming link NOT verified; no top-up or retry authorized");
  console.log("S04-P001 decoded refund bounce verified; returnedNano=" + evidence.failedReceipts[0].returnedNano);
  console.log("S04-P001 evidence remains read-only; 3/3 signatures and finality not yet complete");
  console.log("Candidates collected; S04-P001 remains OPEN pending exact decoded linkage and safe retry");
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href)
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
