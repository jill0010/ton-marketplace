import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const verifier = readFileSync("supabase/functions/verify-manual-product-payment/index.ts", "utf8");
const creator = readFileSync("supabase/functions/create-manual-product-order/index.ts", "utf8");
const migration = readFileSync("supabase/migrations/20261109010000_expire_unpaid_manual_product_orders.sql", "utf8");

assert.ok(verifier.includes("if (!scanIntegrityValid || !scanReachedOrderStart)"), "complete history coverage must gate confirmation");
assert.ok(verifier.includes('code: "PAYMENT_EVIDENCE_MISSING"'), "missing evidence must block paid response");
assert.ok(verifier.includes("[1-8][0-9a-f]{3}"), "order IDs must use strict UUID validation");
assert.match(verifier, /PAYMENT_HISTORY_INCOMPLETE/);
assert.match(verifier, /ORDER_EXPIRED_REVIEW_REQUIRED/);
assert.match(verifier, /scanReachedOrderStart/);
assert.match(verifier, /scanIntegrityValid/);
assert.match(verifier, /PAYMENT_STATE_CONFLICT/);
assert.match(verifier, /confirmationError\?\.code === "23505"/);
assert.match(verifier, /PAYMENT_ALREADY_CLAIMED/);
assert.match(verifier, /PAYMENT_EVIDENCE_MISSING/);
assert.match(verifier, /INVALID_PAYMENT_WINDOW/);
assert.match(verifier, /utime > previousUtime/);
assert.match(verifier, /seenTransactionIds\.has\(uniqueId\)/);
assert.match(verifier, /previousPageOldestUtime/);
assert.match(verifier, /if \(!scanIntegrityValid \|\| !scanReachedOrderStart\) \{/);
assert.match(verifier, /Number\(rows\[0\]\.utime\) > previousPageOldestUtime/);
assert.match(verifier, /hashHex\(transactionId\?\.hash\)/);
assert.match(verifier, /Number\.isSafeInteger\(utime\)/);
assert.match(verifier, /expiresAt <= createdAt/);
assert.match(verifier, /confirm_manual_product_payment_verified/);
assert.doesNotMatch(verifier, /\.update\(\{\s*status:\s*["']cancelled["']/);
assert.doesNotMatch(creator, /admin\.rpc\(["']expire_unpaid_manual_product_orders["']/);
assert.match(migration, /Automatic expiry disabled pending verified on-chain payment reconciliation/);
assert.doesNotMatch(migration, /UPDATE\s+public\.manual_product_orders\s+AS\s+o/i);
const atomic = readFileSync("supabase/migrations/20261109020000_confirm_manual_product_payment_atomically.sql", "utf8");
assert.match(atomic, /SECURITY INVOKER/);
assert.match(atomic, /WHERE id = p_order_id AND buyer_user_id = p_buyer_user_id/);
assert.match(atomic, /RETURN 'ALREADY_CONFIRMED'/);
assert.match(atomic, /RETURN 'PAYMENT_STATE_CONFLICT'/);
assert.match(atomic, /RETURN 'PAYMENT_ALREADY_CLAIMED'/);
assert.ok(atomic.includes("UPDATE public.manual_product_orders"), "atomic RPC must update order state");
assert.ok(atomic.includes("INSERT INTO public.manual_product_order_logs"), "atomic RPC must append audit log");
assert.match(atomic, /GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/);
assert.match(atomic, /REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated/);
assert.match(atomic, /FOR UPDATE/);
// The unique index is the final cross-order concurrency guard; a preflight
// check is also required before running the staging-only concurrency protocol.
const concurrencyPlan = readFileSync("docs/operations/S06-P002-06-CONCURRENCY-TEST-PLAN.md", "utf8");
assert.match(concurrencyPlan, /disposable Supabase staging project/);
assert.match(concurrencyPlan, /UNIQUE constraint\/index/);
assert.match(concurrencyPlan, /23505/);
assert.match(concurrencyPlan, /ALREADY_CONFIRMED/);
assert.match(concurrencyPlan, /audit insert failure/);


// Wallet-to-order binding and proof-expiry invariants.
const walletAuth = readFileSync("supabase/functions/verify-manual-product-payment/shared/auth.ts", "utf8");
assert.match(walletAuth, /user\.is_anonymous !== true/, "require authenticated anonymous wallet session");
assert.match(walletAuth, /get_current_ton_wallet_identity/, "canonical wallet identity must be resolved");
assert.match(walletAuth, /timestamp <= now/, "expired TON proof must be rejected");
assert.match(walletAuth, /requireActiveWalletProof\(identity\.proof_expires_at\)/, "canonical proof expiry must be enforced");
assert.match(walletAuth, /identity\.network !== "-239"/, "canonical identity must be mainnet bound");
assert.match(walletAuth, /\.eq\("user_id", user\.id\)/, "legacy wallet must bind to authenticated user");
assert.match(walletAuth, /\.eq\("network", "-239"\)/, "legacy wallet must be mainnet bound");
assert.match(verifier, /\.eq\("buyer_user_id", wallet\.userId\)/, "order lookup must bind buyer identity");
assert.match(verifier, /\.eq\("buyer_wallet_raw", wallet\.walletAddress\)/, "order lookup must bind wallet address");
assert.match(verifier, /\.eq\("id", orderId\)/, "order lookup must bind exact order ID");
assert.match(verifier, /source !== senderRaw/, "on-chain transfer sender must match wallet");
assert.match(verifier, /destination !== receiverRaw/, "on-chain transfer receiver must match order snapshot");
assert.match(verifier, /memo !== order\.order_no/, "on-chain memo must match unique order number");

console.log("Manual payment fail-closed, wallet binding and atomic audit source invariants passed.");
