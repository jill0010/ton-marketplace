import test from "node:test";
import assert from "node:assert/strict";
import { hasPlausibleContractCode, parseV3ContractCode, normalizeV3TestnetAddress, validateV3Addresses, verifyV3Testnet } from "./verify-v3-testnet.mjs";

const addresses = {
  marketplace: "0:" + "1".repeat(64),
  escrow: "0:" + "2".repeat(64),
  coordinator: "0:" + "3".repeat(64),
};

test("requires three distinct, syntactically valid addresses", () => {
  assert.equal(validateV3Addresses(addresses).length, 3);
  assert.throws(() => validateV3Addresses({ ...addresses, escrow: addresses.marketplace }), /distinct/);
  assert.throws(() => validateV3Addresses({ ...addresses, coordinator: "bad" }), /Invalid/);
});

test("read-only verifier reports active state without approving release", async () => {
  const urls = [];
  const fetcher = async (url, options) => {
    urls.push(url);
    assert.equal(options.method, "GET");
    assert.ok(url.startsWith("https://testnet.toncenter.com/"));
    return { ok: true, json: async () => ({ ok: true, result: { state: "active", code: "te6ccgEBAQEAIwAIQgKR2eKsFp/Hhc4A3gqBrydiK5t9F2RBXHdeflDAPOmKog==" } }) };
  };
  const report = await verifyV3Testnet(addresses, fetcher);
  assert.equal(urls.length, 3);
  assert.equal(report.allActive, true);
  assert.equal(report.allCodePresent, true);
  assert.match(report.contracts.marketplace.codeHash, /^[0-9a-f]{64}$/);
  assert.equal(report.mainnetReleaseApproved, false);
  assert.equal(report.fundedTransactionVerified, false);
  assert.equal(report.noTransactionSent, true);
});

test("inactive contracts and RPC failures fail closed", async () => {
  const report = await verifyV3Testnet(addresses, async () => ({
    ok: true, json: async () => ({ ok: true, result: { state: "uninitialized" } }),
  }));
  assert.equal(report.allActive, false);
  await assert.rejects(verifyV3Testnet(addresses, async () => ({
    ok: false, status: 503,
  })), /RPC HTTP error/);
  await assert.rejects(verifyV3Testnet(addresses, async () => ({
    ok: true, json: async () => ({ ok: false }),
  })), /Invalid TON Center response/);
});

test("testnet friendly address CRC is verified and aliases cannot duplicate contracts", () => {
  const friendly = "kQBOglO1zKs6_ztpWE-GUHFlt2wdILnHBY2HIC8DdwBVINEm";
  const canonical = normalizeV3TestnetAddress(friendly);
  assert.match(canonical, /^0:[0-9a-f]{64}$/);
  assert.throws(() => normalizeV3TestnetAddress("U" + friendly.slice(1)), /checksum|testnet-only/);
  assert.throws(() => normalizeV3TestnetAddress(friendly.slice(0, 10) + (friendly[10] === "A" ? "B" : "A") + friendly.slice(11)), /checksum/);
  assert.throws(() => validateV3Addresses({ marketplace: friendly, escrow: canonical, coordinator: addresses.coordinator }), /distinct/);
});

test("active account without contract code is not a valid deployment", async () => {
  const report = await verifyV3Testnet(addresses, async () => ({
    ok: true, json: async () => ({ ok: true, result: { state: "active", code: "" } }),
  }));
  assert.equal(report.allActive, true);
  assert.equal(report.allCodePresent, false);
});

test("contract code validation rejects arbitrary text, empty and malformed BOCs", () => {
  assert.equal(hasPlausibleContractCode("te6ccgEBAQEAIwAIQgKR2eKsFp/Hhc4A3gqBrydiK5t9F2RBXHdeflDAPOmKog=="), true);
  for (const code of ["", "hello world", "dGVzdA==", "te6ccgEBAQEAAgAAAA==", "te6ccgEBAQEAIwAIQgKR2eKsFp/Hhc4A3gqBrydiK5t9F2RBXHdeflDAPOmKog="]) {
    assert.equal(hasPlausibleContractCode(code), false, code);
  }
});

test("contract BOC decoder exposes a reproducible 256-bit code hash", () => {
  const valid = "te6ccgEBAQEAIwAIQgKR2eKsFp/Hhc4A3gqBrydiK5t9F2RBXHdeflDAPOmKog==";
  assert.match(parseV3ContractCode(valid).codeHash, /^[0-9a-f]{64}$/);
  const corrupted = Buffer.from(valid, "base64");
  corrupted[corrupted.length - 1] ^= 0xff;
  assert.equal(parseV3ContractCode(corrupted.toString("base64")), null);
});
