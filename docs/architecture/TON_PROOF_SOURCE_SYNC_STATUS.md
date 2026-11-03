# Production Edge Function Source Sync — 2026-11-02

## TON Proof source

The deployed source for all three TON Proof functions is now versioned in this branch:

- `supabase/functions/ton-proof-challenge/index.ts`
- `supabase/functions/ton-proof-verify/index.ts`
- `supabase/functions/ton-proof-status/index.ts`

The source was copied from the deployed Supabase functions without changing the live TON Proof functions. Preserve their current gateway JWT settings:
- challenge: `verify_jwt=false`
- verify: `verify_jwt=true`
- status: `verify_jwt=false`

The current implementation still uses anonymous Supabase Auth UUIDs as the challenge/session association. See `TON_PROOF_PRODUCTION_SOURCE_AUDIT_2026-11-02.md` before changing that identity model.

## Premium checkout fail-closed correction

The deployed `create-premium-order` endpoint was a generic greeting example rather than an order API. It has now been replaced in production with a deliberate HTTP 503 fail-closed response (`PREMIUM_CHECKOUT_NOT_IMPLEMENTED`). The endpoint keeps JWT verification enabled and accepts no order writes.

The matching source is versioned at:
`supabase/functions/create-premium-order/index.ts`

This is a safety correction, not a completed checkout implementation. The frontend purchase button must remain disabled until the real server-side order and chain-confirmation flow is implemented and tested.

## No other production actions

No TON Proof functions were redeployed. No wallet rows, challenge rows, premium orders, payments, NFT listings, or on-chain assets were modified.
