ALTER TABLE public.manual_product_orders
  ADD COLUMN IF NOT EXISTS payment_address text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS manual_product_orders_status_created_idx
  ON public.manual_product_orders (status, created_at DESC);

COMMENT ON COLUMN public.manual_product_orders.payment_address IS
  'Receiving wallet snapshot locked when the buyer creates the manual product order.';
COMMENT ON COLUMN public.manual_product_orders.expires_at IS
  'Payment deadline snapshot for the manual product order.';
