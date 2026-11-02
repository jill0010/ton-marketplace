# Legacy wallet identity audit runner

This script reads a manually exported JSON snapshot and prints a deterministic,
read-only audit report. It does not connect to Supabase, write to a database,
or modify the input file.

## Snapshot format

Export only the following columns from the legacy wallet table:

```json
[
  {
    "user_id": "legacy-auth-user-uuid",
    "wallet_address": "TON friendly or raw address",
    "network": "-239"
  }
]
```

Do not include access tokens, refresh tokens, private keys, seed phrases, or
other secrets.

## Run locally

From the repository root, with Deno 2 and dependencies available:

```powershell
deno run --allow-read scripts/audit-legacy-wallet-identities.ts .\legacy-wallet-snapshot.json
```

Exit codes:
- `0`: no conflicts or rejected rows were found by this audit.
- `1`: invalid invocation or unreadable/invalid JSON input.
- `2`: one or more cross-user conflicts or rejected rows exist.

A zero exit code is not authorization to run a database migration. It only
means this snapshot passed these structural checks. Wallet ownership must
still be confirmed using trusted wallet-proof evidence, and the target schema,
constraints, RLS, backup, and rollback plan must be reviewed separately.

The report contains wallet addresses and legacy user IDs. Treat it as
sensitive operational data and store/share it accordingly.
