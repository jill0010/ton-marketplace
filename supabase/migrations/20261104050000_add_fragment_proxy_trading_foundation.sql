-- Fragment proxy trading foundation.
-- Public catalogue rows are read-only; all order, custody and ledger writes are server-only.
CREATE TABLE IF NOT EXISTS public.fragment_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_item_id text NOT NULL UNIQUE,
  item_type text NOT NULL CHECK (item_type IN ('username','phone_number','gift')),
  listing_kind text NOT NULL CHECK (listing_kind IN ('auction','fixed_price')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 256),
  source_url text NOT NULL,
  image_url text CHECK (image_url IS NULL OR image_url LIKE 'https://%'),
  currency text NOT NULL DEFAULT 'TON' CHECK (currency = 'TON'),
  current_price_nano numeric(36,0) CHECK (current_price_nano IS NULL OR current_price_nano >= 0),
  minimum_bid_nano numeric(36,0) CHECK (minimum_bid_nano IS NULL OR minimum_bid_nano > 0),
  auction_ends_at timestamptz,
  source_status text NOT NULL DEFAULT 'active'
    CHECK (source_status IN ('active','sold','ended','unavailable','paused')),
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (listing_kind = 'auction' AND minimum_bid_nano IS NOT NULL)
    OR listing_kind = 'fixed_price'
  )
);

ALTER TABLE public.fragment_listings
  DROP CONSTRAINT IF EXISTS fragment_listings_source_url_check;
ALTER TABLE public.fragment_listings
  ADD CONSTRAINT fragment_listings_source_url_check
  CHECK (source_url LIKE 'https://fragment.com/%');

CREATE INDEX IF NOT EXISTS fragment_listings_public_catalog_idx
  ON public.fragment_listings (source_status, listing_kind, item_type, synced_at DESC);
CREATE INDEX IF NOT EXISTS fragment_listings_auction_ends_idx
  ON public.fragment_listings (auction_ends_at)
  WHERE listing_kind = 'auction' AND source_status = 'active';

CREATE TABLE IF NOT EXISTS public.fragment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.fragment_listings(id) ON DELETE RESTRICT,
  source_item_id text NOT NULL,
  item_type text NOT NULL CHECK (item_type IN ('username','phone_number','gift')),
  listing_kind text NOT NULL CHECK (listing_kind IN ('auction','fixed_price')),
  buyer_wallet_raw text NOT NULL CHECK (buyer_wallet_raw ~ '^-?[0-9]+:[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN (
    'awaiting_payment','payment_confirmed','submitting','active_bid',
    'outbid_refund_pending','refunded','won','purchase_pending',
    'purchased','delivery_pending','delivered','failed','manual_review'
  )),
  currency text NOT NULL DEFAULT 'TON' CHECK (currency = 'TON'),
  authorized_bid_nano numeric(36,0),
  customer_paid_nano numeric(36,0) NOT NULL CHECK (customer_paid_nano > 0),
  fragment_paid_nano numeric(36,0) NOT NULL DEFAULT 0 CHECK (fragment_paid_nano >= 0),
  service_fee_nano numeric(36,0) NOT NULL DEFAULT 0 CHECK (service_fee_nano >= 0),
  customer_refund_nano numeric(36,0) NOT NULL DEFAULT 0 CHECK (customer_refund_nano >= 0),
  payment_query_id numeric(20,0) NOT NULL UNIQUE CHECK (payment_query_id > 0),
  payment_tx_hash text UNIQUE CHECK (payment_tx_hash IS NULL OR payment_tx_hash ~ '^[0-9a-fA-F]{64}$'),
  fragment_action_id text,
  fragment_action_tx_hash text UNIQUE CHECK (fragment_action_tx_hash IS NULL OR fragment_action_tx_hash ~ '^[0-9a-fA-F]{64}$'),
  customer_refund_tx_hash text UNIQUE CHECK (customer_refund_tx_hash IS NULL OR customer_refund_tx_hash ~ '^[0-9a-fA-F]{64}$'),
  delivery_tx_hash text UNIQUE CHECK (delivery_tx_hash IS NULL OR delivery_tx_hash ~ '^[0-9a-fA-F]{64}$'),
  idempotency_key text NOT NULL UNIQUE,
  failure_code text,
  failure_detail text,
  paid_at timestamptz,
  fragment_action_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (listing_kind = 'auction' AND authorized_bid_nano IS NOT NULL AND authorized_bid_nano > 0)
    OR (listing_kind = 'fixed_price' AND authorized_bid_nano IS NULL)
  ),
  CHECK (customer_refund_nano <= customer_paid_nano)
);

CREATE INDEX IF NOT EXISTS fragment_orders_buyer_created_idx
  ON public.fragment_orders (buyer_wallet_raw, created_at DESC);
CREATE INDEX IF NOT EXISTS fragment_orders_status_idx
  ON public.fragment_orders (status, updated_at);
CREATE INDEX IF NOT EXISTS fragment_orders_source_item_idx
  ON public.fragment_orders (source_item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.fragment_order_funds (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.fragment_orders(id) ON DELETE RESTRICT,
  entry_kind text NOT NULL CHECK (entry_kind IN (
    'customer_payment','fragment_bid','fragment_purchase','fragment_refund',
    'customer_refund','service_fee','delivery_reserve','adjustment'
  )),
  direction text NOT NULL CHECK (direction IN ('in','out')),
  amount_nano numeric(36,0) NOT NULL CHECK (amount_nano > 0),
  transaction_hash text CHECK (transaction_hash IS NULL OR transaction_hash ~ '^[0-9a-fA-F]{64}$'),
  event_key text NOT NULL UNIQUE,
  notes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(notes) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fragment_order_funds_order_idx
  ON public.fragment_order_funds (order_id, created_at);

CREATE TABLE IF NOT EXISTS public.fragment_order_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.fragment_orders(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'created','payment_confirmed','fragment_bid_submitted','fragment_purchase_submitted',
    'outbid_detected','fragment_refund_detected','customer_refund_submitted',
    'auction_won','nft_received','delivery_submitted','delivery_confirmed',
    'failed','manual_review'
  )),
  event_key text NOT NULL UNIQUE,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fragment_order_events_order_idx
  ON public.fragment_order_events (order_id, created_at);

CREATE TABLE IF NOT EXISTS public.fragment_catalog_sync_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider text NOT NULL,
  status text NOT NULL CHECK (status IN ('running','succeeded','partial','failed','disabled')),
  items_seen integer NOT NULL DEFAULT 0 CHECK (items_seen >= 0),
  items_upserted integer NOT NULL DEFAULT 0 CHECK (items_upserted >= 0),
  error_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

ALTER TABLE public.fragment_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fragment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fragment_order_funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fragment_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fragment_catalog_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fragment_listings_public_active_read ON public.fragment_listings;
CREATE POLICY fragment_listings_public_active_read
  ON public.fragment_listings FOR SELECT TO anon, authenticated
  USING (source_status = 'active' AND synced_at >= now() - interval '5 minutes');

REVOKE ALL ON TABLE public.fragment_listings, public.fragment_orders,
  public.fragment_order_funds, public.fragment_order_events,
  public.fragment_catalog_sync_runs FROM anon, authenticated;
GRANT SELECT ON TABLE public.fragment_listings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.fragment_listings TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.fragment_orders TO service_role;
GRANT SELECT, INSERT ON TABLE public.fragment_order_funds TO service_role;
GRANT SELECT, INSERT ON TABLE public.fragment_order_events TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.fragment_catalog_sync_runs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.fragment_order_funds_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.fragment_order_events_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.fragment_catalog_sync_runs_id_seq TO service_role;

COMMENT ON TABLE public.fragment_listings IS
  'Cached public Fragment listing metadata. Rows are hidden from customers when not refreshed within five minutes.';
COMMENT ON TABLE public.fragment_orders IS
  'Server-managed Fragment proxy orders. Auction orders authorize exactly one bid and never auto-rebid after being outbid.';
COMMENT ON TABLE public.fragment_order_funds IS
  'Append-only per-order custody ledger. Each customer liability is isolated by order_id; API roles cannot update or delete entries.';
COMMENT ON TABLE public.fragment_order_events IS
  'Append-only audit trail for Fragment proxy order state transitions.';
COMMENT ON TABLE public.fragment_catalog_sync_runs IS
  'Server-only audit history for Fragment catalogue synchronization attempts.';
