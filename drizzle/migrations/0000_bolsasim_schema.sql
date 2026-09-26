create table public.portfolios (
  device_id text primary key,
  cash_eur numeric not null default 100000,
  finnhub_key text,
  created_at timestamptz not null default now()
);
create table public.positions (
  id uuid primary key default gen_random_uuid(),
  device_id text not null references public.portfolios(device_id) on delete cascade,
  symbol text not null, name text not null, type text not null default 'stock',
  currency text not null default 'USD',
  quantity numeric not null, avg_price numeric not null, cost_eur numeric not null,
  last_price numeric, last_price_at timestamptz,
  unique(device_id, symbol)
);
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  device_id text not null references public.portfolios(device_id) on delete cascade,
  symbol text not null, name text not null, side text not null,
  quantity numeric not null, price numeric not null, currency text not null,
  total_eur numeric not null, created_at timestamptz not null default now()
);
create table public.equity_snapshots (
  id uuid primary key default gen_random_uuid(),
  device_id text not null references public.portfolios(device_id) on delete cascade,
  value_eur numeric not null, created_at timestamptz not null default now()
);
create table public.watchlists (
  id uuid primary key default gen_random_uuid(),
  device_id text not null references public.portfolios(device_id) on delete cascade,
  name text not null, created_at timestamptz not null default now()
);
create table public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  symbol text not null, name text not null, type text not null default 'stock',
  unique(watchlist_id, symbol)
);
grant all on public.portfolios, public.positions, public.trades, public.equity_snapshots, public.watchlists, public.watchlist_items to service_role;
alter table public.portfolios enable row level security;
alter table public.positions enable row level security;
alter table public.trades enable row level security;
alter table public.equity_snapshots enable row level security;
alter table public.watchlists enable row level security;
alter table public.watchlist_items enable row level security;