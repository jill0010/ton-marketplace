# Production Drift and Security Audit — 2026-11-02

## Scope

Read-only inspection of the Supabase project linked to this repository, followed by one narrowly scoped privilege correction. No wallet addresses, user IDs, API keys, or transaction data are included in this report.

Project reference: `qmvvlkierfiogituccbo`  
Database: PostgreSQL 17  
Repository branch inspected: `architecture/unified-trading-v1`

## Confirmed production state

- `public.ton_verified_wallets` contains 2 rows for 2 distinct Auth users and 2 distinct wallet strings on TON mainnet (`-239`). No exact duplicate (network, wallet string) keys, null user IDs, or blank wallet strings were found.
- Production contains `products`, premium order/payment/delivery/log tables, TON Proof challenge/rate-limit tables, and `telegram_nft_collection_allowlist`.
- Production has active Edge Functions: `gram-price`, `create-premium-order`, `ton-proof-challenge`, `ton-proof-verify`, `ton-proof-status`, and `nft-wallet-assets`.
- TON Proof Edge Function source is deployed in production but the corresponding three function directories are absent from the inspected GitHub branch. The deployed functions still bind verified wallets to Supabase anonymous Auth user IDs.
- The production `create-premium-order` Edge Function source is a generic greeting example, not an order-creation implementation. Do not treat premium checkout as production-ready until this endpoint is implemented and verified against the actual page flow.
- The repository migration `20261102043306_add_telegram_nft_collection_allowlist.sql` does not match the production migration history version observed for the allowlist (`20261102084524`). Reconcile migration history before running a bulk migration push.
- The production schema currently has no unified wallet-identity, marketplace-order, settlement, or ledger tables from the architecture draft. The draft remains unapplied.

## Privilege correction applied

The security advisor identified `public.is_premium_admin()` as a SECURITY DEFINER function executable by `anon` and `authenticated`.

The function is used by existing RLS policies on premium order/payment/delivery tables, so revoking authenticated execution would break those policies. The applied correction was deliberately narrow:

- Revoke EXECUTE from `PUBLIC` and `anon`.
- Preserve EXECUTE for `authenticated` and `service_role`.

Post-change verification confirmed the effective execute grantees are `authenticated`, `postgres`, and `service_role`; `anon` and `PUBLIC` are no longer grantees.

The matching migration is tracked in this branch as:
`supabase/migrations/20261102132949_restrict_premium_admin_function_execution.sql`

## Remaining security findings

- Four tables have RLS enabled with no policies: `telegram_nft_collection_allowlist`, `ton_proof_challenges`, `ton_proof_rate_limits`, and `ton_verified_wallets`. This is consistent with their current server-only usage, but must remain paired with explicit denial of browser-role table privileges and service-role-only access.
- The advisor still reports authenticated execution of `is_premium_admin()`. This is intentional for current RLS policy evaluation; do not remove that grant without first replacing the policy predicate.
- Existing anonymous-access warnings on premium/product/storage policies and the Auth leaked-password protection warning remain outside the scope of this change.

## Safe next implementation sequence

1. Bring the deployed TON Proof source into version control and compare it byte-for-byte with the intended repository implementation before changing it.
2. Reconcile production migration history with repository migration filenames.
3. Replace the deployed premium-order placeholder only after mapping the current PremiumPage payment flow, pricing schema, payment address configuration, and chain-confirmation requirements.
4. Install the unified wallet identity schema as a reviewed migration, then backfill the two legacy wallet rows using canonical TON raw addresses and independent proof/conflict checks.
5. Integrate atomic nanotons amounts and escrow lifecycle only after the on-chain contract interface, event format, and finality rules are verified.

## Explicit non-claims

This audit does not establish that a premium payment flow works, that an NFT escrow contract is deployed, that any payment or NFT transfer has occurred, or that the marketplace is ready for real funds. No production wallet data was changed, and no contract was deployed.
