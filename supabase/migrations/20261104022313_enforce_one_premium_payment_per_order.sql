-- A Premium order can have only one accepted on-chain payment.
-- The unique transaction hash index prevents replay across orders; this index
-- also prevents concurrent verification requests from attaching two payments
-- to the same order.
CREATE UNIQUE INDEX IF NOT EXISTS premium_payments_order_id_key
  ON public.premium_payments (order_id);
