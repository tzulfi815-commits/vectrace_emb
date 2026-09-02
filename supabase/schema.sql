-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
-- CRM objects are stored as version-friendly JSON records while the CRM is evolving.
create table if not exists public.crm_records (
  collection text not null,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (collection, id)
);

create index if not exists crm_records_collection_updated_at_idx
  on public.crm_records (collection, updated_at);

alter table public.crm_records enable row level security;

-- Browser users get no direct table access. The protected CRM backend uses the secret key.
revoke all on public.crm_records from anon, authenticated;
grant select, insert, update, delete on public.crm_records to service_role;

-- Real CRM login roles. Each row is linked to exactly one Supabase Auth user.
create table if not exists public.crm_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('Admin', 'Caller', 'Designer')),
  designer_id text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.crm_profiles enable row level security;
revoke all on public.crm_profiles from anon, authenticated;
grant select, insert, update, delete on public.crm_profiles to service_role;
