-- DESIGN DRAFT ONLY — NOT A SUPABASE MIGRATION.
-- Do not execute directly. Before conversion to a migration:
-- 1) generate the migration with `supabase migration new ...`;
-- 2) verify products.id and all existing auth/TON-proof table definitions;
-- 3) write and test a deterministic legacy-wallet backfill;
-- 4) test on a disposable local database and review RLS/advisors.
--
-- Private schema is intentionally not exposed through the Supabase Data API.
-- The browser must never read or write these tables directly.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE TABLE IF NOT EXISTS private.wallet_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL CHECK (network = '-239'),
  raw_address text NOT NULL
    CHECK (raw_address ~ '^-?[0-9]+:[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_identities_network_raw_address_key
    UNIQUE (network, raw_address)
);

COMMENT ON TABLE private.wallet_identities IS
  'Canonical TON wallet identities. One row per network + raw address, independent of Supabase anonymous sessions.';

CREATE TABLE IF NOT EXISTS private.wallet_identity_sessions (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_identity_id uuid NOT NULL
    REFERENCES private.wallet_identities(id) ON DELETE RESTRICT,
  proof_verified_at timestamptz NOT NULL,
  proof_expires_at timestamptz NOT NULL,
  wallet_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_identity_sessions_expiry_check
    CHECK (proof_expires_at > proof_verified_at)
);

CREATE INDEX IF NOT EXISTS wallet_identity_sessions_identity_idx
  ON private.wallet_identity_sessions (wallet_identity_id);

COMMENT ON TABLE private.wallet_identity_sessions IS
  'Short-lived mapping from an anonymous Supabase Auth session to its currently TON-Proof-verified wallet. Multiple sessions may map to one wallet identity.';

CREATE TABLE IF NOT EXISTS private.marketplace_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_type text NOT NULL
    CHECK (order_type IN ('nft_purchase', 'premium')),
  buyer_wallet_identity_id uuid NOT NULL
    REFERENCES private.wallet_identities(id) ON DELETE RESTRICT,
  seller_wallet_identity_id uuid
    REFERENCES private.wallet_identities(id) ON DELETE RESTRICT,
  product_id uuid,
  network text NOT NULL CHECK (network = '-239'),
  currency text NOT NULL CHECK (currency = 'TON'),
  amount_atomic numeric(78, 0) NOT NULL CHECK (amount_atomic > 0),
  platform_fee_bps integer NOT NULL DEFAULT 300
    CHECK (platform_fee_bps BETWEEN 0 AND 10000),
  platform_fee_atomic numeric(78, 0) NOT NULL DEFAULT 0
    CHECK (platform_fee_atomic >= 0),
  seller_amount_atomic numeric(78, 0)
    CHECK (seller_amount_atomic IS NULL OR seller_amount_atomic >= 0),
  status text NOT NULL CHECK (status IN (
    'pending_payment',
    'payment_confirmed',
    'delivery_pending',
    'delivery_confirmed',
    'settlement_pending',
    'paid_pending_delivery',
    'fulfilled',
    'completed',
    'expired',
    'underpaid',
    'overpaid',
    'refund_pending',
    'refunded',
    'manual_review',
    'cancelled'
  )),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 200),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_orders_buyer_idempotency_key
    UNIQUE (buyer_wallet_identity_id, idempotency_key),
  CONSTRAINT marketplace_orders_seller_type_check
    CHECK (
      (order_type = 'nft_purchase' AND seller_wallet_identity_id IS NOT NULL)
      OR
      (order_type = 'premium' AND seller_wallet_identity_id IS NULL)
    ),
  CONSTRAINT marketplace_orders_fee_total_check
    CHECK (
      seller_amount_atomic IS NULL
      OR platform_fee_atomic + seller_amount_atomic = amount_atomic
    )
);

CREATE INDEX IF NOT EXISTS marketplace_orders_buyer_created_idx
  ON private.marketplace_orders (buyer_wallet_identity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS marketplace_orders_status_created_idx
  ON private.marketplace_orders (status, created_at);

CREATE TABLE IF NOT EXISTS private.marketplace_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL
    REFERENCES private.marketplace_orders(id) ON DELETE RESTRICT,
  network text NOT NULL CHECK (network = '-239'),
  currency text NOT NULL CHECK (currency = 'TON'),
  payer_wallet_identity_id uuid
    REFERENCES private.wallet_identities(id) ON DELETE RESTRICT,
  recipient_raw_address text NOT NULL
    CHECK (recipient_raw_address ~ '^-?[0-9]+:[0-9a-f]{64}$'),
  amount_atomic numeric(78, 0) NOT NULL CHECK (amount_atomic > 0),
  transaction_hash text,
  event_index bigint NOT NULL DEFAULT 0 CHECK (event_index >= 0),
  query_id numeric(20, 0),
  status text NOT NULL CHECK (status IN (
    'observed', 'confirmed', 'underpaid', 'overpaid', 'rejected', 'reversed'
  )),
  observed_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  raw_event jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT marketplace_payments_chain_event_unique
    UNIQUE (network, transaction_hash, event_index)
);

CREATE INDEX IF NOT EXISTS marketplace_payments_order_idx
  ON private.marketplace_payments (order_id, observed_at);

CREATE TABLE IF NOT EXISTS private.marketplace_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL
    REFERENCES private.marketplace_orders(id) ON DELETE RESTRICT,
  settlement_type text NOT NULL
    CHECK (settlement_type IN ('nft_sale', 'premium_refund')),
  seller_wallet_identity_id uuid
    REFERENCES private.wallet_identities(id) ON DELETE RESTRICT,
  seller_amount_atomic numeric(78, 0) NOT NULL DEFAULT 0
    CHECK (seller_amount_atomic >= 0),
  platform_fee_atomic numeric(78, 0) NOT NULL DEFAULT 0
    CHECK (platform_fee_atomic >= 0),
  status text NOT NULL
    CHECK (status IN ('pending', 'submitted', 'confirmed', 'failed', 'manual_review')),
  transaction_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  CONSTRAINT marketplace_settlements_order_type_unique
    UNIQUE (order_id, settlement_type)
);

CREATE TABLE IF NOT EXISTS private.ledger_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES private.marketplace_orders(id) ON DELETE RESTRICT,
  journal_type text NOT NULL,
  currency text NOT NULL CHECK (currency = 'TON'),
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS private.ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_key text NOT NULL UNIQUE,
  account_type text NOT NULL
    CHECK (account_type IN ('buyer_clearing', 'seller_payable', 'platform_revenue', 'refund_payable', 'gas_expense')),
  wallet_identity_id uuid
    REFERENCES private.wallet_identities(id) ON DELETE RESTRICT,
  currency text NOT NULL CHECK (currency = 'TON'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS private.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id uuid NOT NULL
    REFERENCES private.ledger_journals(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL
    REFERENCES private.ledger_accounts(id) ON DELETE RESTRICT,
  direction text NOT NULL CHECK (direction IN ('debit', 'credit')),
  amount_atomic numeric(78, 0) NOT NULL CHECK (amount_atomic > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ledger_entries_journal_idx
  ON private.ledger_entries (journal_id);

CREATE INDEX IF NOT EXISTS ledger_entries_account_created_idx
  ON private.ledger_entries (account_id, created_at);

CREATE TABLE IF NOT EXISTS private.chain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL CHECK (network = '-239'),
  transaction_hash text NOT NULL,
  event_index bigint NOT NULL DEFAULT 0 CHECK (event_index >= 0),
  event_type text NOT NULL,
  account_raw_address text
    CHECK (account_raw_address IS NULL OR account_raw_address ~ '^-?[0-9]+:[0-9a-f]{64}$'),
  observed_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  payload jsonb NOT NULL,
  CONSTRAINT chain_events_network_tx_event_key
    UNIQUE (network, transaction_hash, event_index)
);

CREATE INDEX IF NOT EXISTS chain_events_observed_idx
  ON private.chain_events (observed_at);

CREATE TABLE IF NOT EXISTS private.chain_event_cursors (
  network text NOT NULL CHECK (network = '-239'),
  source_key text NOT NULL,
  cursor_value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (network, source_key)
);

CREATE TABLE IF NOT EXISTS private.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS outbox_events_ready_idx
  ON private.outbox_events (next_attempt_at, created_at)
  WHERE status IN ('pending', 'failed');

-- All tables are server-only. No anon/authenticated Data API access.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'wallet_identities',
    'wallet_identity_sessions',
    'marketplace_orders',
    'marketplace_payments',
    'marketplace_settlements',
    'ledger_journals',
    'ledger_accounts',
    'ledger_entries',
    'chain_events',
    'chain_event_cursors',
    'outbox_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE private.%I FROM PUBLIC, anon, authenticated', table_name);
    EXECUTE format('GRANT ALL ON TABLE private.%I TO service_role', table_name);
  END LOOP;
END
$$;

COMMIT;

-- IMPORTANT IMPLEMENTATION GATES:
-- * No policy grants browser access to financial or identity tables.
-- * Ledger balancing must be enforced by a single trusted database transaction
--   (and a deferred constraint trigger or equivalent invariant checker) before
--   any journal-writing endpoint is enabled.
-- * The product_id column intentionally has no FK until the actual public.products
--   primary-key type and product lifecycle are verified.
-- * Legacy ton_verified_wallets rows must be normalized in application code,
--   grouped by (network, raw address), deduplicated, and linked to wallet_identity_sessions
--   in a separately tested backfill. Never guess how to merge conflicting session rows.
