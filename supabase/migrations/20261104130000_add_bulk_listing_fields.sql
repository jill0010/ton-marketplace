ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS listing_kind text NOT NULL DEFAULT 'fixed_price',
  ADD COLUMN IF NOT EXISTS auction_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS minimum_bid numeric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_listing_kind_check'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_listing_kind_check
      CHECK (listing_kind IN ('fixed_price', 'auction')) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.products VALIDATE CONSTRAINT products_listing_kind_check;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_auction_fields_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_auction_fields_check
  CHECK (
    (listing_kind = 'fixed_price' AND auction_ends_at IS NULL AND minimum_bid IS NULL)
    OR
    (listing_kind = 'auction' AND auction_ends_at IS NOT NULL AND minimum_bid IS NOT NULL AND minimum_bid > 0)
  ) NOT VALID;
ALTER TABLE public.products VALIDATE CONSTRAINT products_auction_fields_check;

CREATE INDEX IF NOT EXISTS products_listing_kind_status_idx
  ON public.products (listing_kind, status, created_at DESC);
