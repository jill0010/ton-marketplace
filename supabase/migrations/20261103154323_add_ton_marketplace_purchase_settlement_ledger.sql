-- Durable, server-only projection for the TON Marketplace V2 purchase lifecycle.
-- Chain transactions remain authoritative; this schema never authorizes a transfer.
CREATE TABLE IF NOT EXISTS public.marketplace_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_order_id numeric(20,0) NOT NULL UNIQUE CHECK (chain_order_id > 0),
  product_id numeric(20,0) NOT NULL CHECK (product_id > 0),
  escrow_id numeric(20,0) NOT NULL CHECK (escrow_id > 0),
  buyer_wallet_raw text NOT NULL CHECK (buyer_wallet_raw ~ '^-?[0-9]+:[0-9a-f]{64}$'),
  seller_wallet_raw text NOT NULL CHECK (seller_wallet_raw ~ '^-?[0-9]+:[0-9a-f]{64}$'),
  treasury_wallet_raw text NOT NULL CHECK (treasury_wallet_raw ~ '^-?[0-9]+:[0-9a-f]{64}$'),
  nft_item_raw text NOT NULL CHECK (nft_item_raw ~ '^-?[0-9]+:[0-9a-f]{64}$'),
  collection_raw text NOT NULL CHECK (collection_raw ~ '^-?[0-9]+:[0-9a-f]{64}$'),
  item_index numeric(78,0) NOT NULL CHECK (item_index >= 0),
  gross_nano numeric(36,0) NOT NULL CHECK (gross_nano > 0),
  fee_bps integer NOT NULL DEFAULT 300 CHECK (fee_bps = 300),
  platform_fee_nano numeric(36,0) NOT NULL CHECK (platform_fee_nano >= 0),
  seller_proceeds_nano numeric(36,0) NOT NULL CHECK (seller_proceeds_nano >= 0),
  processing_reserve_nano numeric(36,0) NOT NULL CHECK (processing_reserve_nano >= 0),
  payment_query_id numeric(20,0) NOT NULL UNIQUE CHECK (payment_query_id > 0),
  release_query_id numeric(20,0) NOT NULL UNIQUE CHECK (release_query_id > 0),
  seller_payout_query_id numeric(20,0) NOT NULL UNIQUE CHECK (seller_payout_query_id > 0),
  platform_payout_query_id numeric(20,0) NOT NULL UNIQUE CHECK (platform_payout_query_id > 0),
  buyer_refund_query_id numeric(20,0) NOT NULL UNIQUE CHECK (buyer_refund_query_id > 0),
  status text NOT NULL CHECK (status IN (
    'payment_confirmed','delivery_pending','delivery_confirmed',
    'settlement_pending','payouts_dispatched','refund_pending',
    'refund_dispatched','manual_review','completed','refunded'
  )),
  delivery_status text NOT NULL DEFAULT 'not_started'
    CHECK (delivery_status IN ('not_started','pending','confirmed','bounced','manual_review')),
  seller_payout_status text NOT NULL DEFAULT 'not_created'
    CHECK (seller_payout_status IN ('not_created','pending','dispatched','bounced','manual_review')),
  platform_payout_status text NOT NULL DEFAULT 'not_created'
    CHECK (platform_payout_status IN ('not_created','pending','dispatched','bounced','manual_review')),
  buyer_refund_status text NOT NULL DEFAULT 'none'
    CHECK (buyer_refund_status IN ('none','pending','dispatched','bounced','manual_review')),
  payment_tx_hash text CHECK (payment_tx_hash IS NULL OR payment_tx_hash ~ '^[0-9a-fA-F]{64}$'),
  delivery_tx_hash text CHECK (delivery_tx_hash IS NULL OR delivery_tx_hash ~ '^[0-9a-fA-F]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (platform_fee_nano + seller_proceeds_nano = gross_nano),
  CHECK (platform_fee_nano = floor(gross_nano * 3 / 100))
);

CREATE TABLE IF NOT EXISTS public.marketplace_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.marketplace_orders(id) ON DELETE RESTRICT,
  payout_kind text NOT NULL CHECK (payout_kind IN ('seller_97','platform_3','buyer_refund')),
  operation_id numeric(20,0) NOT NULL UNIQUE CHECK (operation_id > 0),
  query_id numeric(20,0) NOT NULL UNIQUE CHECK (query_id > 0),
  beneficiary_wallet_raw text NOT NULL CHECK (beneficiary_wallet_raw ~ '^-?[0-9]+:[0-9a-f]{64}$'),
  amount_nano numeric(36,0) NOT NULL CHECK (amount_nano > 0),
  status text NOT NULL CHECK (status IN ('pending','dispatched','bounced','finalized','manual_review')),
  dispatch_tx_hash text CHECK (dispatch_tx_hash IS NULL OR dispatch_tx_hash ~ '^[0-9a-fA-F]{64}$'),
  recipient_tx_hash text CHECK (recipient_tx_hash IS NULL OR recipient_tx_hash ~ '^[0-9a-fA-F]{64}$'),
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, payout_kind)
);

CREATE TABLE IF NOT EXISTS public.marketplace_chain_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.marketplace_orders(id) ON DELETE RESTRICT,
  observation_kind text NOT NULL CHECK (observation_kind IN (
    'payment_inbound','nft_release_request','nft_delivery','nft_release_bounce',
    'seller_nft_return','seller_payout','platform_payout','buyer_refund'
  )),
  transaction_hash text NOT NULL CHECK (transaction_hash ~ '^[0-9a-fA-F]{64}$'),
  message_hash text NOT NULL CHECK (message_hash ~ '^[0-9a-fA-F]{64}$'),
  account_raw text NOT NULL CHECK (account_raw ~ '^-?[0-9]+:[0-9a-f]{64}$'),
  query_id numeric(20,0),
  success boolean NOT NULL,
  finalized boolean NOT NULL DEFAULT false,
  block_seqno bigint,
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transaction_hash, message_hash)
);

CREATE TABLE IF NOT EXISTS public.marketplace_order_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.marketplace_orders(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'payment_confirmed','delivery_requested','delivery_confirmed','delivery_failed',
    'seller_nft_return_confirmed','buyer_refund_created','buyer_refund_dispatched',
    'seller_payout_created','seller_payout_dispatched','platform_payout_created',
    'platform_payout_dispatched','payout_bounced','recipient_finalized',
    'manual_review','completed','refunded'
  )),
  event_key text NOT NULL UNIQUE,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketplace_orders_buyer_created_idx
  ON public.marketplace_orders (buyer_wallet_raw, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_orders_seller_created_idx
  ON public.marketplace_orders (seller_wallet_raw, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_orders_status_idx
  ON public.marketplace_orders (status, updated_at);
CREATE INDEX IF NOT EXISTS marketplace_payouts_status_idx
  ON public.marketplace_payouts (status, updated_at);
CREATE INDEX IF NOT EXISTS marketplace_chain_observations_order_idx
  ON public.marketplace_chain_observations (order_id, observed_at DESC);

ALTER TABLE public.marketplace_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_chain_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_order_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.marketplace_orders, public.marketplace_payouts,
  public.marketplace_chain_observations, public.marketplace_order_events
  FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.marketplace_orders TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.marketplace_payouts TO service_role;
GRANT SELECT, INSERT ON TABLE public.marketplace_chain_observations TO service_role;
GRANT SELECT, INSERT ON TABLE public.marketplace_order_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.marketplace_order_events_id_seq TO service_role;

COMMENT ON TABLE public.marketplace_orders IS
  'Server-only read projection of immutable TON Marketplace V2 order snapshots; on-chain state is authoritative.';
COMMENT ON TABLE public.marketplace_payouts IS
  'Independent seller/platform/refund liabilities projected from MarketplaceV2; never a payout authorization source.';
COMMENT ON TABLE public.marketplace_chain_observations IS
  'Append-only verified TON transaction/message observations used only for recipient finality projection.';
COMMENT ON TABLE public.marketplace_order_events IS
  'Append-only audit events for marketplace order state projections.';
