-- Extend audit action constraint for system-driven expiry.
ALTER TABLE public.manual_product_order_logs
  DROP CONSTRAINT IF EXISTS manual_product_order_logs_action_check;
ALTER TABLE public.manual_product_order_logs
  ADD CONSTRAINT manual_product_order_logs_action_check
  CHECK (action IN ('order_created','payment_verified','delivery_started',
                   'delivery_completed','cancelled','manual_review','order_expired'));

-- Release stale unpaid reservations without touching confirmed payments or delivered orders.
-- Only the service role may invoke this atomic, product-scoped cleanup.
CREATE OR REPLACE FUNCTION public.expire_unpaid_manual_product_orders(p_product_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  WITH expired AS (
    UPDATE public.manual_product_orders AS o
       SET status = 'cancelled', updated_at = now()
     WHERE o.product_id = p_product_id
       AND o.status = 'awaiting_payment'
       AND o.expires_at <= now()
       AND o.paid_at IS NULL
       AND o.payment_tx_hash IS NULL
     RETURNING o.id, o.order_no
  ), logged AS (
    INSERT INTO public.manual_product_order_logs
      (order_id, actor_id, action, old_status, new_status, note, metadata)
    SELECT e.id, NULL, 'order_expired', 'awaiting_payment', 'cancelled',
           'Unpaid checkout reservation expired.', jsonb_build_object('order_no', e.order_no)
      FROM expired e
    RETURNING order_id
  )
  SELECT count(*)::integer INTO v_count FROM logged;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_unpaid_manual_product_orders(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_manual_product_orders(uuid)
  TO service_role;
