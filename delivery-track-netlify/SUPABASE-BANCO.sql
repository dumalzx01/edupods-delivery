-- Execute uma unica vez no SQL Editor do projeto Supabase.
-- Os dados ficam privados: nenhuma policy publica e criada.
create table if not exists public.delivery_users (
  id text primary key,
  username text not null unique,
  name text not null,
  role text not null check (role in ('lojista', 'entregador')),
  password_hash text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.delivery_orders (
  id text primary key,
  share_token text not null unique,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.delivery_alerts (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists delivery_orders_updated_idx on public.delivery_orders(updated_at desc);
create index if not exists delivery_alerts_created_idx on public.delivery_alerts(created_at desc);
alter table public.delivery_users enable row level security;
alter table public.delivery_orders enable row level security;
alter table public.delivery_alerts enable row level security;
revoke all on public.delivery_users from anon, authenticated;
revoke all on public.delivery_orders from anon, authenticated;
revoke all on public.delivery_alerts from anon, authenticated;
