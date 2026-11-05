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

  SELECT o.order_no, o.status
    INTO v_order_no, v_old_status
    FROM public.manual_product_orders AS o
   WHERE o.id = p_order_id
   FOR UPDATE;

  IF NOT FOUND OR v_old_status NOT IN ('payment_confirmed', 'delivery_pending') THEN
    RAISE EXCEPTION 'Order not found or payment has not been confirmed';
  END IF;

  UPDATE public.manual_product_orders AS o
     SET status = 'delivered',
         delivery_reference = v_reference,
         delivered_by = p_actor_id,
         delivered_at = now(),
         admin_note = nullif(btrim(p_note), ''),
         updated_at = now()
   WHERE o.id = p_order_id;

  INSERT INTO public.manual_product_order_logs (
    order_id, actor_id, action, old_status, new_status, note, metadata
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
