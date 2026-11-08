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
