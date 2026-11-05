import { Address } from "npm:@ton/core@0.63.1";

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
