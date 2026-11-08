-- Extend audit action constraint for system-driven expiry.
ALTER TABLE public.manual_product_order_logs
  DROP CONSTRAINT IF EXISTS manual_product_order_logs_action_check;
ALTER TABLE public.manual_product_order_logs
  ADD CONSTRAINT manual_product_order_logs_action_check
  CHECK (action IN ('order_created','payment_verified','delivery_started',
                   'delivery_completed','cancelled','manual_review','order_expired'));

-- Do not automatically cancel expired orders based on database timestamps alone.
-- A TON transfer can be pending or unindexed after the payment deadline.
-- A future settlement worker must first verify on-chain non-payment and
-- establish an idempotent reconciliation record before cancellation is enabled.
CREATE OR REPLACE FUNCTION public.expire_unpaid_manual_product_orders(p_product_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Automatic expiry disabled pending verified on-chain payment reconciliation';
END;
$$;

REVOKE ALL ON FUNCTION public.expire_unpaid_manual_product_orders(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_manual_product_orders(uuid)
  TO service_role;
