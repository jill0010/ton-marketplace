import { assertEquals, assertThrows } from "jsr:@std/assert";
import { parseTonToNanotons } from "./ton-amount.ts";

Deno.test("converts whole and fractional TON values exactly", () => {
  assertEquals(parseTonToNanotons("1"), 1_000_000_000n);
  assertEquals(parseTonToNanotons("1.25"), 1_250_000_000n);
  assertEquals(parseTonToNanotons("0.000000001"), 1n);
  assertEquals(parseTonToNanotons("12.000000001"), 12_000_000_001n);
});

Deno.test("pads fractional digits to nanotons precision", () => {
  assertEquals(parseTonToNanotons("0.1"), 100_000_000n);
  assertEquals(parseTonToNanotons("0.00001"), 10_000n);
  assertEquals(parseTonToNanotons(" 2.50 "), 2_500_000_000n);
});

Deno.test("rejects zero and negative amounts", () => {
  assertThrows(() => parseTonToNanotons("0"), Error);
  assertThrows(() => parseTonToNanotons("0.000000000"), Error);
  assertThrows(() => parseTonToNanotons("-1"), Error);
});

Deno.test("rejects values that cannot be represented as exact TON decimals", () => {
  assertThrows(() => parseTonToNanotons("1.0000000001"), Error);
  assertThrows(() => parseTonToNanotons("1e-9"), Error);
  assertThrows(() => parseTonToNanotons("+1"), Error);
  assertThrows(() => parseTonToNanotons("01"), Error);
  assertThrows(() => parseTonToNanotons("1,000"), Error);
  assertThrows(() => parseTonToNanotons(""), Error);
});

Deno.test("enforces the PostgreSQL numeric(78, 0) atomic amount limit", () => {
  const largestWholePart = "9".repeat(69);
  assertEquals(
    parseTonToNanotons(largestWholePart).toString().length,
    78,
  );
  assertThrows(
    () => parseTonToNanotons("1".repeat(70)),
    Error,
  );
});
