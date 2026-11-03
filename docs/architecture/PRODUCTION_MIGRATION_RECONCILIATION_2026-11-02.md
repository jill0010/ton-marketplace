# Production Supabase Migration Reconciliation — 2026-11-02

## Read-only findings

The live Supabase migration ledger contains exactly:

| Version | Name |
|---|---|
| `20261102084524` | `add_telegram_nft_collection_allowlist` |
| `20261102132949` | `restrict_premium_admin_function_execution` |

The branch previously contained the allowlist migration under timestamp `20261102043306`. The live database already had the corresponding table. A read-only comparison confirmed matching columns, checks, unique key, RLS enabled, no browser-role table privileges, and full service-role table privileges.

The repository migration was therefore renamed to:
`supabase/migrations/20261102084524_add_telegram_nft_collection_allowlist.sql`

This aligns the source filename with the already-recorded live migration version and avoids proposing the same migration a second time.

## Obsolete listing migration removed

The old `20261102042237_add_nft_listing_support.sql` was not in the live migration ledger, and the live `public.products` table did not have its proposed NFT fields. That migration added `seller_user_id REFERENCES auth.users(id)`, which conflicts with the wallet-as-marketplace-identity model and did not implement escrow custody.

It was removed from the deployable migrations directory. See `DEPRECATED_AUTH_UUID_NFT_LISTING_MIGRATION.md`.

## Canonical wallet identity migration

The new migration is:
`supabase/migrations/20261102140000_add_canonical_ton_wallet_identity.sql`

It is additive and has not been applied to production. It must first pass the PostgreSQL 17 disposable-database integration tests in CI. Only then should it be applied as a single migration after verifying the live ledger still matches the two versions above.

## Safety rules

- Do not run `supabase db push` while migration history differs from the checked live ledger.
- Do not manually insert or delete rows in `supabase_migrations.schema_migrations` merely to silence a mismatch.
- Do not apply the removed Auth-UUID listing migration.
- Do not deploy the updated TON Proof verify/status functions until the canonical identity migration is successfully installed and its RPC ACLs are verified.
- Keep all legacy wallet rows and the old read fallback during the dual-read period.

No production schema, migration ledger, wallet record, product, order, payment, or on-chain asset was changed during this reconciliation.
