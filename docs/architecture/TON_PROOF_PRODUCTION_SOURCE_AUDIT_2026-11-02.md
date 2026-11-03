# TON Proof Production Source Audit — 2026-11-02

## Source capture

The currently deployed production source was read from Supabase.

- `ton-proof-challenge` source is versioned at `supabase/functions/ton-proof-challenge/index.ts`.
- `ton-proof-verify` source is versioned at `supabase/functions/ton-proof-verify/index.ts`.
- `ton-proof-status` source was inspected, but could not be committed through the GitHub write operation in this pass. Do not claim the three-function source set is fully synchronized.

No TON Proof function was redeployed or modified in production during this source-capture step.

## Observed deployed behavior

### Challenge

- Requires a valid Supabase anonymous Auth session.
- Derives the attempt identifier from the server-verified anonymous Auth user ID.
- Applies an IP-derived rate limit of 10 requests per 60 seconds.
- Creates a cryptographically random 32-byte hexadecimal payload with a five-minute expiry.
- Stores the payload and anonymous user ID in `ton_proof_challenges`.

### Verify

- Requires a valid Supabase anonymous Auth session; the function also has gateway JWT verification enabled.
- Restricts the TON network to mainnet (`-239`) and the proof domain to `ton-marketplace-cvj.pages.dev`.
- Validates the TON Connect proof timestamp, domain byte length, payload format, signature encoding, wallet StateInit-derived address, known wallet contract code, and Ed25519 signature.
- Atomically consumes the challenge through `consume_ton_proof_challenge`, binding it to the same anonymous Auth user ID.
- Stores the verified wallet address, network, wallet version, and verification time in `ton_verified_wallets`, keyed in the application flow by anonymous Auth user ID.

### Status

- Requires a valid Supabase anonymous Auth session by explicitly calling Supabase Auth.
- Queries `ton_verified_wallets` by anonymous Auth user ID, not by a canonical wallet identity.
- The deployed function has gateway JWT verification disabled and performs its own session verification.

## Architecture mismatch requiring correction

The current identity anchor is the Supabase anonymous Auth user ID, not the TON wallet address.

Consequences:
- The same wallet can potentially appear under multiple anonymous Auth users unless a database uniqueness constraint prevents it.
- A user reconnecting after losing an anonymous Auth session may appear as a different business identity.
- Orders, seller records, and wallet status that use the Auth UUID can split one wallet's activity across multiple identities.
- The current status endpoint follows the same Auth-UUID model.

This is inconsistent with the product requirement that connecting a TON wallet is sufficient to identify the marketplace user, without a separate marketplace account.

## Required safe migration

1. Preserve the current proof verification and one-time challenge protections.
2. Add a canonical wallet identity table keyed by `(network, raw_address)`.
3. After successful TON Proof verification, atomically resolve or create that wallet identity and attach the verified session to it.
4. Require independent proof of wallet ownership before merging legacy Auth UUID records that point to the same wallet.
5. Change status and business APIs to resolve the active verified wallet identity rather than trusting an Auth UUID as the marketplace identity.
6. Keep the legacy Auth UUID mapping during a dual-read period; do not delete legacy rows until reconciliation is complete.

## Deployment configuration observed

- `ton-proof-challenge`: `verify_jwt=false`; function manually verifies anonymous Auth.
- `ton-proof-verify`: `verify_jwt=true`; function also manually verifies anonymous Auth.
- `ton-proof-status`: `verify_jwt=false`; function manually verifies anonymous Auth.

Preserve these settings unless the function authentication implementation is deliberately changed and tested.

## Explicit non-claims

- This source audit does not prove that the database RPCs have the intended atomic locking semantics; their definitions still require independent review.
- It does not prove a global unique constraint exists on canonical wallet identity.
- It does not establish a complete wallet-only identity flow.
- No wallet rows, proof challenges, user sessions, orders, or financial records were changed.
