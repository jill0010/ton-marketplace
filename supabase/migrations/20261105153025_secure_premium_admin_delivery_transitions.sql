CREATE OR REPLACE FUNCTION public.admin_confirm_premium_gram_payment(
  p_order_id uuid,
  p_payment_id uuid,
  p_actor_id uuid
)
RETURNS TABLE(order_id uuid, status text, already_confirmed boolean)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_status text;
  v_chain_status text;
  v_admin_confirmed boolean;
  v_order_no text;
BEGIN
  IF p_actor_id IS DISTINCT FROM '0744f173-3f36-438f-b265-9cb3be95ad78'::uuid THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  SELECT o.status, o.order_no
    INTO v_order_status, v_order_no
    FROM public.premium_orders o
   WHERE o.id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Premium order not found'; END IF;

  SELECT p.chain_status, p.admin_confirmed
    INTO v_chain_status, v_admin_confirmed
    FROM public.premium_payments p
   WHERE p.id = p_payment_id AND p.order_id = p_order_id
   FOR UPDATE;
  IF NOT FOUND OR v_chain_status <> 'confirmed' THEN
    RAISE EXCEPTION 'On-chain payment is not confirmed';
  END IF;
  IF v_order_status NOT IN ('payment_detected', 'paid') THEN
    RAISE EXCEPTION 'Premium order is not awaiting payment confirmation';
  END IF;

  UPDATE public.premium_payments
     SET admin_confirmed = true,
         admin_confirmed_at = COALESCE(admin_confirmed_at, now())
   WHERE id = p_payment_id;

  IF v_order_status = 'payment_detected' THEN
    UPDATE public.premium_orders
       SET status = 'paid', updated_at = now()
     WHERE id = p_order_id AND status = 'payment_detected';

    INSERT INTO public.premium_order_logs (
      order_id, actor_id, action, old_status, new_status, note
    ) VALUES (
      p_order_id, p_actor_id, 'admin_confirmed_payment',
      'payment_detected', 'paid',
      'Administrator confirmed the already chain-verified GRAM payment.'
    );
  END IF;

  RETURN QUERY SELECT p_order_id, 'paid'::text, v_admin_confirmed;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_complete_premium_delivery(
  p_order_id uuid,
  p_actor_id uuid,
  p_delivery_reference text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS TABLE(order_id uuid, order_no text, status text, already_completed boolean)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_status text;
  v_order_no text;
  v_recipient text;
  v_plan_name text;
  v_delivery_id uuid;
BEGIN
  IF p_actor_id IS DISTINCT FROM '0744f173-3f36-438f-b265-9cb3be95ad78'::uuid THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  IF p_delivery_reference IS NOT NULL AND length(p_delivery_reference) > 512 THEN
    RAISE EXCEPTION 'Delivery reference is too long';
  END IF;
  IF p_note IS NOT NULL AND length(p_note) > 2000 THEN
    RAISE EXCEPTION 'Delivery note is too long';
  END IF;

  SELECT o.status, o.order_no, o.recipient_username, o.plan_name
    INTO v_order_status, v_order_no, v_recipient, v_plan_name
    FROM public.premium_orders o
   WHERE o.id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Premium order not found'; END IF;

  IF v_order_status = 'completed' THEN
    RETURN QUERY SELECT p_order_id, v_order_no, 'completed'::text, true;
    RETURN;
  END IF;
  IF v_order_status NOT IN ('paid', 'processing') THEN
    RAISE EXCEPTION 'Payment must be confirmed before Premium delivery';
  END IF;

  SELECT d.id INTO v_delivery_id
    FROM public.premium_delivery_logs d
   WHERE d.order_id = p_order_id
   ORDER BY d.created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_delivery_id IS NULL THEN
    INSERT INTO public.premium_delivery_logs (
      order_id, recipient_username, plan_name, delivery_method,
      delivery_reference, operator_id, delivered_at, delivery_status, note
    ) VALUES (
      p_order_id, v_recipient, v_plan_name, 'manual_telegram',
      nullif(btrim(p_delivery_reference), ''), p_actor_id, now(),
      'completed', nullif(btrim(p_note), '')
    );
  ELSE
    UPDATE public.premium_delivery_logs
       SET delivery_reference = COALESCE(nullif(btrim(p_delivery_reference), ''), delivery_reference),
           operator_id = p_actor_id,
           delivered_at = now(),
           delivery_status = 'completed',
           note = COALESCE(nullif(btrim(p_note), ''), note)
     WHERE id = v_delivery_id;
  END IF;

  UPDATE public.premium_orders
     SET status = 'completed', completed_at = now(), updated_at = now()
   WHERE id = p_order_id AND status IN ('paid', 'processing');

  INSERT INTO public.premium_order_logs (
    order_id, actor_id, action, old_status, new_status, note
  ) VALUES (
    p_order_id, p_actor_id, 'manual_premium_delivery_completed',
    v_order_status, 'completed',
    COALESCE(nullif(btrim(p_note), ''), 'Manually activated by administrator.')
  );

  RETURN QUERY SELECT p_order_id, v_order_no, 'completed'::text, false;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_confirm_premium_gram_payment(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_confirm_premium_gram_payment(uuid, uuid, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.admin_complete_premium_delivery(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_complete_premium_delivery(uuid, uuid, text, text)
  TO service_role;
