import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const verifier = readFileSync("supabase/functions/verify-manual-product-payment/index.ts", "utf8");
const creator = readFileSync("supabase/functions/create-manual-product-order/index.ts", "utf8");
const migration = readFileSync("supabase/migrations/20261109010000_expire_unpaid_manual_product_orders.sql", "utf8");

assert.match(verifier, /PAYMENT_HISTORY_INCOMPLETE/);
assert.match(verifier, /ORDER_EXPIRED_REVIEW_REQUIRED/);
assert.match(verifier, /scanReachedOrderStart/);
assert.match(verifier, /scanIntegrityValid/);
assert.match(verifier, /PAYMENT_STATE_CONFLICT/);
assert.match(verifier, /current\.payment_tx_hash !== match\.hash/);
assert.doesNotMatch(verifier, /\.update\(\{\s*status:\s*["']cancelled["']/);
assert.doesNotMatch(creator, /admin\.rpc\(["']expire_unpaid_manual_product_orders["']/);
assert.match(migration, /Automatic expiry disabled pending verified on-chain payment reconciliation/);
assert.doesNotMatch(migration, /UPDATE\s+public\.manual_product_orders\s+AS\s+o/i);
console.log("Manual payment fail-closed source invariants passed.");
