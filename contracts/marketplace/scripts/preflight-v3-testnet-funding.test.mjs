import test from "node:test";
import assert from "node:assert/strict";
import { checkV3TestnetFunding } from "./preflight-v3-testnet-funding.mjs";

const addresses = { deployer: "0:" + "01".repeat(32), treasury: "0:" + "02".repeat(32) };

test("funding preflight accepts balances that cover the complete Testnet trial", async () => {
  const fetcher = async (url) => ({
    ok: true,
    json: async () => ({
      ok: true,
      result: { balance: url.searchParams.get("address") === addresses.deployer ? "2200000000" : "1900000000" },
    }),
  });
  const report = await checkV3TestnetFunding(addresses, fetcher);
  assert.equal(report.sufficient, true);
  assert.equal(report.noTransactionSent, true);
});

test("funding preflight fails closed before deployment when either wallet is underfunded", async () => {
  const fetcher = async (url) => ({
    ok: true,
    json: async () => ({
      ok: true,
      result: { balance: url.searchParams.get("address") === addresses.deployer ? "1999999999" : "1900000000" },
    }),
  });
  const report = await checkV3TestnetFunding(addresses, fetcher);
  assert.equal(report.sufficient, false);
  assert.equal(report.balances.deployer.sufficient, false);
});
