alter table public.premium_orders
  add column if not exists user_id uuid references auth.users(id),
  add column if not exists payment_method text not null default 'GRAM',
  add column if not exists usd_amount numeric(12,2);

alter table public.premium_orders
  drop constraint if exists premium_orders_payment_method_check;
alter table public.premium_orders
  add constraint premium_orders_payment_method_check
  check (payment_method in ('GRAM', 'USDT_TRC20'));

create index if not exists premium_orders_user_created_idx
  on public.premium_orders (user_id, created_at desc);

alter table public.premium_payments
  add column if not exists telegram_notified_at timestamptz;

alter table public.premium_orders enable row level security;
alter table public.premium_payments enable row level security;

drop policy if exists premium_orders_user_select_own on public.premium_orders;
create policy premium_orders_user_select_own
  on public.premium_orders for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists premium_payments_user_select_own on public.premium_payments;
create policy premium_payments_user_select_own
  on public.premium_payments for select to authenticated
  using (
    exists (
      select 1 from public.premium_orders o
      where o.id = premium_payments.order_id
        and o.user_id = (select auth.uid())
    )
  );

update public.premium_pricing
set period = case id
  when 'year' then '12 months'
  when 'half-year' then '6 months'
  when 'quarter' then '3 months'
  else period
end,
market_usd = case id
  when 'year' then 28.99
  when 'half-year' then 15.99
  when 'quarter' then 11.99
  else market_usd
end,
updated_at = now()
where id in ('year', 'half-year', 'quarter');
