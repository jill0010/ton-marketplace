// Read-only TON Center v2 order inspection. Never broadcasts or treats a getter as proof of payment.
import { pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";
import { normalizeV3TestnetAddress } from "./verify-v3-testnet.mjs";
import { Cell } from "@ton/core";

export function parseV3StackInteger(stack) {
  if (!Array.isArray(stack) || stack.length !== 1) throw new Error("Unexpected TVM getter stack");
  const [type, value] = stack[0];
  if (type === "null") return null;
  if (type !== "num" || typeof value !== "string" || !/^(?:0x[0-9a-fA-F]+|[0-9]+)$/.test(value)) {
    throw new Error("Invalid TVM integer");
  }
  return BigInt(value);
}
function unwrapOptionalGetterStack(stack) {
  // TON Center's JSON-RPC adapters have emitted both a TVM stack array and
  // a single tuple for empty optional values. Normalize only known empty forms.
  if (Array.isArray(stack) && stack.length === 0) return null;
  if (Array.isArray(stack) && stack.length === 2 &&
      typeof stack[0] === "string" && stack[0] === "list") {
    stack = [stack];
  }
  // The deployed Tolk optional-cell ABI is also returned by TON Center as
  // a four-slot tuple: three empty lists plus a zero presence discriminator.
  // Accept only this exact all-empty representation; any populated slot fails closed.
  if (Array.isArray(stack) && stack.length === 4) {
    const emptyList = (item) => Array.isArray(item) && item.length === 2 &&
      item[0] === "list" && item[1]?.["@type"] === "tvm.list" &&
      Array.isArray(item[1].elements) && item[1].elements.length === 0;
    const absentFlag = Array.isArray(stack[3]) && stack[3].length === 2 &&
      stack[3][0] === "num" && ["0x0", "0"].includes(String(stack[3][1]).toLowerCase());
    if (stack.slice(0, 3).every(emptyList) && absentFlag) return null;
  }
  if (!Array.isArray(stack) || stack.length !== 1 || !Array.isArray(stack[0]) || stack[0].length !== 2) {
    throw new Error("Unexpected optional TVM getter stack: " + JSON.stringify(stack));
  }
  const [type, value] = stack[0];
  if (type === "list" && value?.["@type"] === "tvm.list" && Array.isArray(value.elements)) {
    if (value.elements.length === 0) return null;
    if (value.elements.length === 1) return [value.elements[0]];
    throw new Error("Unexpected optional getter list length: " + JSON.stringify(stack));
  }
  if (type === "null") return null;
  return stack;
}
export function validV3GetterCell(stack) {
  stack = unwrapOptionalGetterStack(stack);
  if (stack === null) return false;
  if (!Array.isArray(stack) || stack.length !== 1) return false;
  const [type, value] = stack[0];
  if (!["cell", "slice"].includes(type) || typeof value?.bytes !== "string") return false;
  try {
    const roots = Cell.fromBoc(Buffer.from(value.bytes, "base64"));
    return roots.length === 1 && (roots[0].bits.length > 0 || roots[0].refs.length > 0);
  } catch { return false; }
}
export function classifyV3OrderReadiness(status, escrowId, reserve) {
  if (status === null || escrowId === null) return { known: false, safeToSettle: false };
  // No combination of getter values alone proves actual NFT transfer or funds receipt.
  return {
    known: true,
    safeToSettle: false,
    productStatus: status.toString(),
    escrowId: escrowId.toString(),
    reservePresent: reserve !== null,
    reason: "TRANSACTION_TRACE_AND_INDEPENDENT_SETTLEMENT_PROOF_REQUIRED",
  };
}
export async function inspectV3TestnetOrder({ marketplace, orderId }, fetcher = fetch) {
  const address = normalizeV3TestnetAddress(marketplace);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) throw new Error("Invalid order ID");
  const endpoint = "https://testnet.toncenter.com/api/v2/runGetMethod";
  async function getter(method, stack) {
    const response = await fetcher(endpoint, {
      method: "POST", redirect: "error",
      headers: { "Content-Type": "application/json",
        ...(process.env.TONCENTER_API_KEY ? { "X-API-Key": process.env.TONCENTER_API_KEY } : {}) },
      body: JSON.stringify({ address, method, stack }),
    });
    if (!response.ok) throw new Error("Getter HTTP " + response.status + ": " + method);
    const body = await response.json();
    if (body.ok !== true || body.result?.exit_code !== 0) throw new Error("Getter failed: " + method);
    return body.result.stack;
  }
  const input = [["num", "0x" + BigInt(orderId).toString(16)]];
  // Order cells are intentionally not interpreted as settled without an authenticated trace.
  const orderStack = await getter("orderCellV2", input);
  const orderExists = validV3GetterCell(orderStack);
  if (!orderExists) {
    if (unwrapOptionalGetterStack(orderStack) !== null) {
      throw new Error("Unrecognized order getter response: " + JSON.stringify(orderStack));
    }
  }
  const reserveStack = await getter("testPurchaseReserve", input);
  const reservePresent = validV3GetterCell(reserveStack);
  if (!reservePresent && unwrapOptionalGetterStack(reserveStack) !== null) {
    throw new Error("Unrecognized reserve getter response: " + JSON.stringify(reserveStack));
  }
  return {
    network: "testnet", address, orderId, orderExists, reservePresent,
    settlementVerified: false, refundFinalityVerified: false,
    noTransactionSent: true, mainnetApproved: false,
    missingProof: ["AUTHENTICATED_NFT_DELIVERY_TRACE", "AUTHENTICATED_FUNDS_SETTLEMENT_TRACE",
      "RESERVE_REFUND_FINALITY_AND_IDEMPOTENCY"],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = await inspectV3TestnetOrder({
      marketplace: process.env.V3_TESTNET_MARKETPLACE_ADDRESS,
      orderId: Number(process.env.V3_TESTNET_ORDER_ID),
    });
    if (process.env.V3_ORDER_EVIDENCE_OUTPUT) await writeFile(process.env.V3_ORDER_EVIDENCE_OUTPUT,
      JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify(report, null, 2));
    if (report.reservePresent && !report.orderExists) {
      console.error("INCONSISTENT STATE: reserve exists without a corresponding order");
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("V3 order inspection blocked: " + error.message);
    process.exitCode = 1;
  }
}
