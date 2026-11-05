ALTER TABLE public.manual_product_orders
  ADD COLUMN IF NOT EXISTS buyer_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS delivery_reference text,
  ADD COLUMN IF NOT EXISTS delivered_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS manual_product_orders_buyer_created_idx
  ON public.manual_product_orders (buyer_user_id, created_at DESC);

DROP POLICY IF EXISTS "Buyer can read own manual product orders" ON public.manual_product_orders;
CREATE POLICY "Buyer can read own manual product orders"
  ON public.manual_product_orders FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = buyer_user_id);

CREATE TABLE IF NOT EXISTS public.manual_product_order_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.manual_product_orders(id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES auth.users(id),
  action text NOT NULL CHECK (action IN (
    'order_created',
    'payment_verified',
    'delivery_started',
    'delivery_completed',
    'cancelled',
    'manual_review'
  )),
  old_status text,
  new_status text,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS manual_product_order_logs_order_created_idx
  ON public.manual_product_order_logs (order_id, created_at DESC);

ALTER TABLE public.manual_product_order_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manual_product_order_logs FROM anon, authenticated;
GRANT SELECT ON public.manual_product_order_logs TO authenticated;
GRANT SELECT, INSERT ON public.manual_product_order_logs TO service_role;

DROP POLICY IF EXISTS "Admin can read manual product order logs" ON public.manual_product_order_logs;
CREATE POLICY "Admin can read manual product order logs"
  ON public.manual_product_order_logs FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = '0744f173-3f36-438f-b265-9cb3be95ad78'::uuid);

CREATE OR REPLACE FUNCTION public.admin_complete_manual_product_delivery(
  p_order_id uuid,
  p_actor_id uuid,
  p_delivery_reference text,
  p_note text DEFAULT NULL
)
RETURNS TABLE(order_id uuid, order_no text, status text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_status text;
  v_order_no text;
  v_reference text := nullif(btrim(p_delivery_reference), '');
BEGIN
  IF p_actor_id IS DISTINCT FROM '0744f173-3f36-438f-b265-9cb3be95ad78'::uuid THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  IF v_reference IS NULL OR length(v_reference) > 512 THEN
    RAISE EXCEPTION 'A valid delivery reference is required';
  END IF;
  IF p_note IS NOT NULL AND length(p_note) > 2000 THEN
    RAISE EXCEPTION 'Delivery note is too long';
  END IF;

  UPDATE public.manual_product_orders AS o
     SET status = 'delivered',
         delivery_reference = v_reference,
         delivered_by = p_actor_id,
         delivered_at = now(),
         admin_note = nullif(btrim(p_note), ''),
         updated_at = now()
   WHERE o.id = p_order_id
     AND o.status IN ('payment_confirmed', 'delivery_pending')
   RETURNING o.order_no, 'delivery_pending'::text
        INTO v_order_no, v_old_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or payment has not been confirmed';
  END IF;

  INSERT INTO public.manual_product_order_logs (
    order_id, actor_id, action, old_status, new_status, note,
    metadata
  ) VALUES (
    p_order_id, p_actor_id, 'delivery_completed', v_old_status, 'delivered',
    nullif(btrim(p_note), ''),
    jsonb_build_object('delivery_reference', v_reference)
  );

  RETURN QUERY SELECT p_order_id, v_order_no, 'delivered'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_complete_manual_product_delivery(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_complete_manual_product_delivery(uuid, uuid, text, text)
  TO service_role;
