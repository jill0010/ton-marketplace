-- Telegram official NFT collection allowlist.
-- Production migration source; version reconciled to the live Supabase migration ledger.

CREATE TABLE IF NOT EXISTS public.telegram_nft_collection_allowlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  asset_type text NOT NULL
    CHECK (asset_type IN ('username', 'phone_number', 'gift')),

  network text NOT NULL DEFAULT '-239'
    CHECK (network = '-239'),

  -- Store TON canonical raw address, not friendly address.
  collection_address text NOT NULL
    CHECK (collection_address ~ '^-?[0-9]+:[0-9a-f]{64}$'),

  official_source_url text NOT NULL
    CHECK (official_source_url ~ '^https://'),

  verification_notes text NOT NULL DEFAULT '',

  enabled boolean NOT NULL DEFAULT false,

  verified_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT telegram_nft_collection_unique
    UNIQUE (network, collection_address),

  CONSTRAINT telegram_nft_collection_enable_check
    CHECK (enabled = false OR verified_at IS NOT NULL)
);

COMMENT ON TABLE public.telegram_nft_collection_allowlist IS
  'Server-only allowlist of verified official Telegram NFT collections on TON mainnet.';

ALTER TABLE public.telegram_nft_collection_allowlist
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.telegram_nft_collection_allowlist
  FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.telegram_nft_collection_allowlist
  TO service_role;
