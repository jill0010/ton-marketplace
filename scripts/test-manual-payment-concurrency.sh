#!/usr/bin/env bash
set -euo pipefail
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}" PGDATABASE="${PGDATABASE:-postgres}"
psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE public.manual_product_orders (
 id uuid PRIMARY KEY, order_no text NOT NULL UNIQUE, product_id uuid NOT NULL,
 buyer_wallet_raw text NOT NULL, amount numeric NOT NULL, currency text NOT NULL,
 status text NOT NULL DEFAULT 'awaiting_payment',
 payment_tx_hash text UNIQUE, paid_at timestamptz, updated_at timestamptz DEFAULT now(),
 buyer_user_id uuid NOT NULL
);
CREATE TABLE public.manual_product_order_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.manual_product_orders(id),
 actor_id uuid, action text NOT NULL, old_status text, new_status text, note text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now()
);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;
SQL
psql -v ON_ERROR_STOP=1 -f supabase/migrations/20261109020000_confirm_manual_product_payment_atomically.sql
# Both clients use distinct PostgreSQL connections; the first holds the row lock.
psql -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.manual_product_orders(id,order_no,product_id,buyer_wallet_raw,amount,currency,buyer_user_id)
VALUES ('00000000-0000-4000-8000-000000000101','CONCURRENCY-1','00000000-0000-4000-8000-000000000201','0:0000000000000000000000000000000000000000000000000000000000000000',1,'TON','00000000-0000-4000-8000-000000000301'),
('00000000-0000-4000-8000-000000000102','CONCURRENCY-2','00000000-0000-4000-8000-000000000202','0:0000000000000000000000000000000000000000000000000000000000000000',1,'TON','00000000-0000-4000-8000-000000000301');
SQL
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
psql -v ON_ERROR_STOP=1 -At <<'SQL' > "$tmpdir/first" &
BEGIN;
SELECT public.confirm_manual_product_payment_verified('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000301',repeat('a',64),now());
SELECT pg_sleep(3);
COMMIT;
SQL
first_pid=$!
sleep 1
psql -v ON_ERROR_STOP=1 -At <<'SQL' > "$tmpdir/second" &
BEGIN;
SET LOCAL lock_timeout = '8s';
SELECT public.confirm_manual_product_payment_verified('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000301',repeat('a',64),now());
COMMIT;
SQL
second_pid=$!
wait "$first_pid"
wait "$second_pid"
grep -Fxq 'CONFIRMED' "$tmpdir/first"
grep -Fxq 'ALREADY_CONFIRMED' "$tmpdir/second"
psql -v ON_ERROR_STOP=1 -At <<'SQL' > "$tmpdir/third"
SELECT public.confirm_manual_product_payment_verified('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000301',repeat('a',64),now());
SQL
grep -Fxq 'PAYMENT_ALREADY_CLAIMED' "$tmpdir/third"
psql -v ON_ERROR_STOP=1 -At <<'SQL' > "$tmpdir/counts"
SELECT (SELECT count(*) FROM public.manual_product_orders WHERE payment_tx_hash=repeat('a',64))::text || ':' ||
       (SELECT count(*) FROM public.manual_product_order_logs WHERE action='payment_verified')::text;
SQL
grep -Fxq '1:1' "$tmpdir/counts"
echo "PASS: two independent sessions, row lock, idempotency, duplicate claim and single audit."
