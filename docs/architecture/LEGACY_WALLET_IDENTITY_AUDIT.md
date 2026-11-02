# Legacy TON Wallet Identity Audit

Status: read-only migration preparation. This is not a database migration and
does not modify Supabase or production data.

## Why this step is separate

The current Edge Function authentication reads
`public.ton_verified_wallets` by `auth.users.id`. The target identity model
uses a canonical TON wallet identity independent of an anonymous Auth user.
The repository migrations do not define the complete legacy
`ton_verified_wallets` table contract, and the identity schema remains a
design draft. Therefore an automatic database backfill or auth cutover would
be unsafe at this stage.

## Audit helper

`supabase/functions/_shared/wallet-identity-migration.ts` accepts an explicit
snapshot of legacy rows and returns:

- canonical TON mainnet raw addresses using the existing `@ton/core`
  normalization function;
- one candidate per canonical address;
- deduplicated source-row count and sorted legacy user IDs;
- `ready` only when exactly one legacy user ID owns that canonical address;
- `conflict` when more than one legacy user ID maps to the same canonical
  address;
- rejected rows for missing user IDs, unsupported networks, and invalid
  addresses.

The helper is deterministic and read-only. It never chooses a winner for a
conflict and never writes identity/session mappings.

## Required pre-cutover procedure

1. Confirm the actual deployed columns, constraints, indexes, RLS policies,
   and row counts for `public.ton_verified_wallets`.
2. Export a consistent read-only snapshot containing `user_id`,
   `wallet_address`, and `network`; do not export secrets or session tokens.
3. Run the audit helper against that snapshot in a controlled Deno test/script
   environment.
4. Resolve every conflict with independent wallet-proof evidence and an
   auditable operator decision. Never merge users based only on matching text
   or a friendly/raw address representation.
5. Re-run the audit and retain the report/checksum for review.
6. Only after the target identity schema is installed and reviewed, perform a
   transactional, idempotent backfill with explicit conflict handling.
7. Keep the existing authentication path active until dual-read verification
   and rollback procedures have passed. Do not deploy an auth cutover as part
   of this audit step.

## Tests

The companion test file covers friendly/raw canonicalization, duplicate rows
for one user, cross-user conflicts, invalid rows, and deterministic ordering.
These tests must be run in the repository's Deno environment; GitHub file
creation alone does not mean the tests have passed.
