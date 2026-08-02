-- ID-019: Authentication, profiles, ownership constraints, and RLS hardening.
-- Safe to apply on top of the existing schema.sql foundation.
-- public.coaching_reports is optional here (created later if missing in
-- 20260724190000); all coaching_reports DDL below is guarded.

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  professional_title text not null default 'Professional Coach',
  organisation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, professional_title, organisation)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      split_part(coalesce(new.email, 'coach'), '@', 1)
    ),
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'professional_title'), ''),
      'Professional Coach'
    ),
    nullif(trim(new.raw_user_meta_data->>'organisation'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for any existing auth users.
insert into public.profiles (id, full_name, professional_title)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
    split_part(coalesce(u.email, 'coach'), '@', 1)
  ),
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'professional_title'), ''),
    'Professional Coach'
  )
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Ownership helper: sessions / client_items must reference own clients
-- ---------------------------------------------------------------------------
create or replace function public.client_belongs_to_coach(p_client_id uuid, p_coach_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.coach_id = p_coach_id
  );
$$;

revoke all on function public.client_belongs_to_coach(uuid, uuid) from public;
grant execute on function public.client_belongs_to_coach(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Indexes for coach-scoped queries
-- ---------------------------------------------------------------------------
create index if not exists clients_coach_id_idx on public.clients (coach_id);
create index if not exists sessions_coach_id_idx on public.sessions (coach_id);
create index if not exists sessions_client_id_idx on public.sessions (client_id);
create index if not exists client_items_coach_id_idx on public.client_items (coach_id);
create index if not exists client_items_client_id_idx on public.client_items (client_id);

do $$
begin
  if to_regclass('public.coaching_reports') is not null then
    execute 'create index if not exists coaching_reports_coach_id_idx on public.coaching_reports (coach_id)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Option A — assign existing demo records to the first authenticated test coach.
-- Prefers enquiries@pridmora.com when present; otherwise the earliest non-demo user.
-- Leaves rows unchanged if no suitable coach exists yet (claimable after sign-up).
-- ---------------------------------------------------------------------------
do $$
declare
  demo_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
  target uuid;
begin
  select u.id
  into target
  from auth.users u
  where lower(u.email) = lower('enquiries@pridmora.com')
  limit 1;

  if target is null then
    select u.id
    into target
    from auth.users u
    where u.id <> demo_id
    order by u.created_at asc
    limit 1;
  end if;

  if target is null then
    raise notice 'ID-019: No target coach found for demo data reassignment. Rows remain on demo coach until claim.';
    return;
  end if;

  update public.clients
  set coach_id = target, updated_at = now()
  where coach_id = demo_id;

  update public.sessions
  set coach_id = target, updated_at = now()
  where coach_id = demo_id;

  update public.client_items
  set coach_id = target
  where coach_id = demo_id;

  if to_regclass('public.coaching_reports') is not null then
    update public.coaching_reports
    set coach_id = target, updated_at = now()
    where coach_id = demo_id;
  end if;

  raise notice 'ID-019: Demo coaching records reassigned to coach %', target;
end;
$$;

-- One-time claim for when the preferred test coach signs up after this migration.
create or replace function public.claim_legacy_demo_data(p_coach_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  demo_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
  moved integer := 0;
begin
  if p_coach_id is null or p_coach_id = demo_id then
    return 0;
  end if;

  -- Only the first real coach (or the preferred test email) may claim.
  if not exists (
    select 1 from auth.users u
    where u.id = p_coach_id
      and (
        lower(u.email) = lower('enquiries@pridmora.com')
        or not exists (
          select 1 from public.clients c where c.coach_id <> demo_id
        )
      )
  ) then
    return 0;
  end if;

  update public.clients
  set coach_id = p_coach_id, updated_at = now()
  where coach_id = demo_id;
  get diagnostics moved = row_count;

  update public.sessions
  set coach_id = p_coach_id, updated_at = now()
  where coach_id = demo_id;

  update public.client_items
  set coach_id = p_coach_id
  where coach_id = demo_id;

  if to_regclass('public.coaching_reports') is not null then
    update public.coaching_reports
    set coach_id = p_coach_id, updated_at = now()
    where coach_id = demo_id;
  end if;

  return moved;
end;
$$;

revoke all on function public.claim_legacy_demo_data(uuid) from public;
grant execute on function public.claim_legacy_demo_data(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "Profiles select own" on public.profiles;
drop policy if exists "Profiles insert own" on public.profiles;
drop policy if exists "Profiles update own" on public.profiles;
drop policy if exists "Profiles delete own" on public.profiles;

create policy "Profiles select own"
on public.profiles for select
to authenticated
using (id = auth.uid());

create policy "Profiles insert own"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

create policy "Profiles update own"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "Profiles delete own"
on public.profiles for delete
to authenticated
using (id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS: replace broad policies with explicit ownership policies
-- ---------------------------------------------------------------------------
drop policy if exists "Coaches manage own clients" on public.clients;
drop policy if exists "Clients select own" on public.clients;
drop policy if exists "Clients insert own" on public.clients;
drop policy if exists "Clients update own" on public.clients;
drop policy if exists "Clients delete own" on public.clients;

alter table public.clients enable row level security;

create policy "Clients select own"
on public.clients for select
to authenticated
using (coach_id = auth.uid());

create policy "Clients insert own"
on public.clients for insert
to authenticated
with check (coach_id = auth.uid());

create policy "Clients update own"
on public.clients for update
to authenticated
using (coach_id = auth.uid())
with check (coach_id = auth.uid());

create policy "Clients delete own"
on public.clients for delete
to authenticated
using (coach_id = auth.uid());

drop policy if exists "Coaches manage own sessions" on public.sessions;
drop policy if exists "Sessions select own" on public.sessions;
drop policy if exists "Sessions insert own" on public.sessions;
drop policy if exists "Sessions update own" on public.sessions;
drop policy if exists "Sessions delete own" on public.sessions;

alter table public.sessions enable row level security;

create policy "Sessions select own"
on public.sessions for select
to authenticated
using (coach_id = auth.uid());

create policy "Sessions insert own"
on public.sessions for insert
to authenticated
with check (
  coach_id = auth.uid()
  and public.client_belongs_to_coach(client_id, coach_id)
);

create policy "Sessions update own"
on public.sessions for update
to authenticated
using (coach_id = auth.uid())
with check (
  coach_id = auth.uid()
  and public.client_belongs_to_coach(client_id, coach_id)
);

create policy "Sessions delete own"
on public.sessions for delete
to authenticated
using (coach_id = auth.uid());

drop policy if exists "Coaches manage own client items" on public.client_items;
drop policy if exists "Client items select own" on public.client_items;
drop policy if exists "Client items insert own" on public.client_items;
drop policy if exists "Client items update own" on public.client_items;
drop policy if exists "Client items delete own" on public.client_items;

alter table public.client_items enable row level security;

create policy "Client items select own"
on public.client_items for select
to authenticated
using (coach_id = auth.uid());

create policy "Client items insert own"
on public.client_items for insert
to authenticated
with check (
  coach_id = auth.uid()
  and public.client_belongs_to_coach(client_id, coach_id)
);

create policy "Client items update own"
on public.client_items for update
to authenticated
using (coach_id = auth.uid())
with check (
  coach_id = auth.uid()
  and public.client_belongs_to_coach(client_id, coach_id)
);

create policy "Client items delete own"
on public.client_items for delete
to authenticated
using (coach_id = auth.uid());

-- coaching_reports may be absent on databases bootstrapped without schema.sql;
-- it is created later by 20260724190000_permanent_delete_explicit_cascade.sql.
do $$
begin
  if to_regclass('public.coaching_reports') is null then
    return;
  end if;

  execute 'drop policy if exists "Coaches manage own coaching reports" on public.coaching_reports';
  execute 'drop policy if exists "Coaching reports select own" on public.coaching_reports';
  execute 'drop policy if exists "Coaching reports insert own" on public.coaching_reports';
  execute 'drop policy if exists "Coaching reports update own" on public.coaching_reports';
  execute 'drop policy if exists "Coaching reports delete own" on public.coaching_reports';

  execute 'alter table public.coaching_reports enable row level security';

  execute $policy$
    create policy "Coaching reports select own"
    on public.coaching_reports for select
    to authenticated
    using (coach_id = auth.uid())
  $policy$;

  execute $policy$
    create policy "Coaching reports insert own"
    on public.coaching_reports for insert
    to authenticated
    with check (
      coach_id = auth.uid()
      and public.client_belongs_to_coach(client_id, coach_id)
    )
  $policy$;

  execute $policy$
    create policy "Coaching reports update own"
    on public.coaching_reports for update
    to authenticated
    using (coach_id = auth.uid())
    with check (
      coach_id = auth.uid()
      and public.client_belongs_to_coach(client_id, coach_id)
    )
  $policy$;

  execute $policy$
    create policy "Coaching reports delete own"
    on public.coaching_reports for delete
    to authenticated
    using (coach_id = auth.uid())
  $policy$;
end $$;
