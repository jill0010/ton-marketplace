// Read-only V3 testnet postflight. Requires explicit deployed addresses.
// Never reads a mnemonic, sends transactions, or approves mainnet release.
import { pathToFileURL } from "node:url";

const RAW = /^(-?1|0):[0-9a-fA-F]{64}$/;
const FRIENDLY = /^[EUko]Q[A-Za-z0-9_-]{46}$/;

export function validateV3Addresses(addresses) {
  const entries = ["marketplace", "escrow", "coordinator"].map((key) => {
    const value = addresses[key];
    if (typeof value !== "string" || !(RAW.test(value) || FRIENDLY.test(value))) {
      throw new Error(`Invalid or missing ${key} address`);
    }
    return [key, value];
  });
  if (new Set(entries.map(([, value]) => value)).size !== 3) {
    throw new Error("V3 contract addresses must be distinct");
  }
  return entries;
}

export async function verifyV3Testnet(addresses, fetcher = fetch) {
  const entries = validateV3Addresses(addresses);
  const endpoint = "https://testnet.toncenter.com/api/v2/getAddressInformation";
  const results = {};
  for (const [name, address] of entries) {
    const url = new URL(endpoint);
    url.searchParams.set("address", address);
    const response = await fetcher(url.toString(), { method: "GET", redirect: "error" });
    if (!response.ok) throw new Error(`RPC HTTP error for ${name}: ${response.status}`);
    const data = await response.json();
    if (data.ok !== true || !data.result || typeof data.result !== "object") {
      throw new Error(`Invalid TON Center response for ${name}`);
    }
    const state = data.result.state;
    results[name] = { address, state, active: state === "active" };
  }
  return {
    network: "testnet",
    contracts: results,
    allActive: Object.values(results).every((item) => item.active),
    // Active code is not proof of correct code hash, bindings, funding, or security.
    codeHashesVerified: false,
    bindingsVerified: false,
    fundedTransactionVerified: false,
    mainnetReleaseApproved: false,
    noTransactionSent: true,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = await verifyV3Testnet({
      marketplace: process.env.V3_TESTNET_MARKETPLACE_ADDRESS,
      escrow: process.env.V3_TESTNET_ESCROW_ADDRESS,
      coordinator: process.env.V3_TESTNET_COORDINATOR_ADDRESS,
    });
    console.log(JSON.stringify(report, null, 2));
    if (!report.allActive) process.exitCode = 1;
  } catch (error) {
    console.error(`V3 testnet postflight blocked: ${error.message}`);
    process.exitCode = 1;
  }
}
