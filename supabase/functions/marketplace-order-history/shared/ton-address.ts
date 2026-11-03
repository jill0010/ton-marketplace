import { Address } from "@ton/core";

export function normalizeTonAddress(input: string): string {
  if (typeof input !== "string" || !input.trim()) {
    throw new Error("Invalid TON address");
  }

  try {
    return Address.parse(input.trim()).toRawString();
  } catch {
    throw new Error("Invalid TON address");
  }
}
