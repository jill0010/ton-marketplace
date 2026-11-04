ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS seller_wallet_raw text,
  ADD COLUMN IF NOT EXISTS nft_item_address text,
  ADD COLUMN IF NOT EXISTS collection_address text,
  ADD COLUMN IF NOT EXISTS item_index numeric(78, 0),
  ADD COLUMN IF NOT EXISTS marketplace_contract_address text,
  ADD COLUMN IF NOT EXISTS marketplace_product_id numeric(20, 0),
  ADD COLUMN IF NOT EXISTS marketplace_query_id numeric(20, 0),
  ADD COLUMN IF NOT EXISTS escrow_id numeric(20, 0),
  ADD COLUMN IF NOT EXISTS chain_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS chain_verified_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS products_nft_item_address_unique
  ON public.products (nft_item_address)
  WHERE nft_item_address IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS products_marketplace_v2_product_unique
  ON public.products (marketplace_contract_address, marketplace_product_id)
  WHERE marketplace_contract_address IS NOT NULL
    AND marketplace_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_chain_status_idx
  ON public.products (chain_status);
