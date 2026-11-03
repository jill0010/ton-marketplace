# Deprecated NFT Listing Migration — 2026-11-02

The old migration `20261102042237_add_nft_listing_support.sql` was removed from the deployable Supabase migrations directory.

## Why it was removed

The migration was not recorded in the production Supabase migration ledger, and production `public.products` does not contain its proposed NFT listing columns.

Its proposed `seller_user_id` foreign key points to `auth.users(id)`. That is incompatible with the marketplace's agreed identity model: a connected TON wallet is the marketplace identity, and multiple anonymous Auth sessions can represent the same wallet.

The migration also only added listing metadata. It did not implement NFT escrow custody, on-chain deposit confirmation, atomic purchase, buyer delivery, or seller settlement. Applying it would therefore create an incomplete schema that could be mistaken for a safe NFT listing foundation.

## Replacement direction

Do not restore or apply this migration.

The eventual NFT listing schema must reference canonical wallet identities and include a verified escrow lifecycle. An NFT is not listable until the marketplace escrow contract has received the NFT and the chain event has been independently verified.

The current `publish-nft-product` Edge Function intentionally fails closed until that lifecycle exists.

## Production state checked

A read-only inspection on 2026-11-02 confirmed that `public.products` does not contain:
- `nft_item_address`
- `nft_collection_address`
- `nft_owner_wallet`
- `nft_network`
- `seller_user_id`

No production table or row was changed while removing this obsolete repository migration.
