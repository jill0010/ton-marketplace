ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS chain_product_id numeric(20,0)
    CHECK (chain_product_id IS NULL OR chain_product_id > 0),
  ADD COLUMN IF NOT EXISTS chain_escrow_id numeric(20,0)
    CHECK (chain_escrow_id IS NULL OR chain_escrow_id > 0),
  ADD COLUMN IF NOT EXISTS chain_marketplace_address text
    CHECK (chain_marketplace_address IS NULL OR chain_marketplace_address ~ '^-?[0-9]+:[0-9a-f]{64}$'),
  ADD COLUMN IF NOT EXISTS chain_escrow_address text
    CHECK (chain_escrow_address IS NULL OR chain_escrow_address ~ '^-?[0-9]+:[0-9a-f]{64}$'),
  ADD COLUMN IF NOT EXISTS chain_status text NOT NULL DEFAULT 'offchain'
    CHECK (chain_status IN ('offchain','escrow_pending','escrowed','sold','delisted','manual_review')),
  ADD COLUMN IF NOT EXISTS chain_listed_at timestamptz,
  ADD COLUMN IF NOT EXISTS chain_verified_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS products_chain_product_id_unique_idx
  ON public.products (chain_product_id)
  WHERE chain_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_chain_status_idx
  ON public.products (chain_status, status);

COMMENT ON COLUMN public.products.chain_status IS
  'Only escrowed on-chain listings may enter the MarketplaceV2 purchase flow; off-chain admin products are never purchasable.';
