create table if not exists public.user_profiles (
  account_key text primary key,
  display_name text not null default 'Paper Trader',
  username text not null default '',
  email text not null default '',
  bio text not null default '',
  avatar_url text not null default '',
  timezone text not null default 'UTC',
  risk_tier text not null default 'moderate',
  trading_style text not null default 'swing',
  offline_sync boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_trades (
  account_key text not null references public.user_profiles(account_key) on delete cascade,
  client_order_id text not null,
  broker_order_id text,
  strategy_id text,
  strategy_name text,
  strategy_version integer,
  symbol text not null,
  side text not null,
  qty double precision not null,
  filled double precision not null default 0,
  price double precision,
  limit_price double precision,
  status text not null,
  pnl double precision,
  submitted_at timestamptz,
  filled_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (account_key, client_order_id)
);

create index if not exists idx_user_trades_account_time
  on public.user_trades (account_key, submitted_at desc);

alter table public.user_profiles enable row level security;
alter table public.user_trades enable row level security;

revoke all on table public.user_profiles from anon, authenticated;
revoke all on table public.user_trades from anon, authenticated;
