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
    return { ok: true, json: async () => ({ ok: true, result: { state: "active" } }) };
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
