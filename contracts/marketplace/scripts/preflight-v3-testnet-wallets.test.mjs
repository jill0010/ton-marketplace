import test from "node:test";
import assert from "node:assert/strict";
import { preflightV3TestnetWallets } from "./preflight-v3-testnet-wallets.mjs";

function mock(balances, states = ["active", "active"]) {
  let calls = 0;
  return async (url, options) => {
    assert.match(url, /^https:\/\/testnet\.toncenter\.com\/api\/v2\/getAddressInformation\?/);
    assert.equal(options.method, "GET");
    const i = calls++;
    return { ok: true, json: async () => ({ ok: true, result: { state: states[i], balance: balances[i] } }) };
  };
}
test("testnet preflight requires funded active deployer, never authorizes mainnet", async () => {
  const report = await preflightV3TestnetWallets(mock(["2000000000", "0"]));
  assert.equal(report.preflightPassed, true);
  assert.equal(report.noTransactionSent, true);
  assert.equal(report.deploymentVerified, false);
  assert.equal(report.mainnetApproved, false);
  assert.notEqual(report.wallets.deployer.address, report.wallets.treasury.address);
});
test("insufficient funds or inactive signer blocks deployment", async () => {
  assert.equal((await preflightV3TestnetWallets(mock(["1000000000", "0"]))).preflightPassed, false);
  assert.equal((await preflightV3TestnetWallets(mock(["2000000000", "0"], ["uninitialized", "active"]))).preflightPassed, false);
});
test("malformed balances and RPC failures fail closed", async () => {
  await assert.rejects(preflightV3TestnetWallets(mock(["NaN", "0"])), /Invalid deployer balance/);
  await assert.rejects(preflightV3TestnetWallets(async () => ({ ok: false, status: 503 })), /RPC HTTP error/);
});
