-- =============================================================================
-- FULL SCHEMA RECONCILIATION (safe / idempotent)
-- Project: lxfdhnwjmtfbawznivbu
--
-- Purpose: bring a partially migrated live database in line with the application
-- schema expected by repository.ts, map.ts, auth/session.ts, intelligence/*,
-- and API routes — without resetting, wiping, or recreating the database.
--
-- This file concatenates every incremental migration in order. All statements
-- use IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS so re-running
-- is safe and does not destroy existing clients, sessions, or users.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- BEGIN 20260724160000_auth_profiles_rls.sql
-- ---------------------------------------------------------------------------
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

-- END 20260724160000_auth_profiles_rls.sql

-- ---------------------------------------------------------------------------
-- BEGIN 20260724170000_client_archive_delete.sql
-- ---------------------------------------------------------------------------
-- ID-020: Archive, restore, and permanently delete clients.
-- Soft-archive via archived_at / archived_by; hard delete is atomic via CASCADE + RPC.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.clients
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

comment on column public.clients.archived_at is
  'When set, the client is archived (soft). Coaching records are retained.';
comment on column public.clients.archived_by is
  'auth.users id of the coach who archived the client.';

-- Keep status in sync for existing rows that may already use status = Archived.
update public.clients
set status = 'Archived'
where archived_at is not null
  and status is distinct from 'Archived';

create index if not exists clients_coach_id_archived_at_idx
  on public.clients (coach_id, archived_at);

-- ---------------------------------------------------------------------------
-- Helpers: ownership + active (non-archived) checks
-- ---------------------------------------------------------------------------
create or replace function public.client_belongs_to_coach(p_client_id uuid, p_coach_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.clients c
    where c.id = p_client_id and c.coach_id = p_coach_id
  );
$$;

create or replace function public.client_is_active_for_coach(p_client_id uuid, p_coach_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.clients c
    where c.id = p_client_id
      and c.coach_id = p_coach_id
      and c.archived_at is null
  );
$$;

revoke all on function public.client_belongs_to_coach(uuid, uuid) from public;
grant execute on function public.client_belongs_to_coach(uuid, uuid) to authenticated;

revoke all on function public.client_is_active_for_coach(uuid, uuid) from public;
grant execute on function public.client_is_active_for_coach(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Archive / restore (security definer; ownership from auth.uid())
-- ---------------------------------------------------------------------------
create or replace function public.archive_client(p_client_id uuid)
returns public.clients
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := auth.uid();
  v_row public.clients;
begin
  if v_coach_id is null then
    raise exception 'Authentication required.';
  end if;

  update public.clients
  set
    archived_at = coalesce(archived_at, now()),
    archived_by = coalesce(archived_by, v_coach_id),
    status = 'Archived',
    updated_at = now()
  where id = p_client_id
    and coach_id = v_coach_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'not found';
  end if;

  return v_row;
end;
$$;

create or replace function public.restore_client(p_client_id uuid)
returns public.clients
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := auth.uid();
  v_row public.clients;
begin
  if v_coach_id is null then
    raise exception 'Authentication required.';
  end if;

  update public.clients
  set
    archived_at = null,
    archived_by = null,
    status = 'Active',
    updated_at = now()
  where id = p_client_id
    and coach_id = v_coach_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'not found';
  end if;

  return v_row;
end;
$$;

-- Atomic permanent deletion. Explicitly removes dependents, then the client.
-- Only deletes rows owned by auth.uid(); never touches another coach's data.
create or replace function public.permanently_delete_client(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := auth.uid();
  v_deleted integer;
begin
  if v_coach_id is null then
    raise exception 'Authentication required.';
  end if;

  if to_regclass('public.coaching_reports') is not null then
    delete from public.coaching_reports
    where client_id = p_client_id
      and coach_id = v_coach_id;
  end if;

  if to_regclass('public.sessions') is not null then
    delete from public.sessions
    where client_id = p_client_id
      and coach_id = v_coach_id;
  end if;

  if to_regclass('public.client_items') is not null then
    delete from public.client_items
    where client_id = p_client_id
      and coach_id = v_coach_id;
  end if;

  delete from public.clients
  where id = p_client_id
    and coach_id = v_coach_id;

  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'not found';
  end if;
end;
$$;

revoke all on function public.archive_client(uuid) from public;
grant execute on function public.archive_client(uuid) to authenticated;

revoke all on function public.restore_client(uuid) from public;
grant execute on function public.restore_client(uuid) to authenticated;

revoke all on function public.permanently_delete_client(uuid) from public;
grant execute on function public.permanently_delete_client(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: block new coaching activity on archived clients
-- SELECT / DELETE of own rows remain allowed (read-only workspace + cleanup).
-- ---------------------------------------------------------------------------
drop policy if exists "Sessions insert own" on public.sessions;
create policy "Sessions insert own" on public.sessions
  for insert to authenticated
  with check (
    coach_id = auth.uid()
    and public.client_is_active_for_coach(client_id, coach_id)
  );

drop policy if exists "Sessions update own" on public.sessions;
create policy "Sessions update own" on public.sessions
  for update to authenticated
  using (coach_id = auth.uid())
  with check (
    coach_id = auth.uid()
    and public.client_is_active_for_coach(client_id, coach_id)
  );

drop policy if exists "Client items insert own" on public.client_items;
create policy "Client items insert own" on public.client_items
  for insert to authenticated
  with check (
    coach_id = auth.uid()
    and public.client_is_active_for_coach(client_id, coach_id)
  );

drop policy if exists "Client items update own" on public.client_items;
create policy "Client items update own" on public.client_items
  for update to authenticated
  using (coach_id = auth.uid())
  with check (
    coach_id = auth.uid()
    and public.client_is_active_for_coach(client_id, coach_id)
  );

-- coaching_reports is optional until 20260724190000 creates it if missing.
do $$
begin
  if to_regclass('public.coaching_reports') is null then
    return;
  end if;

  execute 'drop policy if exists "Coaching reports insert own" on public.coaching_reports';
  execute $policy$
    create policy "Coaching reports insert own" on public.coaching_reports
      for insert to authenticated
      with check (
        coach_id = auth.uid()
        and public.client_is_active_for_coach(client_id, coach_id)
      )
  $policy$;

  execute 'drop policy if exists "Coaching reports update own" on public.coaching_reports';
  execute $policy$
    create policy "Coaching reports update own" on public.coaching_reports
      for update to authenticated
      using (coach_id = auth.uid())
      with check (
        coach_id = auth.uid()
        and public.client_is_active_for_coach(client_id, coach_id)
      )
  $policy$;
end $$;

-- Clients UPDATE / DELETE policies already require coach_id = auth.uid().
-- No change needed for archive/restore/delete ownership.

-- END 20260724170000_client_archive_delete.sql

-- ---------------------------------------------------------------------------
-- BEGIN 20260724180000_clients_email.sql
-- ---------------------------------------------------------------------------
-- Add optional client email for coach contact details.
-- Reuses existing clients.name, organisation, role, current_focus columns.

alter table public.clients
  add column if not exists email text;

comment on column public.clients.email is
  'Optional contact email for the coaching client.';

-- END 20260724180000_clients_email.sql

-- ---------------------------------------------------------------------------
-- BEGIN 20260724190000_permanent_delete_explicit_cascade.sql
-- ---------------------------------------------------------------------------
-- ID-020 follow-up: make permanent delete reliable without depending on
-- PostgREST RPC visibility alone. Explicitly remove dependents, then the client.
-- Safe to re-run.

alter table public.clients
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

-- Ensure FK cascades exist for known child tables (idempotent where supported).
-- sessions
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'sessions'
  ) then
    begin
      alter table public.sessions
        drop constraint if exists sessions_client_id_fkey;
    exception when undefined_object then
      null;
    end;
    alter table public.sessions
      add constraint sessions_client_id_fkey
      foreign key (client_id) references public.clients(id) on delete cascade;
  end if;
end $$;

-- client_items
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'client_items'
  ) then
    begin
      alter table public.client_items
        drop constraint if exists client_items_client_id_fkey;
    exception when undefined_object then
      null;
    end;
    alter table public.client_items
      add constraint client_items_client_id_fkey
      foreign key (client_id) references public.clients(id) on delete cascade;
  end if;
end $$;

-- coaching_reports (create if missing, then enforce cascade)
create table if not exists public.coaching_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  report_type text not null check (report_type in ('progress', 'final')),
  selected_session_ids uuid[] not null default '{}',
  approved_content jsonb not null,
  approval_status text not null default 'approved' check (approval_status in ('draft', 'approved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.permanently_delete_client(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := auth.uid();
  v_deleted integer;
begin
  if v_coach_id is null then
    raise exception 'Authentication required.';
  end if;

  -- Explicit child cleanup (works even when CASCADE was never applied).
  if to_regclass('public.coaching_reports') is not null then
    delete from public.coaching_reports
    where client_id = p_client_id
      and coach_id = v_coach_id;
  end if;

  if to_regclass('public.sessions') is not null then
    delete from public.sessions
    where client_id = p_client_id
      and coach_id = v_coach_id;
  end if;

  if to_regclass('public.client_items') is not null then
    delete from public.client_items
    where client_id = p_client_id
      and coach_id = v_coach_id;
  end if;

  delete from public.clients
  where id = p_client_id
    and coach_id = v_coach_id;

  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'not found';
  end if;
end;
$$;

create or replace function public.archive_client(p_client_id uuid)
returns public.clients
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := auth.uid();
  v_row public.clients;
begin
  if v_coach_id is null then
    raise exception 'Authentication required.';
  end if;

  update public.clients
  set
    archived_at = coalesce(archived_at, now()),
    archived_by = coalesce(archived_by, v_coach_id),
    status = 'Archived',
    updated_at = now()
  where id = p_client_id
    and coach_id = v_coach_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'not found';
  end if;

  return v_row;
end;
$$;

create or replace function public.restore_client(p_client_id uuid)
returns public.clients
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := auth.uid();
  v_row public.clients;
begin
  if v_coach_id is null then
    raise exception 'Authentication required.';
  end if;

  update public.clients
  set
    archived_at = null,
    archived_by = null,
    status = 'Active',
    updated_at = now()
  where id = p_client_id
    and coach_id = v_coach_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'not found';
  end if;

  return v_row;
end;
$$;

revoke all on function public.permanently_delete_client(uuid) from public;
grant execute on function public.permanently_delete_client(uuid) to authenticated;

revoke all on function public.archive_client(uuid) from public;
grant execute on function public.archive_client(uuid) to authenticated;

revoke all on function public.restore_client(uuid) from public;
grant execute on function public.restore_client(uuid) to authenticated;

-- Reload PostgREST schema cache so RPCs become visible immediately.
notify pgrst, 'reload schema';

-- END 20260724190000_permanent_delete_explicit_cascade.sql

-- ---------------------------------------------------------------------------
-- BEGIN 20260725113000_sessions_ai_summary_approved.sql
-- ---------------------------------------------------------------------------
-- Persist whether the coach has approved AI summary sections for the permanent record.
-- Required by sessionToRow / create-client (initial blank session insert).

alter table public.sessions
  add column if not exists ai_summary_approved boolean not null default false;

comment on column public.sessions.ai_summary_approved is
  'True once the coach has reviewed/approved AI sections for the permanent record.';

-- Existing persisted AI content was already part of the coaching record.
update public.sessions
set ai_summary_approved = true
where ai_summary_approved = false
  and (
    coalesce(trim(ai_draft_summary), '') <> ''
    or coalesce(trim(summary), '') <> ''
    or coalesce(trim(emerging_themes), '') <> ''
    or coalesce(trim(agreed_actions), '') <> ''
  );

notify pgrst, 'reload schema';

-- END 20260725113000_sessions_ai_summary_approved.sql

-- ---------------------------------------------------------------------------
-- BEGIN 20260725120000_session_workflow_foundation.sql
-- ---------------------------------------------------------------------------
-- Phase 1: session coaching journey foundation.
-- Safe, additive only — does not wipe or reset existing data.

-- Session lifecycle + scheduling metadata
alter table public.sessions add column if not exists status text not null default 'planned';
alter table public.sessions add column if not exists title text;
alter table public.sessions add column if not exists duration_minutes integer not null default 60;
alter table public.sessions add column if not exists location text;
alter table public.sessions add column if not exists completed_at timestamptz;
alter table public.sessions add column if not exists notes_saved_at timestamptz;
alter table public.sessions add column if not exists summary_status text not null default 'not_generated';

-- Live coaching extras
alter table public.sessions add column if not exists commitments text;
alter table public.sessions add column if not exists parking_lot text;
alter table public.sessions add column if not exists outcomes text;

-- Structured preparation (belongs to the session)
alter table public.sessions add column if not exists prep_purpose text;
alter table public.sessions add column if not exists prep_topics text;
alter table public.sessions add column if not exists prep_questions text;
alter table public.sessions add column if not exists prep_commitments_review text;
alter table public.sessions add column if not exists prep_risks text;
alter table public.sessions add column if not exists prep_private_notes text;

-- Structured private coach reflection
alter table public.sessions add column if not exists reflect_what_shifted text;
alter table public.sessions add column if not exists reflect_what_surprised text;
alter table public.sessions add column if not exists reflect_what_worked text;
alter table public.sessions add column if not exists reflect_differently text;
alter table public.sessions add column if not exists reflect_professional_learning text;
alter table public.sessions add column if not exists reflect_private text;

-- Constrain statuses (compatible with existing rows after backfill)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sessions_status_check'
  ) then
    alter table public.sessions
      add constraint sessions_status_check
      check (status in (
        'planned',
        'prepared',
        'in_progress',
        'awaiting_completion',
        'completed'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'sessions_summary_status_check'
  ) then
    alter table public.sessions
      add constraint sessions_summary_status_check
      check (summary_status in ('not_generated', 'draft', 'approved'));
  end if;
end $$;

-- Backfill lifecycle from existing content without overwriting richer states.
update public.sessions
set summary_status = case
  when ai_summary_approved = true
    and (
      coalesce(trim(ai_draft_summary), '') <> ''
      or coalesce(trim(summary), '') <> ''
    ) then 'approved'
  when coalesce(trim(ai_draft_summary), '') <> ''
    or coalesce(trim(summary), '') <> ''
    or coalesce(trim(emerging_themes), '') <> ''
    or coalesce(trim(agreed_actions), '') <> ''
    then 'draft'
  else 'not_generated'
end
where summary_status = 'not_generated'
  or summary_status is null;

update public.sessions
set status = case
  when status is distinct from 'planned' then status
  when ai_summary_approved = true
    or coalesce(trim(ai_draft_summary), '') <> ''
    or coalesce(trim(summary), '') <> ''
    then 'completed'
  when coalesce(trim(notes), '') <> '' then 'awaiting_completion'
  when coalesce(trim(preparation), '') <> ''
    or coalesce(trim(prep_purpose), '') <> ''
    then 'prepared'
  else 'planned'
end
where status = 'planned';

update public.sessions
set completed_at = coalesce(completed_at, updated_at, now())
where status = 'completed'
  and completed_at is null;

update public.sessions
set notes_saved_at = coalesce(notes_saved_at, updated_at)
where coalesce(trim(notes), '') <> ''
  and notes_saved_at is null;

-- Seed structured prep from legacy freeform preparation when empty.
update public.sessions
set prep_private_notes = preparation
where coalesce(trim(preparation), '') <> ''
  and coalesce(trim(prep_private_notes), '') = ''
  and coalesce(trim(prep_purpose), '') = '';

-- Seed private reflection from legacy private notes when empty.
update public.sessions
set reflect_private = coalesce(nullif(trim(private_notes), ''), nullif(trim(reflection), ''))
where coalesce(trim(reflect_private), '') = ''
  and (
    coalesce(trim(private_notes), '') <> ''
    or coalesce(trim(reflection), '') <> ''
  );

-- Actions linked to a session (nullable for legacy client-level actions)
alter table public.client_items add column if not exists session_id uuid references public.sessions(id) on delete set null;
alter table public.client_items add column if not exists owner text;

create index if not exists client_items_session_id_idx on public.client_items (session_id);
create index if not exists sessions_client_id_status_idx on public.sessions (client_id, status);
create index if not exists sessions_starts_at_idx on public.sessions (starts_at);

comment on column public.sessions.status is
  'Coaching journey stage: planned → prepared → in_progress → awaiting_completion → completed';
comment on column public.sessions.summary_status is
  'AI/coach summary state: not_generated | draft | approved';
comment on column public.client_items.session_id is
  'Optional session link for actions created in a session workspace';

notify pgrst, 'reload schema';

-- END 20260725120000_session_workflow_foundation.sql

-- ---------------------------------------------------------------------------
-- BEGIN 20260725140000_development_intelligence.sql
-- ---------------------------------------------------------------------------
-- Development Intelligence Platform: cumulative, evidence-based intelligence.
-- Additive only — preserves existing clients, sessions and coaching records.
--
-- Ownership model (existing): public.clients.id (uuid PK), owned by coach_id
-- (uuid → auth.users). Helper public.client_belongs_to_coach(uuid, uuid) is
-- defined in earlier migrations; recreate it here so this file is safe when
-- those helpers are missing from a partially migrated database.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Required before intelligence RLS policies. Idempotent; matches
-- 20260724160000_auth_profiles_rls.sql / 20260724170000_client_archive_delete.sql.
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
-- 6.1 intelligence_items
-- ---------------------------------------------------------------------------
create table if not exists public.intelligence_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  category text not null,
  title text not null,
  description text,
  status text not null default 'proposed',
  confidence_score numeric,
  confidence_label text,
  source_type text,
  first_identified_at timestamptz,
  last_updated_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  is_locked boolean not null default false,
  coach_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint intelligence_items_category_check check (category in (
    'strength',
    'value',
    'motivator',
    'goal',
    'purpose',
    'limiting_belief',
    'empowering_belief',
    'behaviour_pattern',
    'emotional_pattern',
    'communication_style',
    'decision_style',
    'learning_preference',
    'recurring_theme',
    'development_opportunity',
    'risk_indicator',
    'breakthrough',
    'relationship_observation'
  )),
  constraint intelligence_items_status_check check (status in (
    'proposed',
    'approved',
    'rejected',
    'archived'
  )),
  constraint intelligence_items_confidence_score_check check (
    confidence_score is null
    or (confidence_score >= 0 and confidence_score <= 100)
  ),
  constraint intelligence_items_confidence_label_check check (
    confidence_label is null
    or confidence_label in (
      'early signal',
      'emerging',
      'supported',
      'strongly supported'
    )
  )
);

create index if not exists intelligence_items_user_id_idx
  on public.intelligence_items (user_id);
create index if not exists intelligence_items_client_id_idx
  on public.intelligence_items (client_id);
create index if not exists intelligence_items_status_idx
  on public.intelligence_items (status);
create index if not exists intelligence_items_category_idx
  on public.intelligence_items (category);
create index if not exists intelligence_items_user_client_status_idx
  on public.intelligence_items (user_id, client_id, status);

drop trigger if exists intelligence_items_set_updated_at on public.intelligence_items;
create trigger intelligence_items_set_updated_at
  before update on public.intelligence_items
  for each row execute function public.set_updated_at();

comment on table public.intelligence_items is
  'Living cumulative development intelligence for a person. AI output starts as proposed and requires coach validation.';
comment on column public.intelligence_items.status is
  'proposed | approved | rejected | archived — never auto-approved from AI.';
comment on column public.intelligence_items.confidence_label is
  'early signal | emerging | supported | strongly supported';

-- ---------------------------------------------------------------------------
-- 6.2 intelligence_evidence
-- ---------------------------------------------------------------------------
create table if not exists public.intelligence_evidence (
  id uuid primary key default gen_random_uuid(),
  intelligence_item_id uuid not null
    references public.intelligence_items(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  evidence_text text not null,
  evidence_type text,
  source_excerpt text,
  occurred_at timestamptz,
  created_at timestamptz not null default now(),
  created_by text,
  is_redacted boolean not null default false,
  constraint intelligence_evidence_type_check check (
    evidence_type is null
    or evidence_type in (
      'session_note',
      'coach_observation',
      'client_statement',
      'reflection',
      'commitment',
      'preparation',
      'manual_entry',
      'AI_interpretation'
    )
  )
);

create index if not exists intelligence_evidence_item_id_idx
  on public.intelligence_evidence (intelligence_item_id);
create index if not exists intelligence_evidence_session_id_idx
  on public.intelligence_evidence (session_id);
create index if not exists intelligence_evidence_user_id_idx
  on public.intelligence_evidence (user_id);

comment on table public.intelligence_evidence is
  'Explainable evidence behind an intelligence item. Session deletion clears the link but does not destroy approved intelligence.';
comment on column public.intelligence_evidence.evidence_type is
  'Includes AI_interpretation which always requires coach validation.';

-- ---------------------------------------------------------------------------
-- 6.3 session_intelligence_reviews
-- ---------------------------------------------------------------------------
create table if not exists public.session_intelligence_reviews (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  review_status text not null default 'pending',
  generated_at timestamptz,
  reviewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_intelligence_reviews_status_check check (review_status in (
    'pending',
    'in_review',
    'approved',
    'partially_approved',
    'rejected',
    'completed'
  )),
  constraint session_intelligence_reviews_session_unique unique (session_id)
);

create index if not exists session_intelligence_reviews_user_id_idx
  on public.session_intelligence_reviews (user_id);
create index if not exists session_intelligence_reviews_client_id_idx
  on public.session_intelligence_reviews (client_id);
create index if not exists session_intelligence_reviews_status_idx
  on public.session_intelligence_reviews (review_status);

drop trigger if exists session_intelligence_reviews_set_updated_at
  on public.session_intelligence_reviews;
create trigger session_intelligence_reviews_set_updated_at
  before update on public.session_intelligence_reviews
  for each row execute function public.set_updated_at();

comment on table public.session_intelligence_reviews is
  'Review state for proposed intelligence generated after a session.';

-- ---------------------------------------------------------------------------
-- 6.4 question_insights
-- ---------------------------------------------------------------------------
create table if not exists public.question_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  question_text text not null,
  question_type text,
  source text,
  effectiveness_rating integer,
  coach_notes text,
  created_at timestamptz not null default now(),
  constraint question_insights_source_check check (
    source is null
    or source in ('coach', 'AI_suggested', 'template', 'previous_session')
  ),
  constraint question_insights_effectiveness_check check (
    effectiveness_rating is null
    or (effectiveness_rating >= 1 and effectiveness_rating <= 5)
  )
);

create index if not exists question_insights_user_id_idx
  on public.question_insights (user_id);
create index if not exists question_insights_client_id_idx
  on public.question_insights (client_id);
create index if not exists question_insights_session_id_idx
  on public.question_insights (session_id);

comment on table public.question_insights is
  'Questions used or recommended for a person. Effectiveness is coach judgement only.';

-- ---------------------------------------------------------------------------
-- 6.5 person_progress_signals
-- ---------------------------------------------------------------------------
create table if not exists public.person_progress_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  signal_name text not null,
  direction text,
  score numeric,
  coach_validated boolean not null default false,
  evidence_summary text,
  recorded_at timestamptz not null default now(),
  constraint person_progress_signals_direction_check check (
    direction is null
    or direction in ('improving', 'stable', 'declining', 'unclear')
  )
);

create index if not exists person_progress_signals_user_id_idx
  on public.person_progress_signals (user_id);
create index if not exists person_progress_signals_client_id_idx
  on public.person_progress_signals (client_id);
create index if not exists person_progress_signals_session_id_idx
  on public.person_progress_signals (session_id);

comment on table public.person_progress_signals is
  'Development signals over time — not psychometric assessments.';

-- ---------------------------------------------------------------------------
-- 6.6 intelligence_audit_log
-- ---------------------------------------------------------------------------
create table if not exists public.intelligence_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists intelligence_audit_log_user_id_idx
  on public.intelligence_audit_log (user_id);
create index if not exists intelligence_audit_log_entity_idx
  on public.intelligence_audit_log (entity_type, entity_id);

comment on table public.intelligence_audit_log is
  'Audit trail for intelligence proposals, approvals, edits, locks and evidence changes.';

-- ---------------------------------------------------------------------------
-- Row Level Security — owner-only via auth.uid()
-- ---------------------------------------------------------------------------
alter table public.intelligence_items enable row level security;
alter table public.intelligence_evidence enable row level security;
alter table public.session_intelligence_reviews enable row level security;
alter table public.question_insights enable row level security;
alter table public.person_progress_signals enable row level security;
alter table public.intelligence_audit_log enable row level security;

drop policy if exists "Intelligence items select own" on public.intelligence_items;
create policy "Intelligence items select own" on public.intelligence_items
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "Intelligence items insert own" on public.intelligence_items;
create policy "Intelligence items insert own" on public.intelligence_items
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );
drop policy if exists "Intelligence items update own" on public.intelligence_items;
create policy "Intelligence items update own" on public.intelligence_items
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );
drop policy if exists "Intelligence items delete own" on public.intelligence_items;
create policy "Intelligence items delete own" on public.intelligence_items
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "Intelligence evidence select own" on public.intelligence_evidence;
create policy "Intelligence evidence select own" on public.intelligence_evidence
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "Intelligence evidence insert own" on public.intelligence_evidence;
create policy "Intelligence evidence insert own" on public.intelligence_evidence
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Intelligence evidence update own" on public.intelligence_evidence;
create policy "Intelligence evidence update own" on public.intelligence_evidence
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop policy if exists "Intelligence evidence delete own" on public.intelligence_evidence;
create policy "Intelligence evidence delete own" on public.intelligence_evidence
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "Session intelligence reviews select own" on public.session_intelligence_reviews;
create policy "Session intelligence reviews select own" on public.session_intelligence_reviews
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "Session intelligence reviews insert own" on public.session_intelligence_reviews;
create policy "Session intelligence reviews insert own" on public.session_intelligence_reviews
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );
drop policy if exists "Session intelligence reviews update own" on public.session_intelligence_reviews;
create policy "Session intelligence reviews update own" on public.session_intelligence_reviews
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );
drop policy if exists "Session intelligence reviews delete own" on public.session_intelligence_reviews;
create policy "Session intelligence reviews delete own" on public.session_intelligence_reviews
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "Question insights select own" on public.question_insights;
create policy "Question insights select own" on public.question_insights
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "Question insights insert own" on public.question_insights;
create policy "Question insights insert own" on public.question_insights
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );
drop policy if exists "Question insights update own" on public.question_insights;
create policy "Question insights update own" on public.question_insights
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );
drop policy if exists "Question insights delete own" on public.question_insights;
create policy "Question insights delete own" on public.question_insights
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "Progress signals select own" on public.person_progress_signals;
create policy "Progress signals select own" on public.person_progress_signals
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "Progress signals insert own" on public.person_progress_signals;
create policy "Progress signals insert own" on public.person_progress_signals
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );
drop policy if exists "Progress signals update own" on public.person_progress_signals;
create policy "Progress signals update own" on public.person_progress_signals
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );
drop policy if exists "Progress signals delete own" on public.person_progress_signals;
create policy "Progress signals delete own" on public.person_progress_signals
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "Intelligence audit select own" on public.intelligence_audit_log;
create policy "Intelligence audit select own" on public.intelligence_audit_log
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "Intelligence audit insert own" on public.intelligence_audit_log;
create policy "Intelligence audit insert own" on public.intelligence_audit_log
  for insert to authenticated with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Extend permanent delete to clean intelligence tables (additive)
-- ---------------------------------------------------------------------------
create or replace function public.permanently_delete_client(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := auth.uid();
  v_deleted integer;
begin
  if v_coach_id is null then
    raise exception 'Authentication required.';
  end if;

  if to_regclass('public.intelligence_audit_log') is not null then
    delete from public.intelligence_audit_log
    where user_id = v_coach_id
      and (
        entity_id = p_client_id
        or entity_id in (
          select id from public.intelligence_items
          where client_id = p_client_id and user_id = v_coach_id
        )
      );
  end if;

  if to_regclass('public.intelligence_evidence') is not null then
    delete from public.intelligence_evidence
    where user_id = v_coach_id
      and intelligence_item_id in (
        select id from public.intelligence_items
        where client_id = p_client_id and user_id = v_coach_id
      );
  end if;

  if to_regclass('public.session_intelligence_reviews') is not null then
    delete from public.session_intelligence_reviews
    where client_id = p_client_id and user_id = v_coach_id;
  end if;

  if to_regclass('public.question_insights') is not null then
    delete from public.question_insights
    where client_id = p_client_id and user_id = v_coach_id;
  end if;

  if to_regclass('public.person_progress_signals') is not null then
    delete from public.person_progress_signals
    where client_id = p_client_id and user_id = v_coach_id;
  end if;

  if to_regclass('public.intelligence_items') is not null then
    delete from public.intelligence_items
    where client_id = p_client_id and user_id = v_coach_id;
  end if;

  if to_regclass('public.coaching_reports') is not null then
    delete from public.coaching_reports
    where client_id = p_client_id and coach_id = v_coach_id;
  end if;

  if to_regclass('public.sessions') is not null then
    delete from public.sessions
    where client_id = p_client_id and coach_id = v_coach_id;
  end if;

  if to_regclass('public.client_items') is not null then
    delete from public.client_items
    where client_id = p_client_id and coach_id = v_coach_id;
  end if;

  delete from public.clients
  where id = p_client_id and coach_id = v_coach_id;

  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'not found';
  end if;
end;
$$;

revoke all on function public.permanently_delete_client(uuid) from public;
grant execute on function public.permanently_delete_client(uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260725140000_development_intelligence.sql

-- ---------------------------------------------------------------------------
-- BEGIN 20260725150000_development_updates.sql
-- ---------------------------------------------------------------------------
-- Development Updates: one session-level update replacing individual insight approval.
-- Additive only — does not delete intelligence_items or remove legacy columns.

-- ---------------------------------------------------------------------------
-- Helpers (idempotent)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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
-- Living development profile (one per person)
-- ---------------------------------------------------------------------------
create table if not exists public.development_profiles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  current_focus text,
  strengths jsonb not null default '[]'::jsonb,
  "values" jsonb not null default '[]'::jsonb,
  motivators jsonb not null default '[]'::jsonb,
  emerging_themes jsonb not null default '[]'::jsonb,
  growth_areas jsonb not null default '[]'::jsonb,
  coaching_preferences jsonb not null default '[]'::jsonb,
  beliefs jsonb not null default '[]'::jsonb,
  patterns jsonb not null default '[]'::jsonb,
  commitments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint development_profiles_client_unique unique (client_id)
);

create index if not exists development_profiles_coach_id_idx
  on public.development_profiles (coach_id);

drop trigger if exists development_profiles_set_updated_at on public.development_profiles;
create trigger development_profiles_set_updated_at
  before update on public.development_profiles
  for each row execute function public.set_updated_at();

alter table public.development_profiles enable row level security;

drop policy if exists "Development profiles select own" on public.development_profiles;
create policy "Development profiles select own" on public.development_profiles
  for select to authenticated
  using (public.client_belongs_to_coach(client_id, auth.uid()));

drop policy if exists "Development profiles insert own" on public.development_profiles;
create policy "Development profiles insert own" on public.development_profiles
  for insert to authenticated
  with check (
    coach_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );

drop policy if exists "Development profiles update own" on public.development_profiles;
create policy "Development profiles update own" on public.development_profiles
  for update to authenticated
  using (public.client_belongs_to_coach(client_id, auth.uid()))
  with check (
    coach_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );

drop policy if exists "Development profiles delete own" on public.development_profiles;
create policy "Development profiles delete own" on public.development_profiles
  for delete to authenticated
  using (public.client_belongs_to_coach(client_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- Development updates (one per session)
-- ---------------------------------------------------------------------------
create table if not exists public.development_updates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'draft',
  conversation_summary text,
  proposed_changes jsonb not null default '{}'::jsonb,
  edited_changes jsonb,
  applied_changes jsonb,
  evidence_summary jsonb not null default '[]'::jsonb,
  has_meaningful_changes boolean not null default true,
  coach_note text,
  generated_at timestamptz,
  reviewed_at timestamptz,
  applied_at timestamptz,
  discarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint development_updates_status_check check (
    status in (
      'draft',
      'ready_for_review',
      'applied',
      'discarded',
      'failed'
    )
  ),
  constraint development_updates_session_unique unique (session_id)
);

create index if not exists development_updates_client_id_idx
  on public.development_updates (client_id);
create index if not exists development_updates_coach_id_idx
  on public.development_updates (coach_id);
create index if not exists development_updates_status_idx
  on public.development_updates (status);

drop trigger if exists development_updates_set_updated_at on public.development_updates;
create trigger development_updates_set_updated_at
  before update on public.development_updates
  for each row execute function public.set_updated_at();

alter table public.development_updates enable row level security;

drop policy if exists "Development updates select own" on public.development_updates;
create policy "Development updates select own" on public.development_updates
  for select to authenticated
  using (public.client_belongs_to_coach(client_id, auth.uid()));

drop policy if exists "Development updates insert own" on public.development_updates;
create policy "Development updates insert own" on public.development_updates
  for insert to authenticated
  with check (
    coach_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );

drop policy if exists "Development updates update own" on public.development_updates;
create policy "Development updates update own" on public.development_updates
  for update to authenticated
  using (public.client_belongs_to_coach(client_id, auth.uid()))
  with check (
    coach_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );

drop policy if exists "Development updates delete own" on public.development_updates;
create policy "Development updates delete own" on public.development_updates
  for delete to authenticated
  using (public.client_belongs_to_coach(client_id, auth.uid()));

-- Table privileges (RLS still enforces row ownership).
grant select, insert, update, delete on public.development_profiles to authenticated;
grant select, insert, update, delete on public.development_updates to authenticated;
grant all on public.development_profiles to service_role;
grant all on public.development_updates to service_role;

-- ---------------------------------------------------------------------------
-- Profile merge helpers
-- ---------------------------------------------------------------------------
create or replace function public.normalise_profile_value(p_value text)
returns text
language sql
immutable
as $$
  select lower(trim(coalesce(p_value, '')));
$$;

revoke all on function public.normalise_profile_value(text) from public;

create or replace function public.merge_profile_entries(
  p_existing jsonb,
  p_changes jsonb
)
returns jsonb
language plpgsql
volatile
as $$
declare
  v_result jsonb := coalesce(p_existing, '[]'::jsonb);
  v_add jsonb;
  v_update jsonb;
  v_remove jsonb;
  v_item jsonb;
  v_id text;
  v_value text;
  v_norm text;
  v_exists boolean;
  v_idx int;
  v_new jsonb;
begin
  if p_changes is null or p_changes = 'null'::jsonb then
    return v_result;
  end if;

  v_remove := coalesce(p_changes->'remove', '[]'::jsonb);
  if jsonb_typeof(v_remove) = 'array' then
    for v_item in select * from jsonb_array_elements(v_remove)
    loop
      v_id := coalesce(v_item->>'id', '');
      v_value := coalesce(v_item->>'value', v_item #>> '{}');
      v_norm := public.normalise_profile_value(v_value);
      select coalesce(jsonb_agg(elem), '[]'::jsonb)
        into v_result
      from jsonb_array_elements(v_result) elem
      where not (
        (v_id <> '' and elem->>'id' = v_id)
        or (v_norm <> '' and public.normalise_profile_value(elem->>'value') = v_norm)
      );
      v_result := coalesce(v_result, '[]'::jsonb);
    end loop;
  end if;

  v_update := coalesce(p_changes->'update', '[]'::jsonb);
  if jsonb_typeof(v_update) = 'array' then
    for v_item in select * from jsonb_array_elements(v_update)
    loop
      v_id := coalesce(v_item->>'id', '');
      v_value := trim(coalesce(v_item->>'value', ''));
      if v_value = '' then
        continue;
      end if;
      v_idx := null;
      for i in 0 .. greatest(jsonb_array_length(v_result) - 1, -1)
      loop
        if (v_id <> '' and v_result->i->>'id' = v_id)
          or public.normalise_profile_value(v_result->i->>'value')
             = public.normalise_profile_value(v_value)
        then
          v_idx := i;
          exit;
        end if;
      end loop;
      if v_idx is not null then
        v_new := v_result->v_idx;
        v_new := jsonb_set(v_new, '{value}', to_jsonb(v_value), true);
        if v_item ? 'status' then
          v_new := jsonb_set(v_new, '{status}', to_jsonb(coalesce(v_item->>'status', 'emerging')), true);
        end if;
        if v_item ? 'reason' then
          v_new := jsonb_set(v_new, '{reason}', to_jsonb(coalesce(v_item->>'reason', '')), true);
        end if;
        v_result := jsonb_set(v_result, array[v_idx::text], v_new, false);
      end if;
    end loop;
  end if;

  v_add := coalesce(p_changes->'add', '[]'::jsonb);
  if jsonb_typeof(v_add) = 'array' then
    for v_item in select * from jsonb_array_elements(v_add)
    loop
      v_value := trim(coalesce(v_item->>'value', ''));
      if v_value = '' then
        continue;
      end if;
      v_norm := public.normalise_profile_value(v_value);
      v_exists := exists (
        select 1
        from jsonb_array_elements(v_result) elem
        where public.normalise_profile_value(elem->>'value') = v_norm
      );
      if v_exists then
        -- Strengthen status on duplicate rather than inserting again.
        select coalesce(jsonb_agg(
          case
            when public.normalise_profile_value(elem->>'value') = v_norm then
              jsonb_set(
                jsonb_set(
                  elem,
                  '{status}',
                  to_jsonb(coalesce(nullif(v_item->>'status', ''), elem->>'status', 'supported')),
                  true
                ),
                '{reason}',
                to_jsonb(coalesce(nullif(v_item->>'reason', ''), elem->>'reason', '')),
                true
              )
            else elem
          end
        ), '[]'::jsonb)
          into v_result
        from jsonb_array_elements(v_result) elem;
      else
        v_result := v_result || jsonb_build_array(
          jsonb_build_object(
            'id', coalesce(nullif(v_item->>'id', ''), gen_random_uuid()::text),
            'value', v_value,
            'status', coalesce(nullif(v_item->>'status', ''), 'emerging'),
            'reason', coalesce(v_item->>'reason', '')
          )
        );
      end if;
    end loop;
  end if;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke all on function public.merge_profile_entries(jsonb, jsonb) from public;

create or replace function public.merge_commitment_entries(
  p_existing jsonb,
  p_changes jsonb
)
returns jsonb
language plpgsql
volatile
as $$
declare
  v_result jsonb := coalesce(p_existing, '[]'::jsonb);
  v_add jsonb;
  v_complete jsonb;
  v_remove jsonb;
  v_item jsonb;
  v_id text;
  v_value text;
  v_norm text;
  v_exists boolean;
begin
  if p_changes is null or p_changes = 'null'::jsonb then
    return v_result;
  end if;

  v_remove := coalesce(p_changes->'remove', '[]'::jsonb);
  if jsonb_typeof(v_remove) = 'array' then
    for v_item in select * from jsonb_array_elements(v_remove)
    loop
      v_id := coalesce(v_item->>'id', '');
      v_value := coalesce(v_item->>'value', v_item #>> '{}');
      v_norm := public.normalise_profile_value(v_value);
      select coalesce(jsonb_agg(elem), '[]'::jsonb)
        into v_result
      from jsonb_array_elements(v_result) elem
      where not (
        (v_id <> '' and elem->>'id' = v_id)
        or (v_norm <> '' and public.normalise_profile_value(elem->>'value') = v_norm)
      );
      v_result := coalesce(v_result, '[]'::jsonb);
    end loop;
  end if;

  v_complete := coalesce(p_changes->'complete', '[]'::jsonb);
  if jsonb_typeof(v_complete) = 'array' then
    for v_item in select * from jsonb_array_elements(v_complete)
    loop
      v_id := coalesce(v_item->>'id', '');
      v_value := coalesce(v_item->>'value', '');
      v_norm := public.normalise_profile_value(v_value);
      select coalesce(jsonb_agg(
        case
          when (v_id <> '' and elem->>'id' = v_id)
            or (v_norm <> '' and public.normalise_profile_value(elem->>'value') = v_norm)
          then jsonb_set(elem, '{status}', '"complete"'::jsonb, true)
          else elem
        end
      ), '[]'::jsonb)
        into v_result
      from jsonb_array_elements(v_result) elem;
    end loop;
  end if;

  v_add := coalesce(p_changes->'add', '[]'::jsonb);
  if jsonb_typeof(v_add) = 'array' then
    for v_item in select * from jsonb_array_elements(v_add)
    loop
      v_value := trim(coalesce(v_item->>'value', ''));
      if v_value = '' then
        continue;
      end if;
      v_norm := public.normalise_profile_value(v_value);
      v_exists := exists (
        select 1
        from jsonb_array_elements(v_result) elem
        where public.normalise_profile_value(elem->>'value') = v_norm
          and coalesce(elem->>'status', 'open') <> 'complete'
      );
      if not v_exists then
        v_result := v_result || jsonb_build_array(
          jsonb_build_object(
            'id', coalesce(nullif(v_item->>'id', ''), gen_random_uuid()::text),
            'value', v_value,
            'dueDate', v_item->'dueDate',
            'status', 'open'
          )
        );
      end if;
    end loop;
  end if;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke all on function public.merge_commitment_entries(jsonb, jsonb) from public;

-- ---------------------------------------------------------------------------
-- Apply development update (atomic, idempotent)
-- ---------------------------------------------------------------------------
create or replace function public.apply_development_update(p_update_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := auth.uid();
  v_update public.development_updates%rowtype;
  v_profile public.development_profiles%rowtype;
  v_changes jsonb;
  v_before jsonb;
  v_after jsonb;
begin
  if v_coach_id is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_update
  from public.development_updates
  where id = p_update_id
  for update;

  if not found then
    raise exception 'Development update not found.';
  end if;

  if not public.client_belongs_to_coach(v_update.client_id, v_coach_id) then
    raise exception 'Not authorised.';
  end if;

  if v_update.status = 'applied' then
    return jsonb_build_object(
      'ok', true,
      'alreadyApplied', true,
      'updateId', v_update.id,
      'status', v_update.status
    );
  end if;

  if v_update.status = 'discarded' then
    raise exception 'This development update has been discarded.';
  end if;

  if v_update.status not in ('ready_for_review', 'draft') then
    raise exception 'This development update cannot be applied.';
  end if;

  v_changes := coalesce(v_update.edited_changes, v_update.proposed_changes, '{}'::jsonb);

  insert into public.development_profiles (
    client_id,
    coach_id,
    current_focus
  )
  values (
    v_update.client_id,
    v_coach_id,
    null
  )
  on conflict (client_id) do nothing;

  select * into v_profile
  from public.development_profiles
  where client_id = v_update.client_id
  for update;

  v_before := to_jsonb(v_profile);

  update public.development_profiles
  set
    current_focus = case
      when v_changes ? 'currentFocus'
        and coalesce(v_changes->'currentFocus'->>'action', 'replace') = 'replace'
        and nullif(trim(coalesce(v_changes->'currentFocus'->>'value', '')), '') is not null
      then trim(v_changes->'currentFocus'->>'value')
      else current_focus
    end,
    strengths = public.merge_profile_entries(strengths, v_changes->'strengths'),
    "values" = public.merge_profile_entries("values", v_changes->'values'),
    motivators = public.merge_profile_entries(motivators, v_changes->'motivators'),
    emerging_themes = public.merge_profile_entries(emerging_themes, v_changes->'emergingThemes'),
    growth_areas = public.merge_profile_entries(growth_areas, v_changes->'growthAreas'),
    coaching_preferences = public.merge_profile_entries(
      coaching_preferences,
      v_changes->'coachingPreferences'
    ),
    beliefs = public.merge_profile_entries(beliefs, v_changes->'beliefs'),
    patterns = public.merge_profile_entries(patterns, v_changes->'patterns'),
    commitments = public.merge_commitment_entries(commitments, v_changes->'commitments'),
    updated_at = now()
  where id = v_profile.id
  returning * into v_profile;

  -- Keep clients.current_focus aligned when focus changes.
  if v_changes ? 'currentFocus'
    and nullif(trim(coalesce(v_changes->'currentFocus'->>'value', '')), '') is not null
  then
    update public.clients
    set
      current_focus = trim(v_changes->'currentFocus'->>'value'),
      updated_at = now()
    where id = v_update.client_id
      and coach_id = v_coach_id;
  end if;

  update public.development_updates
  set
    status = 'applied',
    applied_changes = v_changes,
    reviewed_at = coalesce(reviewed_at, now()),
    applied_at = now(),
    updated_at = now()
  where id = v_update.id
  returning * into v_update;

  v_after := to_jsonb(v_profile);

  if to_regclass('public.intelligence_audit_log') is not null then
    insert into public.intelligence_audit_log (
      user_id,
      entity_type,
      entity_id,
      action,
      previous_value,
      new_value
    )
    values (
      v_coach_id,
      'development_update',
      v_update.id,
      'development_update_applied',
      jsonb_build_object(
        'update', jsonb_build_object(
          'id', v_update.id,
          'sessionId', v_update.session_id,
          'clientId', v_update.client_id,
          'status', 'ready_for_review'
        ),
        'profile', v_before
      ),
      jsonb_build_object(
        'update', jsonb_build_object(
          'id', v_update.id,
          'sessionId', v_update.session_id,
          'clientId', v_update.client_id,
          'status', 'applied',
          'appliedChanges', v_changes
        ),
        'profile', v_after
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'alreadyApplied', false,
    'updateId', v_update.id,
    'status', v_update.status,
    'profileId', v_profile.id
  );
end;
$$;

revoke all on function public.apply_development_update(uuid) from public;
grant execute on function public.apply_development_update(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Discard development update
-- ---------------------------------------------------------------------------
create or replace function public.discard_development_update(p_update_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := auth.uid();
  v_update public.development_updates%rowtype;
begin
  if v_coach_id is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_update
  from public.development_updates
  where id = p_update_id
  for update;

  if not found then
    raise exception 'Development update not found.';
  end if;

  if not public.client_belongs_to_coach(v_update.client_id, v_coach_id) then
    raise exception 'Not authorised.';
  end if;

  if v_update.status = 'applied' then
    raise exception 'This development update has already been applied.';
  end if;

  if v_update.status = 'discarded' then
    return jsonb_build_object(
      'ok', true,
      'alreadyDiscarded', true,
      'updateId', v_update.id,
      'status', v_update.status
    );
  end if;

  update public.development_updates
  set
    status = 'discarded',
    discarded_at = now(),
    reviewed_at = coalesce(reviewed_at, now()),
    updated_at = now()
  where id = v_update.id
  returning * into v_update;

  if to_regclass('public.intelligence_audit_log') is not null then
    insert into public.intelligence_audit_log (
      user_id,
      entity_type,
      entity_id,
      action,
      previous_value,
      new_value
    )
    values (
      v_coach_id,
      'development_update',
      v_update.id,
      'development_update_discarded',
      jsonb_build_object(
        'id', v_update.id,
        'sessionId', v_update.session_id,
        'clientId', v_update.client_id
      ),
      jsonb_build_object(
        'id', v_update.id,
        'status', 'discarded',
        'discardedAt', v_update.discarded_at
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'alreadyDiscarded', false,
    'updateId', v_update.id,
    'status', v_update.status
  );
end;
$$;

revoke all on function public.discard_development_update(uuid) from public;
grant execute on function public.discard_development_update(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- One-time seed: build living profiles from approved intelligence only.
-- Non-destructive:
--   - never deletes or updates intelligence_items / evidence / audit
--   - never imports rejected or unapproved items
--   - only fills empty profile arrays (safe if migration is re-run)
--   - skips clients that already have an applied development update
-- ---------------------------------------------------------------------------
insert into public.development_profiles (client_id, coach_id, current_focus)
select
  c.id,
  c.coach_id,
  nullif(trim(coalesce(c.current_focus, '')), '')
from public.clients c
where not exists (
  select 1 from public.development_profiles dp where dp.client_id = c.id
)
on conflict (client_id) do nothing;

update public.development_profiles dp
set
  strengths = case
    when coalesce(jsonb_array_length(dp.strengths), 0) = 0 then coalesce((
      select jsonb_agg(distinct_entry order by distinct_entry->>'value')
      from (
        select distinct on (public.normalise_profile_value(ii.title))
          jsonb_build_object(
            'id', ii.id::text,
            'value', ii.title,
            'status', case
              when ii.confidence_label in ('supported', 'strongly supported') then 'supported'
              else 'emerging'
            end,
            'reason', coalesce(ii.description, '')
          ) as distinct_entry
        from public.intelligence_items ii
        where ii.client_id = dp.client_id
          and ii.user_id = dp.coach_id
          and ii.status = 'approved'
          and ii.archived_at is null
          and ii.category = 'strength'
        order by public.normalise_profile_value(ii.title), ii.approved_at desc nulls last
      ) seeded
    ), '[]'::jsonb)
    else dp.strengths
  end,
  "values" = case
    when coalesce(jsonb_array_length(dp."values"), 0) = 0 then coalesce((
      select jsonb_agg(distinct_entry order by distinct_entry->>'value')
      from (
        select distinct on (public.normalise_profile_value(ii.title))
          jsonb_build_object(
            'id', ii.id::text,
            'value', ii.title,
            'status', case
              when ii.confidence_label in ('supported', 'strongly supported') then 'supported'
              else 'emerging'
            end,
            'reason', coalesce(ii.description, '')
          ) as distinct_entry
        from public.intelligence_items ii
        where ii.client_id = dp.client_id
          and ii.user_id = dp.coach_id
          and ii.status = 'approved'
          and ii.archived_at is null
          and ii.category = 'value'
        order by public.normalise_profile_value(ii.title), ii.approved_at desc nulls last
      ) seeded
    ), '[]'::jsonb)
    else dp."values"
  end,
  motivators = case
    when coalesce(jsonb_array_length(dp.motivators), 0) = 0 then coalesce((
      select jsonb_agg(distinct_entry order by distinct_entry->>'value')
      from (
        select distinct on (public.normalise_profile_value(ii.title))
          jsonb_build_object(
            'id', ii.id::text,
            'value', ii.title,
            'status', case
              when ii.confidence_label in ('supported', 'strongly supported') then 'supported'
              else 'emerging'
            end,
            'reason', coalesce(ii.description, '')
          ) as distinct_entry
        from public.intelligence_items ii
        where ii.client_id = dp.client_id
          and ii.user_id = dp.coach_id
          and ii.status = 'approved'
          and ii.archived_at is null
          and ii.category = 'motivator'
        order by public.normalise_profile_value(ii.title), ii.approved_at desc nulls last
      ) seeded
    ), '[]'::jsonb)
    else dp.motivators
  end,
  emerging_themes = case
    when coalesce(jsonb_array_length(dp.emerging_themes), 0) = 0 then coalesce((
      select jsonb_agg(distinct_entry order by distinct_entry->>'value')
      from (
        select distinct on (public.normalise_profile_value(ii.title))
          jsonb_build_object(
            'id', ii.id::text,
            'value', ii.title,
            'status', case
              when ii.confidence_label in ('supported', 'strongly supported') then 'supported'
              else 'emerging'
            end,
            'reason', coalesce(ii.description, '')
          ) as distinct_entry
        from public.intelligence_items ii
        where ii.client_id = dp.client_id
          and ii.user_id = dp.coach_id
          and ii.status = 'approved'
          and ii.archived_at is null
          and ii.category = 'recurring_theme'
        order by public.normalise_profile_value(ii.title), ii.approved_at desc nulls last
      ) seeded
    ), '[]'::jsonb)
    else dp.emerging_themes
  end,
  growth_areas = case
    when coalesce(jsonb_array_length(dp.growth_areas), 0) = 0 then coalesce((
      select jsonb_agg(distinct_entry order by distinct_entry->>'value')
      from (
        select distinct on (public.normalise_profile_value(ii.title))
          jsonb_build_object(
            'id', ii.id::text,
            'value', ii.title,
            'status', case
              when ii.confidence_label in ('supported', 'strongly supported') then 'supported'
              else 'emerging'
            end,
            'reason', coalesce(ii.description, '')
          ) as distinct_entry
        from public.intelligence_items ii
        where ii.client_id = dp.client_id
          and ii.user_id = dp.coach_id
          and ii.status = 'approved'
          and ii.archived_at is null
          and ii.category in ('development_opportunity', 'goal', 'purpose')
        order by public.normalise_profile_value(ii.title), ii.approved_at desc nulls last
      ) seeded
    ), '[]'::jsonb)
    else dp.growth_areas
  end,
  coaching_preferences = case
    when coalesce(jsonb_array_length(dp.coaching_preferences), 0) = 0 then coalesce((
      select jsonb_agg(distinct_entry order by distinct_entry->>'value')
      from (
        select distinct on (public.normalise_profile_value(ii.title))
          jsonb_build_object(
            'id', ii.id::text,
            'value', ii.title,
            'status', case
              when ii.confidence_label in ('supported', 'strongly supported') then 'supported'
              else 'emerging'
            end,
            'reason', coalesce(ii.description, '')
          ) as distinct_entry
        from public.intelligence_items ii
        where ii.client_id = dp.client_id
          and ii.user_id = dp.coach_id
          and ii.status = 'approved'
          and ii.archived_at is null
          and ii.category in ('learning_preference', 'communication_style')
        order by public.normalise_profile_value(ii.title), ii.approved_at desc nulls last
      ) seeded
    ), '[]'::jsonb)
    else dp.coaching_preferences
  end,
  beliefs = case
    when coalesce(jsonb_array_length(dp.beliefs), 0) = 0 then coalesce((
      select jsonb_agg(distinct_entry order by distinct_entry->>'value')
      from (
        select distinct on (public.normalise_profile_value(ii.title))
          jsonb_build_object(
            'id', ii.id::text,
            'value', ii.title,
            'status', case
              when ii.confidence_label in ('supported', 'strongly supported') then 'supported'
              else 'emerging'
            end,
            'reason', coalesce(ii.description, '')
          ) as distinct_entry
        from public.intelligence_items ii
        where ii.client_id = dp.client_id
          and ii.user_id = dp.coach_id
          and ii.status = 'approved'
          and ii.archived_at is null
          and ii.category in ('limiting_belief', 'empowering_belief')
        order by public.normalise_profile_value(ii.title), ii.approved_at desc nulls last
      ) seeded
    ), '[]'::jsonb)
    else dp.beliefs
  end,
  patterns = case
    when coalesce(jsonb_array_length(dp.patterns), 0) = 0 then coalesce((
      select jsonb_agg(distinct_entry order by distinct_entry->>'value')
      from (
        select distinct on (public.normalise_profile_value(ii.title))
          jsonb_build_object(
            'id', ii.id::text,
            'value', ii.title,
            'status', case
              when ii.confidence_label in ('supported', 'strongly supported') then 'supported'
              else 'emerging'
            end,
            'reason', coalesce(ii.description, '')
          ) as distinct_entry
        from public.intelligence_items ii
        where ii.client_id = dp.client_id
          and ii.user_id = dp.coach_id
          and ii.status = 'approved'
          and ii.archived_at is null
          and ii.category in ('behaviour_pattern', 'emotional_pattern', 'decision_style')
        order by public.normalise_profile_value(ii.title), ii.approved_at desc nulls last
      ) seeded
    ), '[]'::jsonb)
    else dp.patterns
  end,
  current_focus = coalesce(
    nullif(trim(dp.current_focus), ''),
    (
      select ii.title
      from public.intelligence_items ii
      where ii.client_id = dp.client_id
        and ii.user_id = dp.coach_id
        and ii.status = 'approved'
        and ii.archived_at is null
        and ii.category in ('development_opportunity', 'goal')
      order by ii.confidence_score desc nulls last, ii.approved_at desc nulls last
      limit 1
    )
  ),
  updated_at = now()
where
  -- Only seed profiles that have not yet been refined by an applied update.
  not exists (
    select 1
    from public.development_updates du
    where du.client_id = dp.client_id
      and du.status = 'applied'
  )
  and exists (
    select 1
    from public.intelligence_items ii
    where ii.client_id = dp.client_id
      and ii.user_id = dp.coach_id
      and ii.status = 'approved'
      and ii.archived_at is null
  );

-- ---------------------------------------------------------------------------
-- Extend permanent delete
-- ---------------------------------------------------------------------------
create or replace function public.permanently_delete_client(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := auth.uid();
  v_deleted integer;
begin
  if v_coach_id is null then
    raise exception 'Authentication required.';
  end if;

  if to_regclass('public.intelligence_audit_log') is not null then
    delete from public.intelligence_audit_log
    where user_id = v_coach_id
      and (
        entity_id = p_client_id
        or entity_id in (
          select id from public.intelligence_items
          where client_id = p_client_id and user_id = v_coach_id
        )
        or entity_id in (
          select id from public.development_updates
          where client_id = p_client_id and coach_id = v_coach_id
        )
      );
  end if;

  if to_regclass('public.development_updates') is not null then
    delete from public.development_updates
    where client_id = p_client_id and coach_id = v_coach_id;
  end if;

  if to_regclass('public.development_profiles') is not null then
    delete from public.development_profiles
    where client_id = p_client_id and coach_id = v_coach_id;
  end if;

  if to_regclass('public.intelligence_evidence') is not null then
    delete from public.intelligence_evidence
    where user_id = v_coach_id
      and intelligence_item_id in (
        select id from public.intelligence_items
        where client_id = p_client_id and user_id = v_coach_id
      );
  end if;

  if to_regclass('public.session_intelligence_reviews') is not null then
    delete from public.session_intelligence_reviews
    where client_id = p_client_id and user_id = v_coach_id;
  end if;

  if to_regclass('public.question_insights') is not null then
    delete from public.question_insights
    where client_id = p_client_id and user_id = v_coach_id;
  end if;

  if to_regclass('public.person_progress_signals') is not null then
    delete from public.person_progress_signals
    where client_id = p_client_id and user_id = v_coach_id;
  end if;

  if to_regclass('public.intelligence_items') is not null then
    delete from public.intelligence_items
    where client_id = p_client_id and user_id = v_coach_id;
  end if;

  if to_regclass('public.coaching_reports') is not null then
    delete from public.coaching_reports
    where client_id = p_client_id and coach_id = v_coach_id;
  end if;

  if to_regclass('public.sessions') is not null then
    delete from public.sessions
    where client_id = p_client_id and coach_id = v_coach_id;
  end if;

  if to_regclass('public.client_items') is not null then
    delete from public.client_items
    where client_id = p_client_id and coach_id = v_coach_id;
  end if;

  delete from public.clients
  where id = p_client_id and coach_id = v_coach_id;

  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'not found';
  end if;
end;
$$;

revoke all on function public.permanently_delete_client(uuid) from public;
grant execute on function public.permanently_delete_client(uuid) to authenticated;

notify pgrst, 'reload schema';

-- END 20260725150000_development_updates.sql

-- ---------------------------------------------------------------------------
-- BEGIN 20260725180000_preparation_style_preferences.sql
-- ---------------------------------------------------------------------------
-- Coach preparation preferences (Release 1).
-- Additive only — existing coaches receive guided; existing clients keep null override.

-- Coach default preparation support level
alter table public.profiles
  add column if not exists preparation_style text not null default 'guided';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_preparation_style_check'
  ) then
    alter table public.profiles
      add constraint profiles_preparation_style_check
      check (preparation_style in ('minimal', 'guided', 'enhanced'));
  end if;
end $$;

-- Ensure any legacy nulls become guided without touching other profile fields.
update public.profiles
set preparation_style = 'guided'
where preparation_style is null
   or preparation_style not in ('minimal', 'guided', 'enhanced');

-- Optional client-level override (null = use coach default)
alter table public.clients
  add column if not exists preparation_style_override text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clients_preparation_style_override_check'
  ) then
    alter table public.clients
      add constraint clients_preparation_style_override_check
      check (
        preparation_style_override is null
        or preparation_style_override in ('minimal', 'guided', 'enhanced')
      );
  end if;
end $$;

-- Persisted AI preparation draft (associated with coach + client + session when present)
alter table public.sessions
  add column if not exists prep_ai_brief jsonb;

alter table public.sessions
  add column if not exists prep_ai_brief_generated_at timestamptz;

alter table public.sessions
  add column if not exists prep_ai_brief_style text;

alter table public.sessions
  add column if not exists prep_ai_brief_confirmed_at timestamptz;

alter table public.sessions
  add column if not exists prep_ai_brief_source_fingerprint text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sessions_prep_ai_brief_style_check'
  ) then
    alter table public.sessions
      add constraint sessions_prep_ai_brief_style_check
      check (
        prep_ai_brief_style is null
        or prep_ai_brief_style in ('minimal', 'guided', 'enhanced')
      );
  end if;
end $$;

comment on column public.profiles.preparation_style is
  'Coach default preparation support: minimal | guided | enhanced. Default guided.';

comment on column public.clients.preparation_style_override is
  'Optional per-client preparation style override. Null means use coach default.';

comment on column public.sessions.prep_ai_brief is
  'Coach-editable AI preparation draft. Regenerating replaces AI content only.';

-- Future enhancement (not implemented in Release 1):
-- Offer infrequent preference suggestions based on coach usage, with explicit
-- consent and no automatic changes. Coaches change preferences manually for now.
-- END 20260725180000_preparation_style_preferences.sql

-- Final PostgREST schema cache reload
notify pgrst, 'reload schema';
