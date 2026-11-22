create table if not exists public.fasttrader_store (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.fasttrader_store enable row level security;

revoke all on table public.fasttrader_store from anon, authenticated;
