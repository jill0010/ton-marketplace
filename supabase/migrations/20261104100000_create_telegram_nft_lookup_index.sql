create table if not exists public.telegram_nft_items (
  nft_address text primary key,
  asset_type text not null check (asset_type in ('username','phone_number')),
  collection_address text not null,
  nft_name text not null,
  normalized_identifier text not null,
  image_url text,
  description text not null default '',
  attributes jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);
create index if not exists telegram_nft_items_lookup_idx
  on public.telegram_nft_items (asset_type, normalized_identifier);
create index if not exists telegram_nft_items_collection_idx
  on public.telegram_nft_items (collection_address);
alter table public.telegram_nft_items enable row level security;

create table if not exists public.telegram_nft_index_sync_state (
  collection_address text primary key,
  asset_type text not null check (asset_type in ('username','phone_number')),
  cursor text,
  is_complete boolean not null default false,
  items_synced bigint not null default 0,
  last_synced_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.telegram_nft_index_sync_state enable row level security;
