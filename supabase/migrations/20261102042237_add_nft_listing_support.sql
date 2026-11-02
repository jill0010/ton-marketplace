-- NFT listing support.
-- Local migration source only. Do not apply without explicit approval.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS nft_item_address text,
  ADD COLUMN IF NOT EXISTS nft_collection_address text,
  ADD COLUMN IF NOT EXISTS nft_owner_wallet text,
  ADD COLUMN IF NOT EXISTS nft_network text,
  ADD COLUMN IF NOT EXISTS seller_user_id uuid
    REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_nft_identity_complete_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_nft_identity_complete_check
  CHECK (
    (
      nft_item_address IS NULL
      AND nft_collection_address IS NULL
      AND nft_owner_wallet IS NULL
      AND nft_network IS NULL
      AND seller_user_id IS NULL
    )
    OR
    (
      nft_item_address IS NOT NULL
      AND nft_collection_address IS NOT NULL
      AND nft_owner_wallet IS NOT NULL
      AND nft_network = '-239'
      AND seller_user_id IS NOT NULL
    )
  );

DROP INDEX IF EXISTS public.products_one_active_nft_listing_idx;

CREATE UNIQUE INDEX products_one_active_nft_listing_idx
  ON public.products (btrim(nft_item_address))
  WHERE nft_item_address IS NOT NULL
    AND status = 'listed';
