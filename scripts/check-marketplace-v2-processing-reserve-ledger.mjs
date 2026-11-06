import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20261106024206_add_marketplace_processing_reserve_ledger.sql",
  "utf8",
);
const preview = readFileSync(
  "supabase/functions/admin-preview-marketplace-processing-reserve/index.ts",
  "utf8",
);
const original = readFileSync(
  "supabase/migrations/20261103154323_add_ton_marketplace_purchase_settlement_ledger.sql",
  "utf8",
);

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

requireMatch(migration, /ADD COLUMN IF NOT EXISTS processing_reserve_nano/i,
  "Reserve amount must be added to the existing order mirror");
requireMatch(migration, /CREATE TABLE IF NOT EXISTS public\.marketplace_processing_reserves/i,
  "Per-order processing reserve ledger table is missing");
requireMatch(migration, /order_id uuid NOT NULL UNIQUE[\s\S]*?REFERENCES public\.marketplace_orders/i,
  "Each reserve liability must map to exactly one marketplace order");
requireMatch(migration, /payment_tx_hash text NOT NULL/i,
  "Reserve ledger must bind the buyer payment transaction");
requireMatch(migration, /buyer_wallet_raw text NOT NULL/i,
  "Reserve ledger must bind the buyer wallet");
requireMatch(migration, /REVOKE ALL ON TABLE public\.marketplace_processing_reserves FROM anon, authenticated/i,
  "Reserve ledger must not be accessible to public or authenticated clients");
requireMatch(migration, /GRANT SELECT, INSERT, UPDATE ON TABLE public\.marketplace_processing_reserves TO service_role/i,
  "Only the server service role may maintain the reserve ledger");
requireMatch(preview, /from\("marketplace_processing_reserves"\)/,
  "Fee preview must read the per-order reserve ledger");
requireMatch(preview, /String\(order\.chain_order_id\) !== String\(reserve\.chain_order_id\)/,
  "Fee preview must verify chain order identity");
requireMatch(preview, /order\.payment_tx_hash\?\.toLowerCase\(\) !== reserve\.payment_tx_hash\?\.toLowerCase\(\)/,
  "Fee preview must verify payment transaction identity");
requireMatch(original, /CREATE TABLE IF NOT EXISTS public\.marketplace_orders/i,
  "Original order ledger migration unexpectedly unavailable");

if (/\b(DROP\s+TABLE|TRUNCATE\s+TABLE|DELETE\s+FROM)\b/i.test(migration)) {
  throw new Error("Reserve ledger migration must be additive and preserve existing records");
}

console.log("Marketplace V2 per-order processing reserve ledger checks passed.");
