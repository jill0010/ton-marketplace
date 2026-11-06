import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const adminApi = await readFile(
  path.join(root, "supabase/functions/admin-marketplace-orders/index.ts"),
  "utf8",
);
const customerApi = await readFile(
  path.join(root, "supabase/functions/marketplace-order-history/index.ts"),
  "utf8",
);
const adminPage = await readFile(
  path.join(root, "src/pages/MarketplaceEscrowAdminPage.tsx"),
  "utf8",
);

const checks = [
  {
    name: "admin orders explicitly identify database mirror as the data source",
    pass: /dataSource:\s*"database_mirror"/.test(adminApi),
  },
  {
    name: "admin orders do not claim the database mirror is chain-authoritative",
    pass: /chainIsAuthoritative:\s*false/.test(adminApi) &&
      !/chainIsAuthoritative:\s*true/.test(adminApi),
  },
  {
    name: "customer order history explicitly identifies database mirror as the data source",
    pass: /dataSource:\s*"database_mirror"/.test(customerApi),
  },
  {
    name: "customer order history does not claim the database mirror is chain-authoritative",
    pass: /chainIsAuthoritative:\s*false/.test(customerApi) &&
      !/chainIsAuthoritative:\s*true/.test(customerApi),
  },
  {
    name: "admin UI discloses that displayed order records are not yet continuously chain-verified",
    pass: /尚未由完整的链上索引器持续核验/.test(adminPage),
  },
];

let failed = false;
for (const check of checks) {
  console.log(`${check.pass ? "PASS" : "FAIL"}: ${check.name}`);
  if (!check.pass) failed = true;
}
if (failed) process.exit(1);
console.log("Marketplace V2 database-mirror truthfulness policy passed.");
