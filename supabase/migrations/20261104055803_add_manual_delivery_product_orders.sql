alter table public.products
  add column if not exists delivery_mode text not null default 'escrow';

alter table public.products
  add constraint products_delivery_mode_check
  check (delivery_mode in ('escrow', 'manual'))
  not valid;

alter table public.products
  validate constraint products_delivery_mode_check;

create table if not exists public.manual_product_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  product_id uuid not null references public.products(id),
  buyer_wallet_raw text not null check (buyer_wallet_raw ~ '^-?[0-9]+:[0-9a-f]{64}$'),
  amount numeric not null check (amount > 0),
  currency text not null check (currency in ('TON','GRAM')),
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment','payment_confirmed','delivery_pending','delivered','cancelled','refunded','manual_review')),
  payment_tx_hash text unique,
  delivery_tx_hash text unique,
  admin_note text,
  paid_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manual_product_orders_product_status_idx
  on public.manual_product_orders(product_id, status, created_at desc);

alter table public.manual_product_orders enable row level security;

create policy "Admin can read manual product orders"
  on public.manual_product_orders for select to authenticated
  using ((select auth.uid()) = '0744f173-3f36-438f-b265-9cb3be95ad78'::uuid);

create policy "Admin can update manual product orders"
  on public.manual_product_orders for update to authenticated
  using ((select auth.uid()) = '0744f173-3f36-438f-b265-9cb3be95ad78'::uuid)
  with check ((select auth.uid()) = '0744f173-3f36-438f-b265-9cb3be95ad78'::uuid);

revoke all on public.manual_product_orders from anon, authenticated;
grant select, update on public.manual_product_orders to authenticated;
