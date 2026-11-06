import test from "node:test";
import assert from "node:assert/strict";
import { fetchReserveVaultTransactions } from "./v3-toncenter-readonly.mjs";

const address = "0:" + "a".repeat(64);
const success = async (url, init) => {
  assert.equal(url.hostname, "testnet.toncenter.com");
  assert.equal(url.pathname, "/api/v2/getTransactions");
  assert.equal(url.searchParams.get("address"), address);
  assert.equal(url.searchParams.get("limit"), "10");
  assert.equal(url.searchParams.get("archival"), "true");
  assert.equal(init.method, "GET");
  assert.equal(init.redirect, "error");
  return { ok: true, json: async () => ({ ok: true, result: [{ transaction_id: { lt: "1", hash: "x" } }] }) };
};

test("read-only transport returns explicitly untrusted transactions", async () => {
  const result = await fetchReserveVaultTransactions({ address, fetchImpl: success });
  assert.equal(result.trusted, false);
  assert.equal(result.source, "toncenter-v2-unverified");
  assert.equal(result.network, "testnet");
  assert.equal(result.transactions.length, 1);
});
test("rejects invalid address, excessive limits and unsafe endpoints", async () => {
  await assert.rejects(fetchReserveVaultTransactions({ address: "not-an-address", fetchImpl: success }), TypeError);
  await assert.rejects(fetchReserveVaultTransactions({ address, limit: 100, fetchImpl: success }), RangeError);
  await assert.rejects(fetchReserveVaultTransactions({ address, apiBase: "http://toncenter.com/api/v2", fetchImpl: success }), TypeError);
  await assert.rejects(fetchReserveVaultTransactions({ address, apiBase: "https://evil.example/api/v2", fetchImpl: success }), TypeError);
  await assert.rejects(fetchReserveVaultTransactions({ address, apiBase: "https://toncenter.com@evil.example/api/v2", fetchImpl: success }), TypeError);
});
test("rejects provider errors and malformed transaction responses", async () => {
  await assert.rejects(fetchReserveVaultTransactions({ address, fetchImpl: async () => ({ ok: false }) }), /failed/);
  await assert.rejects(fetchReserveVaultTransactions({ address, fetchImpl: async () => ({ ok: true, json: async () => ({ ok: false, result: [] }) }) }), /Unexpected/);
  await assert.rejects(fetchReserveVaultTransactions({ address, fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, result: {} }) }) }), /Unexpected/);
});
