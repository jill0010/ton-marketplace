import test from "node:test";
import assert from "node:assert/strict";
import { fetchTestnetTransactionHistory } from "./fetch-v3-testnet-history.mjs";
const account = "0:" + "1".repeat(64);
test("paginates full 100-record windows and collects the final partial page", async () => {
  const offsets = [];
  const result = await fetchTestnetTransactionHistory(account, async (url, options) => {
    assert.equal(options.method, "GET");
    assert.equal(new URL(url).hostname, "testnet.toncenter.com");
    const offset = Number(new URL(url).searchParams.get("offset"));
    offsets.push(offset);
    const count = offset === 0 ? 100 : 1;
    return { ok: true, json: async () => ({ transactions: Array.from({ length: count }, (_, i) =>
      ({ hash: (offset + i + 1).toString(16).padStart(64, "0"), lt: String(offset + i + 1) })) }) };
  });
  assert.deepEqual(offsets, [0, 100]);
  assert.equal(result.transactions.length, 101);
  assert.equal(result.pageComplete, true);
});
test("bounded history fails closed if last page is full", async () => {
  const result = await fetchTestnetTransactionHistory(account, async () =>
    ({ ok: true, json: async () => ({ transactions: [{ hash: "a".repeat(64), lt: "1" }] }) }),
    { maxPages: 1, pageSize: 1 });
  assert.equal(result.pageComplete, false);
});
test("duplicate transactions and invalid pagination fail closed", async () => {
  await assert.rejects(fetchTestnetTransactionHistory(account, async () =>
    ({ ok: true, json: async () => ({ transactions: [{ hash: "a".repeat(64), lt: "1" }, { hash: "a".repeat(64), lt: "1" }] }) }),
    { pageSize: 2 }), /Duplicate/);
  await assert.rejects(fetchTestnetTransactionHistory(account, fetch, { maxPages: 0 }), /Invalid bounded/);
});

test("rejects malformed transaction hash, LT, and non-testnet account aliases", async () => {
  const serve = (tx) => async () => ({ ok: true, json: async () => ({ transactions: [tx] }) });
  await assert.rejects(fetchTestnetTransactionHistory(account, serve({ hash: "bad", lt: "1" })), /Invalid testnet transaction hash/);
  await assert.rejects(fetchTestnetTransactionHistory(account, serve({ hash: "a".repeat(64), lt: "-1" })), /Duplicate or unidentified/);
  await assert.rejects(fetchTestnetTransactionHistory("not-an-address", serve({ hash: "a".repeat(64), lt: "1" })), /Invalid TON address/);
});
