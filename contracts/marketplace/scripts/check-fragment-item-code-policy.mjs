import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const approvedHashes = [
  "8b711e6809672c0335dc61d1da1dcc4059c973248af707bd586245085ea70b32",
  "30dcd7d5b6fcf5968c2791e1e31ad732f2672f2986e1d6970eb03cca22d23251",
];

const files = {
  escrowV1: "contracts/NFTEscrow.tolk",
  escrowV2: "contracts/NFTEscrowV2.tolk",
  edgeFunction: "../../supabase/functions/publish-nft-product/index.ts",
  addressTests: "tests/gift-nft-address.test.tolk",
};

const sources = {};
for (const [key, relativePath] of Object.entries(files)) {
  const fullPath = path.resolve(root, relativePath);
  try {
    sources[key] = await readFile(fullPath, "utf8");
  } catch (error) {
    console.error(`Unable to read ${relativePath}: ${error.message}`);
    process.exit(1);
  }
}

function assertContainsBoth(label, source, hashes) {
  const normalized = source.toLowerCase();
  const missing = hashes.filter((hash) => !normalized.includes(hash));
  if (missing.length) {
    console.error(`${label} is missing approved Fragment Item code hash(es): ${missing.join(", ")}`);
    process.exitCode = 1;
  }
}

assertContainsBoth("V1 Escrow policy", sources.escrowV1, approvedHashes);
assertContainsBoth("V2 Escrow policy", sources.escrowV2, approvedHashes);
assertContainsBoth("NFT publishing Edge Function policy", sources.edgeFunction, approvedHashes);
assertContainsBoth("NFT address regression tests", sources.addressTests, approvedHashes);

const compactAddressTests = sources.addressTests.replace(/\\s+/g, "");
for (const hash of approvedHashes) {
  const assertion = `expect(code.hash()).toEqual(0x${hash})`.toLowerCase();
  if (!compactAddressTests.toLowerCase().includes(assertion)) {
    console.error(`NFT address tests do not assert the calculated code hash ${hash}`);
    process.exitCode = 1;
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Fragment Item code policy check passed: both approved hashes match V1, V2, publishing validation, and address regression tests.");
