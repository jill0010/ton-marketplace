import test from "node:test";
import assert from "node:assert/strict";
import { collectV3TestnetEvidence } from "./collect-v3-testnet-evidence.mjs";

const addresses = {
  marketplace: "0:" + "1".repeat(64),
  escrow: "0:" + "2".repeat(64),
  coordinator: "0:" + "3".repeat(64),
};

test("evidence collector reads three contracts and never approves real funds", async () => {
  let calls = 0;
  const evidence = await collectV3TestnetEvidence(addresses, async (_url, options) => {
    calls++;
    assert.equal(options.method, "GET");
    return { ok: true, json: async () => ({ ok: true, result: { state: "active", code: "te6ccgEBAQEAIwAIQgKR2eKsFp/Hhc4A3gqBrydiK5t9F2RBXHdeflDAPOmKog==" } }) };
  });
  assert.equal(calls, 3);
  assert.equal(evidence.postflight.allActive, true);
  assert.equal(evidence.deploymentVerified, false);
  assert.equal(evidence.realFundsApproved, false);
  assert.equal(evidence.mainnetApproved, false);
  assert.ok(evidence.missingProof.includes("RESERVE_REFUND_FINALITY_AND_IDEMPOTENCY"));
});

test("evidence collector fails closed when RPC fails", async () => {
  await assert.rejects(collectV3TestnetEvidence(addresses, async () => ({
    ok: false, status: 429,
  })), /RPC HTTP error/);
});

test("matched expected code hashes clear only the code hash evidence blocker", async () => {
  const code = "te6ccgEBAQEAIwAIQgKR2eKsFp/Hhc4A3gqBrydiK5t9F2RBXHdeflDAPOmKog==";
  const { parseV3ContractCode } = await import("./verify-v3-testnet.mjs");
  const hash = parseV3ContractCode(code).codeHash;
  const expected = { marketplace: hash, escrow: hash, coordinator: hash };
  const evidence = await collectV3TestnetEvidence(addresses, async () => ({
    ok: true, json: async () => ({ ok: true, result: { state: "active", code } }),
  }), expected);
  assert.equal(evidence.postflight.codeHashesVerified, true);
  assert.equal(evidence.missingProof.includes("ONCHAIN_CODE_HASH_MATCH"), false);
  assert.equal(evidence.deploymentVerified, false);
  assert.equal(evidence.realFundsApproved, false);
  assert.equal(evidence.mainnetApproved, false);
});
