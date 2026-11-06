import test from "node:test";
import assert from "node:assert/strict";
import { extractV3CandidateAddresses, postflightV3Candidate } from "./postflight-v3-candidate.mjs";

const log = [
  "V3 testnet candidate marketplace: 0:" + "1".repeat(64),
  "V3 testnet candidate escrow: 0:" + "2".repeat(64),
  "V3 testnet candidate coordinator: 0:" + "3".repeat(64),
].join("\n");
const code = "te6ccgEBAQEAIwAIQgKR2eKsFp/Hhc4A3gqBrydiK5t9F2RBXHdeflDAPOmKog==";

test("extracts exactly three distinct candidate addresses", () => {
  const result = extractV3CandidateAddresses(log);
  assert.equal(Object.keys(result).length, 3);
  assert.throws(() => extractV3CandidateAddresses(log + "\n" + log.split("\n")[0]), /exactly one marketplace/);
  assert.throws(() => extractV3CandidateAddresses(log.split("\n").slice(1).join("\n")), /exactly one marketplace/);
});
test("postflight checks actual testnet accounts but never certifies hashes or release", async () => {
  let calls = 0;
  const result = await postflightV3Candidate(log, async (url, options) => {
    calls++;
    assert.match(url, /^https:\/\/testnet\.toncenter\.com\//);
    assert.equal(options.method, "GET");
    return { ok: true, json: async () => ({ ok: true, result: { state: "active", code } }) };
  });
  assert.equal(calls, 3);
  assert.equal(result.candidateAccountsActive, true);
  assert.equal(result.codeHashesVerified, false);
  assert.equal(result.bindingsVerified, false);
  assert.equal(result.mainnetApproved, false);
});
test("missing contract code blocks candidate acceptance", async () => {
  const result = await postflightV3Candidate(log, async () => ({
    ok: true, json: async () => ({ ok: true, result: { state: "active", code: "" } }),
  }));
  assert.equal(result.candidateAccountsActive, false);
});

test("candidate parser rejects appended tokens and log injection", () => {
  assert.throws(() => extractV3CandidateAddresses(log.replace(
    "V3 testnet candidate marketplace: 0:" + "1".repeat(64),
    "V3 testnet candidate marketplace: 0:" + "1".repeat(64) + " unexpected",
  )), /Invalid marketplace address token/);
});
