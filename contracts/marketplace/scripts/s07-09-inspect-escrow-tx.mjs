#!/usr/bin/env node
// Read-only inspection of the existing Escrow account's recent testnet transactions.
const escrow = process.env.V3_PRODUCTION_TESTNET_ESCROW_ADDRESS;
const query = process.env.S07_09_FAILED_QUERY_ID || "43855669637";
if (!escrow || !/^[0-9]+$/.test(query)) throw Error("Missing expected Escrow/query");
const endpoint = "https://testnet.tonapi.io/v2/blockchain/accounts/" + encodeURIComponent(escrow) + "/transactions?limit=100";
const res = await fetch(endpoint, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(25000) });
if (!res.ok) throw Error("TonAPI HTTP " + res.status);
const json = await res.json();
const transactions = json.transactions || [];
console.log("S07_09_ESCROW_TX_COUNT:", transactions.length);
for (const tx of transactions) {
  const input = tx.in_msg || {};
  const compute = tx.compute_phase || {};
  const action = tx.action_phase || {};
  const brief = {
    hash: tx.hash, lt: tx.lt, utime: tx.utime,
    sender: input.source, value: input.value,
    opcode: input.op_code ?? input.opcode ?? null,
    compute_success: compute.success ?? null,
    compute_exit_code: compute.exit_code ?? null,
    action_success: action.success ?? null,
    action_result_code: action.result_code ?? null,
    aborted: tx.aborted ?? null,
    bounced: input.bounced ?? null,
    description: tx.description?.type ?? null
  };
  console.log("S07_09_ESCROW_TX:", JSON.stringify(brief));
}
if (transactions.length === 0) throw Error("No Escrow transactions returned; cannot establish rejection reason");
console.log("S07_09_READ_ONLY_ESCROW_HISTORY_CAPTURED: true");
