ALTER TABLE public.marketplace_orders
  ADD COLUMN IF NOT EXISTS seller_nft_return_status text NOT NULL DEFAULT 'not_started'
  CHECK (seller_nft_return_status IN (
    'not_started','pending','confirmed','bounced','manual_review'
  ));

COMMENT ON COLUMN public.marketplace_orders.seller_nft_return_status IS
  'Independent seller NFT return state; it must not block or erase the buyer refund liability.';
