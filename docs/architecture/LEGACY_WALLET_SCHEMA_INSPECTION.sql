-- READ-ONLY legacy schema inspection for wallet identity migration.
-- Safe to run in Supabase SQL Editor: SELECT statements only.
-- Does not return wallet addresses, user IDs, tokens, or other row-level PII.

-- 1) Confirm the legacy wallet table exists and inspect its columns.
SELECT
  to_regclass('public.ton_verified_wallets') AS legacy_wallet_table,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
FROM information_schema.columns AS c
WHERE c.table_schema = 'public'
  AND c.table_name = 'ton_verified_wallets'
ORDER BY c.ordinal_position;

-- 2) Inspect primary keys, unique/check/foreign-key constraints.
SELECT
  con.conname AS constraint_name,
  con.contype AS constraint_type,
  pg_get_constraintdef(con.oid, true) AS definition
FROM pg_constraint AS con
JOIN pg_class AS rel ON rel.oid = con.conrelid
JOIN pg_namespace AS ns ON ns.oid = rel.relnamespace
WHERE ns.nspname = 'public'
  AND rel.relname = 'ton_verified_wallets'
ORDER BY con.contype, con.conname;

-- 3) Inspect indexes without exposing indexed values.
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'ton_verified_wallets'
ORDER BY indexname;

-- 4) Inspect RLS state and policies.
SELECT
  rel.relrowsecurity AS rls_enabled,
  rel.relforcerowsecurity AS rls_forced
FROM pg_class AS rel
WHERE rel.oid = to_regclass('public.ton_verified_wallets');

SELECT
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'ton_verified_wallets'
ORDER BY policyname;

-- 5) Approximate row count only; this avoids returning row-level data.
SELECT
  schemaname,
  relname AS table_name,
  n_live_tup AS estimated_live_rows,
  n_dead_tup AS estimated_dead_rows,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND relname IN ('ton_verified_wallets', 'products')
ORDER BY relname;

-- 6) Inspect wallet row quality without returning addresses or user IDs.
-- Run only after query 1 confirms that the named columns exist.
SELECT
  count(*) AS total_rows,
  count(*) FILTER (WHERE user_id IS NULL) AS null_user_id_rows,
  count(*) FILTER (WHERE wallet_address IS NULL OR btrim(wallet_address) = '')
    AS missing_wallet_address_rows,
  count(*) FILTER (WHERE network IS NULL OR network <> '-239')
    AS non_mainnet_or_missing_network_rows,
  count(DISTINCT user_id) AS distinct_user_ids,
  count(DISTINCT (network, wallet_address)) AS distinct_exact_wallet_keys
FROM public.ton_verified_wallets;

-- 7) Count exact duplicate wallet keys without exposing their values.
SELECT
  count(*) AS duplicate_wallet_key_groups,
  coalesce(sum(duplicate_rows - 1), 0) AS excess_duplicate_rows
FROM (
  SELECT count(*) AS duplicate_rows
  FROM public.ton_verified_wallets
  WHERE user_id IS NOT NULL
    AND wallet_address IS NOT NULL
    AND network IS NOT NULL
  GROUP BY network, wallet_address
  HAVING count(*) > 1
) AS duplicates;

-- 8) Inspect products.id and product foreign keys before designing final
-- order/listing relationships. No product rows are returned.
SELECT
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable
FROM information_schema.columns AS c
WHERE c.table_schema = 'public'
  AND c.table_name = 'products'
ORDER BY c.ordinal_position;

SELECT
  con.conname AS constraint_name,
  con.contype AS constraint_type,
  pg_get_constraintdef(con.oid, true) AS definition
FROM pg_constraint AS con
JOIN pg_class AS rel ON rel.oid = con.conrelid
JOIN pg_namespace AS ns ON ns.oid = rel.relnamespace
WHERE ns.nspname = 'public'
  AND rel.relname = 'products'
ORDER BY con.contype, con.conname;
