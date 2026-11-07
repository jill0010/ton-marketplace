// Read-only testnet getter verification. A failed or undecodable getter blocks binding approval.
import { Cell } from "@ton/core";
import { pathToFileURL } from "node:url";
import { normalizeV3TestnetAddress, validateV3Addresses } from "./verify-v3-testnet.mjs";

export const V3_TESTNET_OWNER = "0QDQEewIr69mGcq6uDIlAtibxW37gm7rJfKWru7o4_hSPbzu";
export const V3_TESTNET_TREASURY = "0QASRB4XGtN81Pwaef6fWnSJyRwwJEvbbPn-ksz0KQI-bFa0";

export function decodeAddressGetter(stack) {
  if (!Array.isArray(stack) || stack.length !== 1) throw new Error("Unexpected getter stack");
  const [type, value] = stack[0];
  if (!["cell", "slice"].includes(type) || typeof value?.bytes !== "string") throw new Error("Expected address cell/slice getter");
  const cells = Cell.fromBoc(Buffer.from(value.bytes, "base64"));
  if (cells.length !== 1) throw new Error("Unexpected address BOC roots");
  const addr = cells[0].beginParse().loadAddress();
  if (!addr) throw new Error("Getter returned null address");
  return normalizeV3TestnetAddress(addr.toRawString());
}

export async function verifyV3Bindings(addresses, fetcher = fetch) {
  const normalized = Object.fromEntries(validateV3Addresses(addresses));
  const checks = [
    ["marketplaceOwner", "marketplace", "ownerV2", V3_TESTNET_OWNER],
    ["marketplaceEscrow", "marketplace", "escrowV2", normalized.escrow],
    ["marketplaceTreasury", "marketplace", "treasuryV2", V3_TESTNET_TREASURY],
    ["marketplaceCoordinator", "marketplace", "testReserveCoordinator", normalized.coordinator],
    ["escrowMarketplace", "escrow", "marketplace", normalized.marketplace],
    ["escrowOwner", "escrow", "owner", V3_TESTNET_OWNER],
    ["coordinatorMarketplace", "coordinator", "testReserveMarketplace", normalized.marketplace],
    ["coordinatorOwner", "coordinator", "testReserveOwner", V3_TESTNET_OWNER],
  ];
  const results = {};
  for (const [name, contract, method, expected] of checks) {
    // TON Center v2 runGetMethod is a POST endpoint; GET returns HTTP 404.
    // This POST executes a read-only TVM getter, never broadcasts a transaction.
    const url = "https://testnet.toncenter.com/api/v2/runGetMethod";
    const requestBody = JSON.stringify({ address: normalized[contract], method, stack: [] });
    let response;
    for (let attempt = 0; attempt < 5; attempt++) {
      response = await fetcher(url, {
        method: "POST", redirect: "error",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.TONCENTER_API_KEY ? { "X-API-Key": process.env.TONCENTER_API_KEY } : {}),
        },
        body: requestBody,
      });
      if (response.ok) break;
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 4) throw new Error(`Getter RPC HTTP error ${name}: ${response.status}`);
      await new Promise(resolve => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 8000)));
    }
    const body = await response.json();
    if (body.ok !== true || body.result?.exit_code !== 0) throw new Error(`Getter failed: ${name}`);
    const actual = decodeAddressGetter(body.result.stack);
    results[name] = { method, contract, actual, expected: normalizeV3TestnetAddress(expected), matches: actual === normalizeV3TestnetAddress(expected) };
  }
  return {
    network: "testnet",
    bindingsVerified: Object.values(results).every(item => item.matches),
    checks: results,
    noTransactionSent: true,
    codeHashesVerified: false,
    settlementVerified: false,
    mainnetApproved: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await verifyV3Bindings({
      marketplace: process.env.V3_TESTNET_MARKETPLACE_ADDRESS,
      escrow: process.env.V3_TESTNET_ESCROW_ADDRESS,
      coordinator: process.env.V3_TESTNET_COORDINATOR_ADDRESS,
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.bindingsVerified) process.exitCode = 1;
  } catch (error) {
    console.error("V3 binding verification blocked: " + error.message);
    process.exitCode = 1;
  }
}
