alter table public.products add column if not exists product_metadata jsonb not null default '{}'::jsonb;
