import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const files = [
  "supabase/functions/admin-verify-marketplace-v2-payment/index.ts",
  "supabase/functions/_shared/marketplace-v2-payment-verification.ts",
];
const forbidden = [
  { name: "database table access", pattern: /\.from\s*\(/i },
  { name: "database mutation methods", pattern: /\.(?:insert|upsert|update|delete)\s*\(/i },
  { name: "TON transaction broadcast", pattern: /(?:sendBoc|send_boc|sendTransaction|sendTransactionReturnHash)\s*\(/i },
  { name: "wallet signing", pattern: /(?:signer|mnemonic|seedPhrase|secretKey)\s*[:=(]/i },
  { name: "refund dispatch", pattern: /(?:dispatchRefund|sendRefund|authorizeRefund)\s*\(/i },
];

let failed = false;
for (const file of files) {
  const source = await readFile(path.join(root, file), "utf8");
  for (const rule of forbidden) {
    const pass = !rule.pattern.test(source);
    console.log(`${pass ? "PASS" : "FAIL"}: ${file} has no ${rule.name}`);
    if (!pass) failed = true;
  }
}
if (failed) process.exit(1);
console.log("Marketplace V2 payment verifier remains read-only.");
