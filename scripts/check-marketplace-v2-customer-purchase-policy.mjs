import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const productPage = await readFile(
  path.join(root, "src/pages/ProductPage.tsx"),
  "utf8",
);
const stateFunction = await readFile(
  path.join(root, "supabase/functions/marketplace-v2-state/index.ts"),
  "utf8",
);

const checks = [
  {
    name: "escrow checkout remains visibly disabled",
    pass: /Escrow checkout \(Coming Soon\)/.test(productPage),
  },
  {
    name: "escrow checkout explains deployment and verification gate",
    pass: /主网合约完成部署及验证前/.test(productPage),
  },
  {
    name: "manual checkout remains restricted to manual-delivery products",
    pass: /product\.deliveryMode === "manual"\s*\?/.test(productPage),
  },
  {
    name: "read-only marketplace state endpoint has no purchase action",
    pass: !/body\.action\s*===\s*["']buy-product["']/.test(stateFunction),
  },
  {
    name: "frontend product page does not dispatch V2 purchase transactions",
    pass: !/buildBuyProductV2Payload|MARKETPLACE_V2_PURCHASE_ENABLED/.test(productPage),
  },
];

let failed = false;
for (const check of checks) {
  console.log(`${check.pass ? "PASS" : "FAIL"}: ${check.name}`);
  if (!check.pass) failed = true;
}
if (failed) process.exit(1);
console.log("Marketplace V2 customer purchase safety policy passed.");
