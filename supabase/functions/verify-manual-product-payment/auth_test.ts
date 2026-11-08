import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { requireActiveWalletProof, requireBearerToken } from "./shared/auth.ts";
import { normalizeTonAddress } from "./shared/ton-address.ts";

Deno.test("rejects expired, invalid and missing proof expiration", () => {
  const now = Date.parse("2026-11-09T00:00:00Z");
  for (const expires of ["2026-11-08T23:59:59Z", "2026-11-09T00:00:00Z", "not-a-date", ""]) {
    assertThrows(() => requireActiveWalletProof(expires, now), Error, "TON wallet proof expired");
  }
  requireActiveWalletProof("2026-11-09T00:00:01Z", now);
});

Deno.test("TON wallet address normalization rejects invalid addresses", () => {
  for (const invalid of ["", " ", "not-a-wallet", "0:abc", "EQnotavalidwallet"]) {
    assertThrows(() => normalizeTonAddress(invalid), Error, "Invalid TON address");
  }
  const raw = "0:" + "a".repeat(64);
  assertEquals(normalizeTonAddress(raw), raw);
});

Deno.test("authorization gate rejects missing, malformed and empty bearer tokens", () => {
  for (const authorization of [null, "", "Basic abc", "Bearer ", "bearer abc"]) {
    const headers = new Headers();
    if (authorization !== null) headers.set("Authorization", authorization);
    assertThrows(() => requireBearerToken(new Request("https://example.test", { headers })), Error, "Missing authorization token");
  }
  assertEquals(requireBearerToken(new Request("https://example.test", {
    headers: { Authorization: "Bearer example-token" },
  })), "example-token");
});

import { isOrderOwnedByVerifiedWallet } from "./shared/order-identity.ts";

Deno.test("only exact verified wallet and authenticated user own an order", () => {
  const wallet = { userId: "buyer-a", walletAddress: "0:" + "a".repeat(64) };
  const owned = { buyer_user_id: "buyer-a", buyer_wallet_raw: wallet.walletAddress };
  assertEquals(isOrderOwnedByVerifiedWallet(owned, wallet), true);
  assertEquals(isOrderOwnedByVerifiedWallet({ ...owned, buyer_user_id: "buyer-b" }, wallet), false);
  assertEquals(isOrderOwnedByVerifiedWallet({ ...owned, buyer_wallet_raw: "0:" + "b".repeat(64) }, wallet), false);
  assertEquals(isOrderOwnedByVerifiedWallet({ ...owned, buyer_wallet_raw: null }, wallet), false);
});

import { validPaymentWindow, paymentIsWithinWindow } from "./shared/payment-window.ts";

Deno.test("payment windows reject inconsistent and future-dated orders", () => {
  const now = Date.parse("2026-11-09T00:00:00Z");
  assertEquals(validPaymentWindow("2026-11-08T23:00:00Z", "2026-11-09T01:00:00Z", now), true);
  assertEquals(validPaymentWindow("bad", "2026-11-09T01:00:00Z", now), false);
  assertEquals(validPaymentWindow("2026-11-09T01:00:00Z", "2026-11-09T00:00:00Z", now), false);
  assertEquals(validPaymentWindow("2026-11-09T00:02:01Z", "2026-11-09T01:00:00Z", now), false);
});

Deno.test("transaction must fall inside bounded payment window", () => {
  const start = "2026-11-09T00:00:00Z";
  const end = "2026-11-09T00:10:00Z";
  const timestamp = Date.parse(start);
  assertEquals(paymentIsWithinWindow(timestamp, start, end), true);
  assertEquals(paymentIsWithinWindow(timestamp - 120_001, start, end), false);
  assertEquals(paymentIsWithinWindow(Date.parse(end) + 1, start, end), false);
  assertEquals(paymentIsWithinWindow(Number.NaN, start, end), false);
});

import { validHistoryPage } from "./shared/history-integrity.ts";

Deno.test("history pagination rejects out-of-order, repeated and malformed transactions", () => {
  const hash = "a".repeat(64);
  const row = (utime: number, lt: string, h = hash) => ({ utime, transaction_id: { lt, hash: h } });
  const seen = new Set<string>();
  assertEquals(validHistoryPage([row(200, "20"), row(190, "19")], Infinity, seen).valid, true);
  assertEquals(validHistoryPage([row(201, "18")], 190, seen).valid, false);
  assertEquals(validHistoryPage([row(180, "20")], 190, seen).valid, false);
  assertEquals(validHistoryPage([row(180, "18"), row(181, "17")], 190, seen).valid, false);
  assertEquals(validHistoryPage([row(180, "18", "bad")], 190, seen).valid, false);
  assertEquals(validHistoryPage([row(180, "18"), row(179, "18")], 190, seen).valid, false);
  assertEquals(validHistoryPage([row(180, "18")], 190, seen).valid, true);
});

Deno.test("history boundary: equal-time rows and empty terminal page remain valid", () => {
  const row = (utime: number, lt: string, hash: string) => ({ utime, transaction_id: { lt, hash } });
  const seen = new Set<string>();
  const first = validHistoryPage([row(300, "300", "a".repeat(64)), row(300, "299", "b".repeat(64))], Infinity, seen);
  assertEquals(first.valid, true);
  assertEquals(first.oldestUtime, 300);
  const second = validHistoryPage([row(300, "298", "c".repeat(64)), row(299, "297", "d".repeat(64))], 300, seen);
  assertEquals(second.valid, true);
  assertEquals(second.oldestUtime, 299);
  assertEquals(validHistoryPage([], 299, seen).valid, true);
});

Deno.test("history boundary: invalid page does not poison seen transaction IDs", () => {
  const row = (utime: number, lt: string, hash: string) => ({ utime, transaction_id: { lt, hash } });
  const seen = new Set<string>();
  const tx = row(200, "200", "a".repeat(64));
  assertEquals(validHistoryPage([tx, row(201, "199", "b".repeat(64))], Infinity, seen).valid, false);
  assertEquals(seen.size, 0);
  assertEquals(validHistoryPage([tx], Infinity, seen).valid, true);
  assertEquals(seen.size, 1);
  assertEquals(validHistoryPage([tx], Infinity, seen).valid, false);
});

Deno.test("history boundary: malformed times and IDs fail closed", () => {
  const seen = new Set<string>();
  const row = (utime: unknown, lt: unknown, hash: unknown) => ({ utime, transaction_id: { lt, hash } });
  for (const invalid of [NaN, Infinity, -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assertEquals(validHistoryPage([row(invalid, "1", "a".repeat(64))], Infinity, seen).valid, false);
  }
  for (const invalid of ["", "-1", "1.2", "abc"]) {
    assertEquals(validHistoryPage([row(200, invalid, "a".repeat(64))], Infinity, seen).valid, false);
  }
  assertEquals(validHistoryPage([row(200, "1", "z".repeat(64))], Infinity, seen).valid, false);
});
