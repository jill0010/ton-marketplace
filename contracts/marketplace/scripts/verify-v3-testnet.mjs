// Read-only V3 testnet postflight. Requires explicit deployed addresses.
// Never reads a mnemonic, sends transactions, or approves mainnet release.
import { pathToFileURL } from "node:url";
import { Cell } from "@ton/core";

const RAW = /^(-?1|0):[0-9a-fA-F]{64}$/;
const FRIENDLY = /^[A-Za-z0-9_-]{48}$/;

// TON friendly addresses carry a CRC16-XMODEM checksum and network flag.
// Normalize to raw workchain:hash to detect aliases and reject mainnet-only inputs.
export function normalizeV3TestnetAddress(address) {
  if (typeof address !== "string") throw new Error("Invalid TON address");
  if (RAW.test(address)) {
    const [workchain, hash] = address.split(":");
    return `${Number(workchain)}:${hash.toLowerCase()}`;
  }
  if (!FRIENDLY.test(address)) throw new Error("Invalid TON address");
  const bytes = Buffer.from(address, "base64url");
  if (bytes.length !== 36) throw new Error("Invalid TON friendly address length");
  let crc = 0;
  for (const byte of bytes.subarray(0, 34)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  if (bytes[34] !== (crc >> 8) || bytes[35] !== (crc & 255)) {
    throw new Error("Invalid TON address checksum");
  }
  if ((bytes[0] & 0x80) === 0) throw new Error("Expected testnet-only TON address");
  if ((bytes[0] & 0x7f) !== 0x11 && (bytes[0] & 0x7f) !== 0x51) {
    throw new Error("Invalid TON address tag");
  }
  const wc = bytes[1] === 255 ? -1 : bytes[1];
  if (wc !== 0 && wc !== -1) throw new Error("Unsupported TON workchain");
  return `${wc}:${bytes.subarray(2, 34).toString("hex")}`;
}

export function validateV3Addresses(addresses) {
  const entries = ["marketplace", "escrow", "coordinator"].map((key) => {
    const value = addresses[key];
    if (typeof value !== "string") {
      throw new Error(`Invalid or missing ${key} address`);
    }
    return [key, normalizeV3TestnetAddress(value)];
  });
  if (new Set(entries.map(([, value]) => value)).size !== 3) {
    throw new Error("V3 contract addresses must be distinct");
  }
  return entries;
}

// TON Center returns serialized contract code as a base64 BOC.
// Reject missing, malformed and empty-cell payloads instead of accepting arbitrary text.
export function parseV3ContractCode(code) {
  if (typeof code !== "string" || code.length < 12 || code.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(code)) return null;
  const bytes = Buffer.from(code, "base64");
  if (bytes.toString("base64") !== code) return null;
  try {
    const roots = Cell.fromBoc(bytes);
    if (roots.length !== 1 || (roots[0].bits.length === 0 && roots[0].refs.length === 0)) return null;
    return { codeHash: roots[0].hash().toString("hex") };
  } catch {
    return null;
  }
}

export function hasPlausibleContractCode(code) {
  return parseV3ContractCode(code) !== null;
}

export function compareV3CodeHashes(contracts, expectedHashes) {
  const names = ["marketplace", "escrow", "coordinator"];
  if (!expectedHashes || names.some((name) =>
    typeof expectedHashes[name] !== "string" ||
    !/^[0-9a-fA-F]{64}$/.test(expectedHashes[name])
  )) return { verified: false, matches: null, reason: "EXPECTED_HASHES_MISSING_OR_INVALID" };
  const matches = Object.fromEntries(names.map((name) => [
    name, contracts[name]?.codeHash === expectedHashes[name].toLowerCase(),
  ]));
  return {
    verified: Object.values(matches).every(Boolean),
    matches,
    reason: Object.values(matches).every(Boolean) ? null : "ONCHAIN_CODE_HASH_MISMATCH",
  };
}

export async function verifyV3Testnet(addresses, fetcher = fetch, expectedHashes = null) {
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
    // Active account alone is insufficient: require a nonempty on-chain code BOC.
    const code = data.result.code;
    const parsedCode = parseV3ContractCode(code);
    const codePresent = parsedCode !== null;
    results[name] = { address, state, active: state === "active", codePresent, codeHash: parsedCode?.codeHash ?? null };
  }
  const codeHashComparison = compareV3CodeHashes(results, expectedHashes);
  return {
    network: "testnet",
    contracts: results,
    allActive: Object.values(results).every((item) => item.active),
    allCodePresent: Object.values(results).every((item) => item.codePresent),
    // Active code is not proof of correct code hash, bindings, funding, or security.
    codeHashesVerified: codeHashComparison.verified,
    codeHashComparison,
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
    }, fetch, {
      marketplace: process.env.V3_EXPECTED_MARKETPLACE_CODE_HASH,
      escrow: process.env.V3_EXPECTED_ESCROW_CODE_HASH,
      coordinator: process.env.V3_EXPECTED_COORDINATOR_CODE_HASH,
    });
    console.log(JSON.stringify(report, null, 2));
    if (!report.allActive || !report.allCodePresent) process.exitCode = 1;
  } catch (error) {
    console.error(`V3 testnet postflight blocked: ${error.message}`);
    process.exitCode = 1;
  }
}
