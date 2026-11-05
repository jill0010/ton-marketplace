import process from "node:process";

const apiKey = process.env.TONCENTER_API_KEY;
if (!apiKey) {
  console.error("TONCENTER_API_KEY is required for the read-only Testnet library check.");
  process.exit(1);
}

// These are the library hashes embedded in the two approved exotic Fragment
// Item code cells. They are distinct from the outer code-cell hashes enforced
// by NFTEscrowV2.
const requiredLibraries = [
  "2498bd63f3e9cc2c20c79abe58899a4816ea156855b8d4fcd47cda4bae9e911a",
  "91d9e2ac169fc785ce00de0a81af27622b9b7d1764415c775e7e50c03ce98aa2",
];

const url = new URL("https://testnet.toncenter.com/api/v2/getLibraries");
for (const hash of requiredLibraries) url.searchParams.append("libraries", hash);

const response = await fetch(url, {
  headers: { "X-API-Key": apiKey },
  signal: AbortSignal.timeout(15000),
});
if (!response.ok) {
  console.error(`TON Center Testnet getLibraries failed with HTTP ${response.status}.`);
  process.exit(1);
}

const payload = await response.json();
if (payload?.ok !== true || !Array.isArray(payload?.result?.result)) {
  console.error("TON Center returned an unexpected getLibraries response.");
  process.exit(1);
}

const found = new Set(
  payload.result.result
    .map((entry) => String(entry?.hash ?? "").replace(/^0x/i, "").toLowerCase())
    .filter((hash) => /^[0-9a-f]{64}$/.test(hash)),
);

const missing = requiredLibraries.filter((hash) => !found.has(hash));
for (const hash of requiredLibraries) {
  console.log(`${found.has(hash) ? "FOUND" : "MISSING"} testnet library ${hash}`);
}

if (missing.length) {
  console.error("Official Fragment Item code cannot be safely deployed until every referenced library is available on Testnet.");
  process.exit(1);
}

console.log("Both official Fragment Item libraries are available on TON Testnet (read-only check).");
