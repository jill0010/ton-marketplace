create table if not exists public.marketplace_source_listings (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('getgems','fragment')),
  source_item_id text not null,
  item_type text not null check (item_type in ('username','phone_number','gift')),
  listing_kind text not null check (listing_kind in ('auction','fixed_price')),
  title text not null check (length(title) between 1 and 256),
  source_url text not null check (source_url ~ '^https://'),
  image_url text check (image_url is null or image_url ~ '^https://'),
  currency text not null default 'TON' check (currency in ('TON','GRAM')),
  current_price_nano numeric check (current_price_nano is null or current_price_nano >= 0),
  minimum_bid_nano numeric check (minimum_bid_nano is null or minimum_bid_nano > 0),
  auction_ends_at timestamptz,
  source_status text not null default 'active' check (source_status in ('active','sold','ended','unavailable','paused')),
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_item_id)
);
create index if not exists marketplace_source_listings_category_fresh_idx
  on public.marketplace_source_listings (item_type, synced_at desc)
  where source_status = 'active';
create index if not exists marketplace_source_listings_source_fresh_idx
  on public.marketplace_source_listings (source, synced_at desc);
alter table public.marketplace_source_listings enable row level security;
revoke all on public.marketplace_source_listings from anon, authenticated;
grant select on public.marketplace_source_listings to anon, authenticated;
drop policy if exists "Public can read fresh active marketplace source listings" on public.marketplace_source_listings;
create policy "Public can read fresh active marketplace source listings"
  on public.marketplace_source_listings
  for select to anon, authenticated
  using (source_status = 'active' and synced_at >= now() - interval '10 minutes');
revoke insert, update, delete on public.marketplace_source_listings from anon, authenticated;

create table if not exists public.marketplace_catalog_sync_runs (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('getgems','fragment')),
  status text not null check (status in ('running','succeeded','partial','failed','disabled')),
  items_seen integer not null default 0 check (items_seen >= 0),
  items_upserted integer not null default 0 check (items_upserted >= 0),
  categories jsonb not null default '{}'::jsonb check (jsonb_typeof(categories) = 'object'),
  error_code text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table public.marketplace_catalog_sync_runs enable row level security;
revoke all on public.marketplace_catalog_sync_runs from anon, authenticated;
