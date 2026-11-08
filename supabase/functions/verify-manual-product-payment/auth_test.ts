import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { requireActiveWalletProof } from "./shared/auth.ts";
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
