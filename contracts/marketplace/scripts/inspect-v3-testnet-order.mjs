// Read-only TON Center v2 order inspection. Never broadcasts or treats a getter as proof of payment.
import { pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";
import { normalizeV3TestnetAddress } from "./verify-v3-testnet.mjs";

export function parseV3StackInteger(stack) {
  if (!Array.isArray(stack) || stack.length !== 1) throw new Error("Unexpected TVM getter stack");
  const [type, value] = stack[0];
  if (type === "null") return null;
  if (type !== "num" || typeof value !== "string" || !/^(?:0x[0-9a-fA-F]+|[0-9]+)$/.test(value)) {
    throw new Error("Invalid TVM integer");
  }
  return BigInt(value);
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
  const orderExists = Array.isArray(orderStack) && orderStack.length === 1 &&
    (orderStack[0][0] === "cell" || orderStack[0][0] === "slice");
  if (!orderExists) {
    if (!Array.isArray(orderStack) || orderStack.length !== 1 || orderStack[0][0] !== "null") {
      throw new Error("Unrecognized order getter response");
    }
  }
  const reserveStack = await getter("testPurchaseReserve", input);
  const reservePresent = Array.isArray(reserveStack) && reserveStack.length === 1 &&
    ["cell", "slice"].includes(reserveStack[0][0]);
  if (!reservePresent && !(Array.isArray(reserveStack) && reserveStack.length === 1 &&
    reserveStack[0][0] === "null")) throw new Error("Unrecognized reserve getter response");
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
    if (!report.orderExists || !report.reservePresent) process.exitCode = 1;
  } catch (error) {
    console.error("V3 order inspection blocked: " + error.message);
    process.exitCode = 1;
  }
}
