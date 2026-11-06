-- Per-order processing reserve liability and reconciliation projection.
-- Additive only: existing order history is preserved and old rows remain unclassified.
ALTER TABLE public.marketplace_orders
  ADD COLUMN IF NOT EXISTS processing_reserve_nano numeric(36,0);

ALTER TABLE public.marketplace_orders
  DROP CONSTRAINT IF EXISTS marketplace_orders_processing_reserve_nano_check;

ALTER TABLE public.marketplace_orders
  ADD CONSTRAINT marketplace_orders_processing_reserve_nano_check
  CHECK (
    processing_reserve_nano IS NULL OR processing_reserve_nano >= 0
  );

CREATE TABLE IF NOT EXISTS public.marketplace_processing_reserves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE
    REFERENCES public.marketplace_orders(id) ON DELETE RESTRICT,
  chain_order_id numeric(20,0) NOT NULL UNIQUE CHECK (chain_order_id > 0),
  buyer_wallet_raw text NOT NULL
    CHECK (buyer_wallet_raw ~ '^-?[0-9]+:[0-9a-f]{64}$'),
  reserve_nano numeric(36,0) NOT NULL CHECK (reserve_nano > 0),
  payment_tx_hash text NOT NULL
    CHECK (payment_tx_hash ~ '^[0-9a-fA-F]{64}$'),
  status text NOT NULL DEFAULT 'awaiting_trace'
    CHECK (status IN (
      'awaiting_trace',
      'preview_ready',
      'manual_review',
      'refund_pending',
      'refund_dispatched',
      'refunded'
    )),
  trace_id text,
  trace_mc_seqno_end bigint,
  actual_processing_cost_nano numeric(36,0),
  refundable_nano numeric(36,0),
  shortfall_nano numeric(36,0) NOT NULL DEFAULT 0,
  refund_query_id numeric(20,0) UNIQUE,
  refund_tx_hash text
    CHECK (refund_tx_hash IS NULL OR refund_tx_hash ~ '^[0-9a-fA-F]{64}$'),
  previewed_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (trace_id IS NULL AND trace_mc_seqno_end IS NULL AND
      actual_processing_cost_nano IS NULL AND refundable_nano IS NULL AND
      previewed_at IS NULL)
    OR
    (trace_id IS NOT NULL AND length(trace_id) > 0 AND
      trace_mc_seqno_end > 0 AND
      actual_processing_cost_nano >= 0 AND refundable_nano >= 0 AND
      previewed_at IS NOT NULL)
  ),
  CHECK (shortfall_nano >= 0),
  CHECK (
    status NOT IN ('refund_dispatched', 'refunded')
    OR (refund_query_id IS NOT NULL AND refundable_nano > 0)
  ),
  CHECK (
    status <> 'refunded'
    OR (refund_tx_hash IS NOT NULL AND refunded_at IS NOT NULL)
  ),
  CHECK (
    status <> 'manual_review'
    OR true
  )
);

CREATE INDEX IF NOT EXISTS marketplace_processing_reserves_status_idx
  ON public.marketplace_processing_reserves (status, updated_at);

ALTER TABLE public.marketplace_processing_reserves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketplace_processing_reserves FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.marketplace_processing_reserves TO service_role;

-- Extend existing append-only observation/event vocabulary for reserve refunds.
ALTER TABLE public.marketplace_chain_observations
  DROP CONSTRAINT IF EXISTS marketplace_chain_observations_observation_kind_check;
ALTER TABLE public.marketplace_chain_observations
  ADD CONSTRAINT marketplace_chain_observations_observation_kind_check
  CHECK (observation_kind IN (
    'payment_inbound','nft_release_request','nft_delivery','nft_release_bounce',
    'seller_nft_return','seller_payout','platform_payout','buyer_refund',
    'processing_reserve_refund'
  ));

ALTER TABLE public.marketplace_order_events
  DROP CONSTRAINT IF EXISTS marketplace_order_events_event_type_check;
ALTER TABLE public.marketplace_order_events
  ADD CONSTRAINT marketplace_order_events_event_type_check
  CHECK (event_type IN (
    'payment_confirmed','delivery_requested','delivery_confirmed','delivery_failed',
    'seller_nft_return_confirmed','buyer_refund_created','buyer_refund_dispatched',
    'seller_payout_created','seller_payout_dispatched','platform_payout_created',
    'platform_payout_dispatched','payout_bounced','recipient_finalized',
    'manual_review','completed','refunded',
    'processing_reserve_reconciled','processing_reserve_refund_created',
    'processing_reserve_refund_dispatched','processing_reserve_refund_confirmed'
  ));

COMMENT ON COLUMN public.marketplace_orders.processing_reserve_nano IS
  'Original buyer-funded processing reserve in nanotons. NULL means legacy/unverified; never infer 0.2 TON for old orders.';
COMMENT ON TABLE public.marketplace_processing_reserves IS
  'Per-order buyer reserve liability and trace reconciliation projection. A preview is not refund authorization; chain state remains authoritative.';
