create table if not exists public.marketplace_wallet_settings (
  id smallint primary key check (id = 1),
  custody_wallet_address text,
  platform_treasury_address text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.marketplace_wallet_setting_logs (
  id bigint generated always as identity primary key,
  previous_custody_wallet_address text,
  new_custody_wallet_address text,
  previous_platform_treasury_address text,
  new_platform_treasury_address text,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.marketplace_wallet_settings enable row level security;
alter table public.marketplace_wallet_setting_logs enable row level security;

revoke all on public.marketplace_wallet_settings from anon, authenticated;
revoke all on public.marketplace_wallet_setting_logs from anon, authenticated;
grant select, insert, update on public.marketplace_wallet_settings to authenticated;
grant select, insert on public.marketplace_wallet_setting_logs to authenticated;
grant usage, select on sequence public.marketplace_wallet_setting_logs_id_seq to authenticated;

drop policy if exists "marketplace wallet settings admin read" on public.marketplace_wallet_settings;
create policy "marketplace wallet settings admin read"
on public.marketplace_wallet_settings for select to authenticated
using ((select auth.uid()) = '0744f173-3f36-438f-b265-9cb3be95ad78'::uuid);

drop policy if exists "marketplace wallet settings admin insert" on public.marketplace_wallet_settings;
create policy "marketplace wallet settings admin insert"
on public.marketplace_wallet_settings for insert to authenticated
with check ((select auth.uid()) = '0744f173-3f36-438f-b265-9cb3be95ad78'::uuid);

drop policy if exists "marketplace wallet settings admin update" on public.marketplace_wallet_settings;
create policy "marketplace wallet settings admin update"
on public.marketplace_wallet_settings for update to authenticated
using ((select auth.uid()) = '0744f173-3f36-438f-b265-9cb3be95ad78'::uuid)
with check ((select auth.uid()) = '0744f173-3f36-438f-b265-9cb3be95ad78'::uuid);

drop policy if exists "marketplace wallet setting logs admin read" on public.marketplace_wallet_setting_logs;
create policy "marketplace wallet setting logs admin read"
on public.marketplace_wallet_setting_logs for select to authenticated
using ((select auth.uid()) = '0744f173-3f36-438f-b265-9cb3be95ad78'::uuid);

drop policy if exists "marketplace wallet setting logs admin insert" on public.marketplace_wallet_setting_logs;
create policy "marketplace wallet setting logs admin insert"
on public.marketplace_wallet_setting_logs for insert to authenticated
with check ((select auth.uid()) = '0744f173-3f36-438f-b265-9cb3be95ad78'::uuid);

insert into public.marketplace_wallet_settings (id)
values (1)
on conflict (id) do nothing;
