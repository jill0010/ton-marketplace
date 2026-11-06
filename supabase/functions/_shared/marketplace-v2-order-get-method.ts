export type RunGetMethodRequest = {
  address: string;
  method: "orderCellV2";
  stack: Array<{ type: "num"; value: string }>;
};

export function parseMarketplaceV2OrderId(value: unknown): string {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,19}$/.test(value)) {
    throw new Error("order_id must be a positive uint64 decimal string");
  }
  const parsed = BigInt(value);
  if (parsed > 0xffff_ffff_ffff_ffffn) throw new Error("order_id exceeds uint64");
  return value;
}

export function buildOrderCellRunGetMethodRequest(
  address: string,
  orderId: string,
): RunGetMethodRequest {
  const id = parseMarketplaceV2OrderId(orderId);
  return {
    address,
    method: "orderCellV2",
    stack: [{ type: "num", value: `0x${BigInt(id).toString(16)}` }],
  };
}

function extractCellBoc(entry: Record<string, unknown>): string | null {
  if (entry.type === "cell" && typeof entry.value === "string") return entry.value;
  if (entry["@type"] === "tvm.stackEntryCell") {
    const cell = entry.cell;
    if (cell && typeof cell === "object" && !Array.isArray(cell)) {
      const bytes = (cell as Record<string, unknown>).bytes;
      if (typeof bytes === "string") return bytes;
    }
  }
  return null;
}

/**
 * Accept only the documented TON Center V3 legacy stack entity cell form,
 * or the typed TVM cell form. Never infer a BOC from arbitrary response fields.
 */
export function extractOrderCellBoc(response: unknown): string {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new Error("TON Center returned an invalid get-method response");
  }
  const root = response as Record<string, unknown>;
  const result = root.result && typeof root.result === "object" && !Array.isArray(root.result)
    ? root.result as Record<string, unknown>
    : root;
  if (typeof result.exit_code === "number" && result.exit_code !== 0) {
    throw new Error(`Marketplace V2 get-method failed with exit code ${result.exit_code}`);
  }
  if (!Array.isArray(result.stack) || result.stack.length !== 1) {
    throw new Error("orderCellV2 must return exactly one stack item");
  }
  const entry = result.stack[0];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error("orderCellV2 returned an unsupported stack item");
  }
  const cell = extractCellBoc(entry as Record<string, unknown>);
  if (cell) return cell;

  const type = (entry as Record<string, unknown>).type;
  if (type === "null" || type === "unsupported") {
    throw new Error("Marketplace V2 order does not exist or returned a null cell");
  }
  throw new Error("orderCellV2 did not return a documented cell stack item");
}
