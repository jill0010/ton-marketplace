UPDATE public.products
SET currency = 'GRAM', updated_at = now()
WHERE currency = 'TON';
