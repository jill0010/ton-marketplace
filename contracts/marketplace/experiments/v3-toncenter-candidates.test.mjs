import test from "node:test";
import assert from "node:assert/strict";
import { extractReserveTransactionCandidates } from "./v3-toncenter-candidates.mjs";

const vault = "0:" + "a".repeat(64);
const buyer = "0:" + "b".repeat(64);
const other = "0:" + "c".repeat(64);
const record = {
  trusted: false,
  source: "toncenter-v2-unverified",
  address: vault,
  transactions: [{
    transaction_id: { lt: "123", hash: "hash1" },
    out_msgs: [
      { source: vault, destination: buyer, value: "194000000" },
      { source: vault, destination: other, value: "194000000" },
      { source: other, destination: buyer, value: "194000000" },
      { source: vault, destination: buyer, value: "0" },
      { source: vault, destination: buyer, value: "not-a-number" },
    ],
  }],
};

test("extracts only matching positive-value outgoing candidates without asserting proof", () => {
  const rows = extractReserveTransactionCandidates(record, { vault, buyer });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].transactionLt, "123");
  assert.equal(rows[0].outgoingCandidates.length, 1);
  assert.equal(rows[0].outgoingCandidates[0].valueNano, "194000000");
  assert.equal(rows[0].outgoingCandidates[0].messageHash, null);
  assert.equal(rows[0].outgoingCandidates[0].queryId, null);
  assert.equal(rows[0].verified, false);
  assert.equal(rows[0].finalized, false);
});
test("rejects unrecognized sources and cross-vault records", () => {
  assert.throws(() => extractReserveTransactionCandidates({ ...record, trusted: true }, { vault, buyer }), TypeError);
  assert.throws(() => extractReserveTransactionCandidates({ ...record, address: other }, { vault, buyer }), TypeError);
  assert.throws(() => extractReserveTransactionCandidates({ ...record, transactions: null }, { vault, buyer }), TypeError);
  assert.throws(() => extractReserveTransactionCandidates(record, { vault: "bad", buyer }), TypeError);
});
test("missing transaction identity cannot be interpreted as proof", () => {
  const rows = extractReserveTransactionCandidates({
    ...record,
    transactions: [{ out_msgs: [{ source: vault, destination: buyer, value: "1" }] }],
  }, { vault, buyer });
  assert.equal(rows[0].transactionHash, null);
  assert.equal(rows[0].transactionLt, null);
  assert.equal(rows[0].verified, false);
});
