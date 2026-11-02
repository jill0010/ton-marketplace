# Canonical TON Wallet Identity Rollout

## What this change establishes

The new migration creates a canonical wallet identity keyed by:

`(network, raw_address)`

For TON mainnet, the current accepted network is `-239`. A wallet identity is independent of a Supabase anonymous Auth UUID.

`private.wallet_identity_sessions` maps an anonymous Auth session UUID to the canonical wallet identity. Multiple Auth sessions can therefore resolve to the same wallet identity. A successful TON Proof can rebind the current Auth session to another wallet only after the new wallet proof is cryptographically verified.

## Atomic proof binding

The new `public.bind_verified_ton_wallet_identity` RPC performs these operations in one database transaction:

1. Validate the mainnet network, raw wallet address, wallet version, and verification timestamp.
2. Consume the one-time challenge only when its payload, attempt UUID, and expiry match.
3. Insert or resolve the unique canonical wallet identity.
4. Insert or update the Auth-session-to-wallet mapping.
5. Commit all changes together.

If identity creation or session binding fails, PostgreSQL rolls back the challenge deletion as part of the same transaction. A challenge cannot be consumed successfully while its identity binding fails.

Only `service_role` can execute the RPCs. The `private` schema and its tables are not exposed through the Data API and are not directly accessible to browser roles.

## Read path and compatibility

- TON Proof verification writes the canonical identity mapping through the atomic RPC.
- TON Proof status reads the canonical mapping first, then falls back to the legacy `public.ton_verified_wallets` record for sessions that have not completed a post-migration proof.
- Shared Edge Function authentication follows the same canonical-first, legacy-fallback strategy.
- The shared wallet context now exposes `walletIdentityId`. It is `null` only when the legacy fallback is being used.
- Existing legacy wallet rows are not deleted or rewritten by this migration.

## Remaining migration work

This does not yet complete the wallet-only marketplace identity conversion:

- Existing legacy wallet rows have not been backfilled into canonical identities.
- Business tables and order records still need their seller/buyer identity fields migrated from Auth UUIDs to wallet identity IDs.
- Legacy Auth UUID references must remain during a dual-read period.
- Any wallet merge must be backed by independently verified TON Proof, not by matching untrusted client input.
- All business Edge Functions that make ownership, seller, buyer, or settlement decisions must be reviewed before retiring legacy fields.

## Deployment sequence

1. Reconcile the production migration ledger with repository migration filenames. The current production history and branch filenames have a known mismatch; do not run a bulk migration push until reconciled.
2. Test this migration against a disposable PostgreSQL 17 / Supabase local database.
3. Inspect function ACLs and verify that `anon` and `authenticated` cannot call either RPC.
4. Deploy the database migration.
5. Deploy the updated TON Proof verify/status functions and shared auth consumers.
6. Verify a new proof creates exactly one canonical identity and session mapping.
7. Verify a second anonymous Auth session proving the same wallet maps to the same `wallet_identity_id`.
8. Verify a session proving a different wallet rebinds only that session, and a replayed challenge fails.
9. Verify old sessions still read through the legacy fallback.
10. Backfill legacy records only after a read-only conflict report and independent conflict resolution.

## Production status

The migration and Edge Function source changes are committed to the feature branch only. The canonical identity migration has **not** been applied to production, and the updated TON Proof verify/status functions have **not** been deployed. Do not enable the new code in production until the migration is installed and validated.
