import process from "node:process";

const apiKey = process.env.TONCENTER_API_KEY;
if (!apiKey) {
  console.error("TONCENTER_API_KEY is required for the read-only Testnet library check.");
  process.exit(1);
}

const requiredLibraries = [
  "2498bd63f3e9cc2c20c79abe58899a4816ea156855b8d4fcd47cda4bae9e911a",
  "91d9e2ac169fc785ce00de0a81af27622b9b7d1764415c775e7e50c03ce98aa2",
];

function normalizeTonHash(value) {
  const hash = String(value ?? "").trim().replace(/^0x/i, "");
  if (/^[0-9a-f]{64}$/i.test(hash)) return hash.toLowerCase();

  // TON API hash fields may be returned as standard or URL-safe Base64.
  const base64 = hash.replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]{43}=?$/.test(base64)) return null;

  const bytes = Buffer.from(base64, "base64");
  if (bytes.length !== 32) return null;
  if (bytes.toString("base64").replace(/=+$/, "") !== base64.replace(/=+$/, "")) {
    return null;
  }
  return bytes.toString("hex");
}

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
    .map((entry) => normalizeTonHash(entry?.hash))
    .filter(Boolean),
);

const missing = requiredLibraries.filter((hash) => !found.has(hash));
for (const hash of requiredLibraries) {
  console.log(`${found.has(hash) ? "FOUND" : "MISSING"} testnet library ${hash}`);
}

if (missing.length) {
  const strict = process.env.REQUIRE_TESTNET_LIBRARIES === "true";
  console.warn(
    `WARNING: ${missing.length} required Fragment Item library/libraries are missing on Testnet. ` +
    "Only Item variants that depend on a missing library are blocked; " +
    "local emulator tests register the verified library code directly. " +
    "This does not authorize or enable a Mainnet deployment.",
  );
  if (strict) {
    console.error("Current fixture readiness blocked: it requires both libraries. An available variant needs its own deployment/transfer rehearsal before use.");
    process.exit(1);
  }
} else {
  console.log("Both official Fragment Item libraries are available on TON Testnet.");
}
