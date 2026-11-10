-- S06: isolated TON TESTNET V3 order/receipt projection.
-- This is a server-only read model. Neither these tables nor their rows
-- authorize TON transfers, settlement, NFT delivery, or Mainnet activity.
-- Never merge with V2 marketplace_orders: chain order IDs are network-local.
CREATE TABLE IF NOT EXISTS public.marketplace_v3_testnet_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_global_id integer NOT NULL DEFAULT -3 CHECK (network_global_id = -3),
  marketplace_raw text NOT NULL CHECK (marketplace_raw ~ '^0:[0-9a-f]{64}$'),
  chain_order_id numeric(20,0) NOT NULL CHECK (chain_order_id BETWEEN 1 AND 18446744073709551615),
  chain_product_id numeric(20,0) NOT NULL CHECK (chain_product_id BETWEEN 1 AND 18446744073709551615),
  payment_query_id numeric(20,0) NOT NULL CHECK (payment_query_id BETWEEN 1 AND 18446744073709551615),
  buyer_wallet_raw text NOT NULL CHECK (buyer_wallet_raw ~ '^0:[0-9a-f]{64}$'),
  seller_wallet_raw text NOT NULL CHECK (seller_wallet_raw ~ '^0:[0-9a-f]{64}$'),
  nft_item_raw text NOT NULL CHECK (nft_item_raw ~ '^0:[0-9a-f]{64}$'),
  escrow_raw text NOT NULL CHECK (escrow_raw ~ '^0:[0-9a-f]{64}$'),
  price_nano numeric(36,0) NOT NULL CHECK (price_nano > 0),
  reserve_nano numeric(36,0) NOT NULL CHECK (reserve_nano = 200000000),
  payment_state text NOT NULL DEFAULT 'unverified'
    CHECK (payment_state IN ('unverified','observed','finalized','rejected','manual_review')),
  nft_delivery_state text NOT NULL DEFAULT 'unverified'
    CHECK (nft_delivery_state IN ('unverified','observed','finalized','bounced','manual_review')),
  reserve_state text NOT NULL DEFAULT 'unverified'
    CHECK (reserve_state IN ('unverified','allocated','in_flight','refunded','settled','manual_review')),
  settlement_state text NOT NULL DEFAULT 'unverified'
    CHECK (settlement_state IN ('unverified','pending','observed','finalized','manual_review')),
  payment_tx_hash text CHECK (payment_tx_hash IS NULL OR payment_tx_hash ~ '^[0-9a-f]{64}$'),
  nft_delivery_tx_hash text CHECK (nft_delivery_tx_hash IS NULL OR nft_delivery_tx_hash ~ '^[0-9a-f]{64}$'),
  last_observed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network_global_id, marketplace_raw, chain_order_id),
  UNIQUE (network_global_id, marketplace_raw, chain_product_id),
  UNIQUE (network_global_id, marketplace_raw, payment_query_id)
);

-- An immutable, deduplicated record of chain evidence. Never accept a
-- browser-supplied transaction hash as proof of payment or delivery.
CREATE TABLE IF NOT EXISTS public.marketplace_v3_testnet_receipts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.marketplace_v3_testnet_orders(id) ON DELETE RESTRICT,
  evidence_kind text NOT NULL CHECK (evidence_kind IN (
    'payment_inbound','reserve_allocation','nft_delivery',
    'nft_delivery_bounce','seller_payout','platform_payout',
    'reserve_refund_dispatch','reserve_refund_receipt','reserve_attestation'
  )),
  account_raw text NOT NULL CHECK (account_raw ~ '^0:[0-9a-f]{64}$'),
  tx_hash text NOT NULL CHECK (tx_hash ~ '^[0-9a-f]{64}$'),
  message_hash text NOT NULL CHECK (message_hash ~ '^[0-9a-f]{64}$'),
  lt numeric(30,0) NOT NULL CHECK (lt > 0),
  query_id numeric(20,0) CHECK (query_id BETWEEN 1 AND 18446744073709551615),
  amount_nano numeric(36,0) CHECK (amount_nano >= 0),
  tx_success boolean NOT NULL,
  recipient_finalized boolean NOT NULL DEFAULT false,
  block_seqno bigint CHECK (block_seqno > 0),
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_raw, tx_hash, message_hash, evidence_kind)
);

CREATE INDEX IF NOT EXISTS marketplace_v3_testnet_orders_buyer_idx
  ON public.marketplace_v3_testnet_orders (buyer_wallet_raw, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_v3_testnet_orders_seller_idx
  ON public.marketplace_v3_testnet_orders (seller_wallet_raw, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_v3_testnet_orders_pending_idx
  ON public.marketplace_v3_testnet_orders (updated_at)
  WHERE payment_state <> 'finalized' OR nft_delivery_state <> 'finalized'
    OR reserve_state NOT IN ('refunded','settled')
    OR settlement_state <> 'finalized';
CREATE INDEX IF NOT EXISTS marketplace_v3_testnet_receipts_order_idx
  ON public.marketplace_v3_testnet_receipts (order_id, observed_at DESC);

ALTER TABLE public.marketplace_v3_testnet_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_v3_testnet_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_v3_testnet_orders,
  public.marketplace_v3_testnet_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.marketplace_v3_testnet_orders TO service_role;
GRANT SELECT, INSERT ON public.marketplace_v3_testnet_receipts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.marketplace_v3_testnet_receipts_id_seq TO service_role;

COMMENT ON TABLE public.marketplace_v3_testnet_orders IS
  'S06 TON Testnet (-3) V3 order mirror only. On-chain evidence is authoritative; never authorizes funds or Mainnet.';
COMMENT ON TABLE public.marketplace_v3_testnet_receipts IS
  'S06 append-only deduplicated TON Testnet chain receipts; evidence must be independently verified server-side.';
