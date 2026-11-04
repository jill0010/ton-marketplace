-- Enable the verified official Telegram username and +888 number collections
-- for read-only wallet asset discovery. NFT listing remains fail-closed until
-- Marketplace V2 is deployed and the escrow independently validates Item Code
-- hashes and the collection allowlist on-chain.
INSERT INTO public.telegram_nft_collection_allowlist (
  asset_type,
  network,
  collection_address,
  official_source_url,
  verification_notes,
  enabled,
  verified_at,
  updated_at
)
VALUES (
  'username',
  '-239',
  '0:80d78a35f955a14b679faa887ff4cd5bfc0f43b4a4eea2a7e6927f3701b273c2',
  'https://core.telegram.org/api/fragment',
  'Mainnet Telegram Usernames collection. The official Telegram Fragment API documents collectible usernames; the collection address and nft_collection metadata were cross-checked against TON explorer and TON ecosystem collection references. Item-level metadata and ownership are still checked at wallet lookup; on-chain escrow must independently verify the official Item code hash before any listing is enabled.',
  true,
  now(),
  now()
)
ON CONFLICT (network, collection_address)
DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  official_source_url = EXCLUDED.official_source_url,
  verification_notes = EXCLUDED.verification_notes,
  enabled = true,
  verified_at = now(),
  updated_at = now();

UPDATE public.telegram_nft_collection_allowlist
SET enabled = true, updated_at = now()
WHERE network = '-239'
  AND asset_type = 'phone_number'
  AND collection_address = '0:0e41dc1dc3c9067ed24248580e12b3359818d83dee0304fabcf80845eafafdb2';
