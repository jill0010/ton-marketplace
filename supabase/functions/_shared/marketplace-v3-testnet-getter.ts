/**
 * Fail-closed decoding for TON Center V3 read-only getter responses.
 * This is a transport parser, NOT proof of chain finality or NFT custody.
 */
export function extractV3TestnetGetterStack(response: unknown): Array<Record<string, unknown>> {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new Error("Invalid Testnet getter response");
  }
  const root = response as Record<string, unknown>;
  // TON Center responses can be returned directly or wrapped in "result".
  const data = root.result && typeof root.result === "object" &&
    !Array.isArray(root.result) ? root.result as Record<string, unknown> : root;
  if (root.ok === false || root.success === false ||
      data.ok === false || data.success === false ||
      (Object.hasOwn(root, "result") &&
        (!root.result || typeof root.result !== "object" || Array.isArray(root.result)))) {
    throw new Error("Testnet RPC reported failure");
  }
  if (data.exit_code !== 0 || !Array.isArray(data.stack) ||
      data.stack.length > 8) {
    throw new Error("Testnet getter failed or returned an invalid stack");
  }
  const entries: Array<Record<string, unknown>> = [];
  for (const value of data.stack) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid Testnet stack entry");
    }
    const entry = value as Record<string, unknown>;
    if (typeof entry.type !== "string" ||
        !["num", "null", "cell", "slice", "tuple", "list"].includes(entry.type)) {
      throw new Error("Unsupported Testnet stack entry type");
    }
    entries.push(entry);
  }
  return entries;
}

export function parseV3TestnetUint64(response: unknown): bigint | null {
  const stack = extractV3TestnetGetterStack(response);
  if (stack.length !== 1) throw new Error("Expected one Testnet getter result");
  const item = stack[0];
  if (item.type === "null") return null;
  if (item.type !== "num" || typeof item.value !== "string" ||
      !/^(0|[1-9][0-9]*)$/.test(item.value)) {
    throw new Error("Expected decimal Testnet uint64");
  }
  const number = BigInt(item.value);
  if (number > 0xffff_ffff_ffff_ffffn) throw new Error("Testnet uint64 overflow");
  return number;
}

export function parseV3TestnetBoolean(response: unknown): boolean {
  const stack = extractV3TestnetGetterStack(response);
  if (stack.length !== 1 || stack[0].type !== "num") {
    throw new Error("Expected one Testnet boolean");
  }
  // TON TVM booleans are -1 for true and 0 for false.
  if (stack[0].value === "-1") return true;
  if (stack[0].value === "0") return false;
  throw new Error("Unexpected Testnet boolean value");
}
