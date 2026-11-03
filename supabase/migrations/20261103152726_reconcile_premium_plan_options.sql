alter table public.premium_pricing
  drop constraint if exists premium_pricing_id_check;

alter table public.premium_pricing
  add constraint premium_pricing_id_check
  check (id in ('month', 'quarter', 'half-year', 'year'));

insert into public.premium_pricing (id, period, market_usd, gram_price, updated_at)
values ('month', '1 month', 4.29, 1.000000, now())
on conflict (id) do update
set period = excluded.period,
    market_usd = excluded.market_usd,
    updated_at = now();

update public.premium_pricing
set period = case id
      when 'quarter' then '3 months'
      when 'half-year' then '6 months'
      when 'year' then '12 months'
      else period
    end,
    market_usd = case id
      when 'quarter' then 10.99
      when 'half-year' then 14.99
      when 'year' then 27.99
      else market_usd
    end,
    updated_at = now()
where id in ('quarter', 'half-year', 'year');
