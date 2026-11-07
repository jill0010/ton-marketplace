// Read-only postflight for the four production V3 Testnet accounts.
import { pathToFileURL } from "node:url";
import { normalizeV3TestnetAddress, parseV3ContractCode, normalizeV3CodeHash } from "./verify-v3-testnet.mjs";

const NAMES = ["marketplace", "escrow", "coordinator", "verifier"];

export function validateV3ProductionAddresses(addresses) {
  const entries = NAMES.map((name) => {
    if (typeof addresses?.[name] !== "string") throw new Error("Missing production V3 " + name + " address");
    return [name, normalizeV3TestnetAddress(addresses[name])];
  });
  if (new Set(entries.map(([, value]) => value)).size !== NAMES.length) {
    throw new Error("Production V3 contract addresses must be distinct");
  }
  return entries;
}

export function compareV3ProductionCodeHashes(contracts, expectedHashes) {
  const valid = expectedHashes && NAMES.every((name) => {
    try { return normalizeV3CodeHash(expectedHashes[name]).length === 64; } catch { return false; }
  });
  if (!valid) return { verified: false, matches: null, reason: "EXPECTED_HASHES_MISSING_OR_INVALID" };
  const matches = Object.fromEntries(NAMES.map((name) => [
    name,
    contracts[name]?.codeHash === normalizeV3CodeHash(expectedHashes[name]),
  ]));
  const verified = Object.values(matches).every(Boolean);
  return { verified, matches, reason: verified ? null : "ONCHAIN_CODE_HASH_MISMATCH" };
}

export async function verifyV3ProductionTestnet(addresses, fetcher = fetch, expectedHashes = null) {
  const entries = validateV3ProductionAddresses(addresses);
  const endpoint = "https://testnet.toncenter.com/api/v2/getAddressInformation";
  const contracts = {};
  for (const [index, [name, address]] of entries.entries()) {
    if (index) await new Promise((resolve) => setTimeout(resolve, 1200));
    const url = new URL(endpoint);
    url.searchParams.set("address", address);
    const headers = process.env.TONCENTER_API_KEY ? { "X-API-Key": process.env.TONCENTER_API_KEY } : undefined;
    let response;
    for (let attempt = 0; attempt < 5; attempt++) {
      response = await fetcher(url.toString(), { method: "GET", redirect: "error", ...(headers ? { headers } : {}) });
      if (response.ok) break;
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 4) {
        throw new Error("RPC HTTP error for " + name + ": " + response.status);
      }
      await new Promise((resolve) => setTimeout(resolve,
        response.status === 429 ? Math.min(3000 * 2 ** attempt, 24000) : Math.min(1000 * 2 ** attempt, 8000)));
    }
    const data = await response.json();
    if (data.ok !== true || !data.result || typeof data.result !== "object") {
      throw new Error("Invalid TON Center response for " + name);
    }
    const parsed = parseV3ContractCode(data.result.code);
    contracts[name] = {
      address,
      state: data.result.state,
      active: data.result.state === "active",
      codePresent: parsed !== null,
      codeHash: parsed?.codeHash ?? null,
    };
  }
  const comparison = compareV3ProductionCodeHashes(contracts, expectedHashes);
  const allActive = Object.values(contracts).every((item) => item.active);
  const allCodePresent = Object.values(contracts).every((item) => item.codePresent);
  return {
    network: "testnet",
    contracts,
    allActive,
    allCodePresent,
    codeHashesVerified: comparison.verified && allActive && allCodePresent,
    codeHashComparison: comparison,
    bindingsVerified: false,
    fundedPurchaseVerified: false,
    settlementVerified: false,
    mainnetReleaseApproved: false,
    noTransactionSent: true,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const addresses = Object.fromEntries(NAMES.map((name) => [name, process.env["V3_PRODUCTION_TESTNET_" + name.toUpperCase() + "_ADDRESS"]]));
    const hashes = Object.fromEntries(NAMES.map((name) => [name, process.env["V3_PRODUCTION_EXPECTED_" + name.toUpperCase() + "_CODE_HASH"]]));
    const report = await verifyV3ProductionTestnet(addresses, fetch, hashes);
    console.log(JSON.stringify(report, null, 2));
    if (!report.allActive || !report.allCodePresent || !report.codeHashesVerified) process.exitCode = 1;
  } catch (error) {
    console.error("Production V3 Testnet postflight blocked: " + error.message);
    process.exitCode = 1;
  }
}
