# Read-only Supabase schema inspection

File: `LEGACY_WALLET_SCHEMA_INSPECTION.sql`

This script is a read-only inspection aid for the next wallet-identity
migration stage. It contains SELECT statements only and does not alter schema,
data, policies, grants, or production configuration.

It inspects:
- whether `public.ton_verified_wallets` exists and its actual columns;
- constraints, indexes, RLS state, and policies;
- approximate table row counts;
- aggregate data-quality and exact-duplicate counts without returning wallet
  addresses or user IDs;
- `public.products` columns and constraints so product relationships are not
  guessed.

Important:
- Run queries 1 through 5 first.
- Run query 6 and 7 only if query 1 confirms the expected
  `user_id`, `wallet_address`, and `network` columns exist.
- If the actual names or types differ, stop and revise the inspection rather
  than altering production.
- Share only the schema/aggregate results needed for review. Do not export
  access tokens, refresh tokens, private keys, seed phrases, or full wallet
  snapshots into chat.
- This inspection does not establish wallet ownership and is not a migration.
