#!/usr/bin/env node
// Read-only S07-09 seller NFT compatibility inventory; incomplete data never means zero matches.
import { Address, Cell } from "@ton/core";

const seller = process.env.V3_TESTNET_DEPLOYER_ADDRESS;
if (!seller) throw new Error("V3_TESTNET_DEPLOYER_ADDRESS required");
const approvedHashes = new Set([
  "8b711e6809672c0335dc61d1da1dcc4059c973248af707bd586245085ea70b32",
  "30dcd7d5b6fcf5968c2791e1e31ad732f2672f2986e1d6970eb03cca22d23251",
]);
async function get(path) {
  const response = await fetch("https://testnet.tonapi.io" + path, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error("TonAPI HTTP " + response.status + ": " + path);
  return response.json();
}
function decodeCode(value) {
  if (typeof value !== "string" || !value) throw new Error("NFT code not provided");
  const clean = value.trim().replace(/^0x/, "");
  // TonAPI blockchain account code is commonly a hexadecimal BOC, not base64.
  const bytes = /^[a-f0-9]+$/i.test(clean) && clean.length % 2 === 0
    ? Buffer.from(clean, "hex")
    : Buffer.from(clean, "base64");
  const roots = Cell.fromBoc(bytes);
  if (roots.length !== 1) throw new Error("Unexpected code BOC root count: " + roots.length);
  return roots[0];
}
let scanned = 0;
let inspected = 0;
let errors = 0;
let offset = 0;
const compatible = [];
for (let page = 0; page < 10; page++) {
  const response = await get("/v2/accounts/" + encodeURIComponent(seller) + "/nfts?limit=100&offset=" + offset);
  const nfts = response.nft_items;
  if (!Array.isArray(nfts)) throw new Error("TonAPI NFT listing has no nft_items");
  for (const item of nfts) {
    scanned++;
    const address = item.address;
    if (!address) { errors++; continue; }
    const reportedOwner = item.owner?.address || item.owner;
    if (typeof reportedOwner !== "string" || !Address.parse(reportedOwner).equals(Address.parse(seller))) {
      console.log("S07_09_IGNORED_NOT_SELLER_OWNED:", address);
      continue;
    }
    try {
      const account = await get("/v2/blockchain/accounts/" + encodeURIComponent(address));
      const hash = decodeCode(account.code).hash().toString("hex");
      inspected++;
      const candidate = {
        address,
        collection: item.collection?.address || null,
        code_hash: hash,
        approved: approvedHashes.has(hash),
      };
      console.log("S07_09_CANDIDATE:", JSON.stringify(candidate));
      if (candidate.approved) compatible.push(candidate);
    } catch (error) {
      errors++;
      console.error("S07_09_CANDIDATE_INSPECTION_ERROR:", JSON.stringify({ address, error: String(error) }));
    }
  }
  offset += nfts.length;
  if (nfts.length < 100) break;
  if (page === 9) errors++;
}
console.log("S07_09_SCANNED_SELLER_NFTS:", scanned);
console.log("S07_09_INSPECTED_SELLER_NFTS:", inspected);
console.log("S07_09_INSPECTION_ERRORS:", errors);
console.log("S07_09_COMPATIBLE_SELLER_NFTS:", JSON.stringify(compatible));
console.log("S07_09_COMPATIBILITY_SEARCH_COMPLETE:", errors === 0);
if (errors > 0) process.exitCode = 2;
