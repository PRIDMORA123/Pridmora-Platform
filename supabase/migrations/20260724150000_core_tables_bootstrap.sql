-- Core tables bootstrap for empty databases.
-- Creates only clients / sessions / client_items (historical baseline).
-- Profiles, RLS, helpers, coaching_reports, intelligence, org, and licence
-- remain in later migrations. No demo or organisation data.

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  organisation text,
  role text,
  status text not null default 'Active',
  next_session timestamptz,
  current_focus text,
  identity_summary text,
  coach_insight text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- App-compat columns present only in schema.sql (not added by later migrations).
alter table public.clients add column if not exists initials text;
alter table public.clients add column if not exists next_session_label text;

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  session_number integer not null default 1,
  session_date date,
  starts_at timestamptz,
  focus text,
  preparation text,
  notes text,
  private_notes text,
  -- Required before …113000 / …120000 UPDATEs (never ADD COLUMN elsewhere).
  ai_draft_summary text,
  emerging_themes text,
  strengths_observed text,
  values_becoming_visible text,
  professional_identity_development text,
  agreed_actions text,
  suggested_focus text,
  coach_reflection text,
  reflection text,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, session_number)
);

alter table public.sessions add column if not exists display_date text;
alter table public.sessions add column if not exists display_time text;
alter table public.sessions add column if not exists coaching_questions text;

create table if not exists public.client_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null
    check (item_type in ('strength','value','theme','goal','action','quote','journey')),
  title text not null,
  detail text,
  status text,
  evidence text,
  event_date text,
  created_at timestamptz not null default now()
);
