-- Atomically confirm an already verified TON payment and append its audit record.
-- This RPC must only be called by a trusted server after independent chain verification.
CREATE OR REPLACE FUNCTION public.confirm_manual_product_payment_verified(
  p_order_id uuid,
  p_buyer_user_id uuid,
  p_transaction_hash text,
  p_paid_at timestamptz
) RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.manual_product_orders%ROWTYPE;
BEGIN
  IF p_transaction_hash !~ '^[0-9a-f]{64}$' OR p_paid_at IS NULL THEN
    RAISE EXCEPTION 'Invalid verified payment evidence';
  END IF;

  SELECT * INTO v_order
  FROM public.manual_product_orders
  WHERE id = p_order_id AND buyer_user_id = p_buyer_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'ORDER_NOT_FOUND';
  END IF;

  IF v_order.status IN ('payment_confirmed', 'delivery_pending', 'delivered')
     AND v_order.payment_tx_hash = p_transaction_hash THEN
    RETURN 'ALREADY_CONFIRMED';
  END IF;

  IF v_order.status <> 'awaiting_payment' THEN
    RETURN 'PAYMENT_STATE_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.manual_product_orders
    WHERE payment_tx_hash = p_transaction_hash AND id <> p_order_id
  ) THEN
    RETURN 'PAYMENT_ALREADY_CLAIMED';
  END IF;

  UPDATE public.manual_product_orders
  SET status = 'payment_confirmed',
      payment_tx_hash = p_transaction_hash,
      paid_at = p_paid_at,
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.manual_product_order_logs
    (order_id, actor_id, action, old_status, new_status, note, metadata)
  VALUES
    (p_order_id, p_buyer_user_id, 'payment_verified', 'awaiting_payment',
     'payment_confirmed', 'TON Mainnet payment automatically verified.',
     jsonb_build_object('transaction_hash', p_transaction_hash, 'chain_timestamp', p_paid_at));

  RETURN 'CONFIRMED';
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_manual_product_payment_verified(uuid, uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_manual_product_payment_verified(uuid, uuid, text, timestamptz)
  TO service_role;
