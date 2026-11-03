\set ON_ERROR_STOP on
BEGIN;

DO $security$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'marketplace_orders',
    'marketplace_payouts',
    'marketplace_chain_observations',
    'marketplace_order_events'
  ] LOOP
    IF NOT (
      SELECT relrowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = table_name
    ) THEN
      RAISE EXCEPTION 'RLS is not enabled on %', table_name;
    END IF;
    IF has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
      OR has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT') THEN
      RAISE EXCEPTION 'Public roles must not read %', table_name;
    END IF;
    IF NOT has_table_privilege('service_role', format('public.%I', table_name), 'SELECT') THEN
      RAISE EXCEPTION 'service_role cannot read %', table_name;
    END IF;
  END LOOP;
END
$security$;

DO $settlement$
DECLARE
  gross numeric(36,0);
  fee numeric(36,0);
  seller numeric(36,0);
BEGIN
  FOREACH gross IN ARRAY ARRAY[1::numeric, 99, 100, 101, 999999999999999999999::numeric] LOOP
    fee := floor(gross * 3 / 100);
    seller := gross - fee;
    IF fee + seller <> gross THEN
      RAISE EXCEPTION 'Settlement does not conserve gross amount %', gross;
    END IF;
    IF fee <> floor(gross * 3 / 100) THEN
      RAISE EXCEPTION 'Platform fee is not exact floor(3%%) for %', gross;
    END IF;
  END LOOP;
END
$settlement$;

DO $constraints$
DECLARE
  order_uuid uuid;
BEGIN
  INSERT INTO public.marketplace_orders (
    chain_order_id, product_id, escrow_id,
    buyer_wallet_raw, seller_wallet_raw, treasury_wallet_raw,
    nft_item_raw, collection_raw, item_index,
    gross_nano, platform_fee_nano, seller_proceeds_nano, processing_reserve_nano,
    payment_query_id, release_query_id, seller_payout_query_id,
    platform_payout_query_id, buyer_refund_query_id, status
  ) VALUES (
    1, 1, 1,
    '0:' || repeat('1', 64), '0:' || repeat('2', 64), '0:' || repeat('3', 64),
    '0:' || repeat('4', 64), '0:' || repeat('5', 64), 0,
    10000, 300, 9700, 100000000,
    11, 12, 13, 14, 15, 'payment_confirmed'
  ) RETURNING id INTO order_uuid;

  INSERT INTO public.marketplace_payouts (
    order_id, payout_kind, operation_id, query_id,
    beneficiary_wallet_raw, amount_nano, status
  ) VALUES
    (order_uuid, 'seller_97', 101, 102, '0:' || repeat('2', 64), 9700, 'pending'),
    (order_uuid, 'platform_3', 103, 104, '0:' || repeat('3', 64), 300, 'pending');

  IF (SELECT count(*) FROM public.marketplace_payouts WHERE order_id = order_uuid) <> 2 THEN
    RAISE EXCEPTION 'Seller and platform payout liabilities were not independently stored';
  END IF;

  BEGIN
    INSERT INTO public.marketplace_payouts (
      order_id, payout_kind, operation_id, query_id,
      beneficiary_wallet_raw, amount_nano, status
    ) VALUES (
      order_uuid, 'seller_97', 105, 106, '0:' || repeat('2', 64), 9700, 'pending'
    );
    RAISE EXCEPTION 'Duplicate seller payout leg unexpectedly accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.marketplace_order_events (order_id, event_type, event_key)
    VALUES (order_uuid, 'payment_confirmed', 'same-event-key');
    INSERT INTO public.marketplace_order_events (order_id, event_type, event_key)
    VALUES (order_uuid, 'payment_confirmed', 'same-event-key');
    RAISE EXCEPTION 'Duplicate event key unexpectedly accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END
$constraints$;

ROLLBACK;
