/**
 * Convert a human-readable TON amount to nanotons without floating-point math.
 *
 * Accepts a positive decimal string with at most 9 fractional digits.
 * The result is bounded to PostgreSQL numeric(78, 0), matching the ledger schema.
 * Scientific notation, signs, separators, and excess precision are rejected.
 */
export function parseTonToNanotons(input: string): bigint {
  if (typeof input !== "string") {
    throw new Error("TON amount must be a decimal string");
  }

  const value = input.trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,9}))?$/.exec(value);

  if (!match) {
    throw new Error("Invalid TON amount");
  }

  const whole = match[1];
  const fraction = (match[2] ?? "").padEnd(9, "0");
  const nanotons = BigInt(whole) * 1_000_000_000n +
    BigInt(fraction || "0");

  if (nanotons <= 0n) {
    throw new Error("TON amount must be greater than zero");
  }

  if (nanotons.toString().length > 78) {
    throw new Error("TON amount exceeds the supported 78-digit atomic range");
  }

  return nanotons;
}
