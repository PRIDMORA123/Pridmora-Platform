-- Production-ready starting schema for Supabase.
-- Apply only when authentication and data protection controls are ready.
--
-- Sessions store structured coaching records that support:
-- Prepare Next Session, Professional Identity Journey™,
-- Pattern Detection, and Final Coaching Report.
--
-- Each client may have unlimited sessions (unique per client_id + session_number).
-- Session History is loaded from this table; saves update a single session row only.

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  organisation text,
  role text,
  email text,
  status text not null default 'Active',
  next_session timestamptz,
  current_focus text,
  identity_summary text,
  coach_insight text,
  relationship_agreement jsonb,
  initial_conversation jsonb,
  supporting_context jsonb default '[]'::jsonb,
  preparation_style_override text
    check (
      preparation_style_override is null
      or preparation_style_override in ('minimal', 'guided', 'enhanced')
    ),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  session_number integer not null default 1,
  session_date date,
  starts_at timestamptz,
  status text not null default 'planned'
    check (status in ('planned','prepared','in_progress','paused','awaiting_completion','completed')),
  -- note: live DBs also receive timer columns via alter + migration 20260726130000
  title text,
  duration_minutes integer not null default 60,
  location text,
  focus text,
  preparation text,
  -- Structured preparation
  prep_purpose text,
  prep_topics text,
  prep_questions text,
  prep_commitments_review text,
  prep_risks text,
  prep_private_notes text,
  prep_ai_brief jsonb,
  prep_ai_brief_generated_at timestamptz,
  prep_ai_brief_style text
    check (
      prep_ai_brief_style is null
      or prep_ai_brief_style in ('minimal', 'guided', 'enhanced')
    ),
  prep_ai_brief_confirmed_at timestamptz,
  prep_ai_brief_source_fingerprint text,
  intelligence_mode text
    check (
      intelligence_mode is null
      or intelligence_mode in ('manual', 'assisted', 'comprehensive')
    ),
  intelligence_status text default 'idle'
    check (
      intelligence_status is null
      or intelligence_status in ('idle', 'preparing', 'ready', 'error')
    ),
  intelligence_sources jsonb default '[]'::jsonb,
  intelligence_last_refreshed_at timestamptz,
  intelligence_error_code text,
  -- Raw Session Notes
  notes text,
  commitments text,
  parking_lot text,
  notes_saved_at timestamptz,
  timer_elapsed_seconds integer not null default 0,
  timer_started_at timestamptz,
  session_started_at timestamptz,
  -- Coach Private Notes / structured reflection
  private_notes text,
  reflect_what_shifted text,
  reflect_what_surprised text,
  reflect_what_worked text,
  reflect_differently text,
  reflect_professional_learning text,
  reflect_private text,
  -- AI Draft Summary (Session Summary; coach-edited version stored)
  ai_draft_summary text,
  emerging_themes text,
  strengths_observed text,
  values_becoming_visible text,
  professional_identity_development text,
  agreed_actions text,
  outcomes text,
  suggested_focus text,
  -- AI Coach Reflection section (coach-edited version stored)
  coach_reflection text,
  summary_status text not null default 'not_generated'
    check (summary_status in ('not_generated','draft','approved')),
  -- True once the coach has reviewed/approved AI sections for the permanent record
  ai_summary_approved boolean not null default false,
  completed_at timestamptz,
  -- Legacy aliases retained for compatibility during migration
  reflection text,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, session_number)
);

create table if not exists public.client_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  item_type text not null check (item_type in ('strength','value','theme','goal','action','quote','journey')),
  title text not null,
  detail text,
  owner text,
  status text,
  evidence text,
  event_date text,
  created_at timestamptz not null default now()
);

-- RLS enabled and policies defined after profiles / helpers below.

-- Extend an existing sessions table without recreating it.
alter table public.sessions add column if not exists session_number integer not null default 1;
alter table public.sessions add column if not exists session_date date;
alter table public.sessions add column if not exists private_notes text;
alter table public.sessions add column if not exists ai_draft_summary text;
alter table public.sessions add column if not exists emerging_themes text;
alter table public.sessions add column if not exists strengths_observed text;
alter table public.sessions add column if not exists values_becoming_visible text;
alter table public.sessions add column if not exists professional_identity_development text;
alter table public.sessions add column if not exists agreed_actions text;
alter table public.sessions add column if not exists suggested_focus text;
alter table public.sessions add column if not exists coach_reflection text;
alter table public.sessions add column if not exists ai_summary_approved boolean not null default false;

-- Foundation compatibility with the existing app model (idempotent).
-- Keeps freeform display labels and coaching questions without redesigning the UI.
alter table public.clients add column if not exists initials text;
alter table public.clients add column if not exists next_session_label text;
alter table public.clients add column if not exists email text;
alter table public.clients add column if not exists archived_at timestamptz;
alter table public.clients add column if not exists archived_by uuid references auth.users(id) on delete set null;
alter table public.sessions add column if not exists display_date text;
alter table public.sessions add column if not exists display_time text;
alter table public.sessions add column if not exists coaching_questions text;
alter table public.sessions add column if not exists status text not null default 'planned';
alter table public.sessions add column if not exists title text;
alter table public.sessions add column if not exists duration_minutes integer not null default 60;
alter table public.sessions add column if not exists location text;
alter table public.sessions add column if not exists completed_at timestamptz;
alter table public.sessions add column if not exists notes_saved_at timestamptz;
alter table public.sessions add column if not exists timer_elapsed_seconds integer not null default 0;
alter table public.sessions add column if not exists timer_started_at timestamptz;
alter table public.sessions add column if not exists session_started_at timestamptz;
alter table public.sessions add column if not exists summary_status text not null default 'not_generated';
alter table public.sessions add column if not exists commitments text;
alter table public.sessions add column if not exists parking_lot text;
alter table public.sessions add column if not exists outcomes text;
alter table public.sessions add column if not exists prep_purpose text;
alter table public.sessions add column if not exists prep_topics text;
alter table public.sessions add column if not exists prep_questions text;
alter table public.sessions add column if not exists prep_commitments_review text;
alter table public.sessions add column if not exists prep_risks text;
alter table public.sessions add column if not exists prep_private_notes text;
alter table public.sessions add column if not exists workflow_migrated_at timestamptz;
alter table public.sessions add column if not exists reflect_what_shifted text;
alter table public.sessions add column if not exists reflect_what_surprised text;
alter table public.sessions add column if not exists reflect_what_worked text;
alter table public.sessions add column if not exists reflect_differently text;
alter table public.sessions add column if not exists reflect_professional_learning text;
alter table public.sessions add column if not exists reflect_private text;
alter table public.client_items add column if not exists session_id uuid references public.sessions(id) on delete set null;
alter table public.client_items add column if not exists owner text;

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

-- Approved coaching report versions (append-only; never overwrite previous approved reports).
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

-- Premium development reports (see migrations/20260726100000_development_reports.sql for full policies).
create table if not exists public.development_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('progress_snapshot', 'development_report', 'impact_summary')),
  audience text not null check (audience in ('coachee', 'coach', 'sponsor')),
  title text not null,
  reporting_period_start date,
  reporting_period_end date,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  coaching_purpose text,
  executive_summary text,
  progress_summary text,
  development_themes jsonb not null default '[]'::jsonb,
  evidence_items jsonb not null default '[]'::jsonb,
  commitments jsonb not null default '[]'::jsonb,
  future_priorities jsonb not null default '[]'::jsonb,
  coach_statement text,
  associated_indicators jsonb not null default '[]'::jsonb,
  impact_metrics jsonb,
  include_coach_statement boolean not null default false,
  parent_report_id uuid references public.development_reports(id) on delete set null,
  confidentiality_confirmed_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Coach profiles (1:1 with auth.users). Prefer migrations/ for incremental changes.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  professional_title text not null default 'Professional Coach',
  organisation text,
  preparation_style text not null default 'guided'
    check (preparation_style in ('minimal', 'guided', 'enhanced')),
  coaching_intelligence_mode text not null default 'assisted'
    check (
      coaching_intelligence_mode in ('manual', 'assisted', 'comprehensive')
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clients_coach_id_idx on public.clients (coach_id);
create index if not exists clients_coach_id_archived_at_idx on public.clients (coach_id, archived_at);
create index if not exists sessions_coach_id_idx on public.sessions (coach_id);
create index if not exists client_items_coach_id_idx on public.client_items (coach_id);
create index if not exists coaching_reports_coach_id_idx on public.coaching_reports (coach_id);

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

revoke all on function public.client_belongs_to_coach(uuid, uuid) from public;
grant execute on function public.client_belongs_to_coach(uuid, uuid) to authenticated;
revoke all on function public.client_is_active_for_coach(uuid, uuid) from public;
grant execute on function public.client_is_active_for_coach(uuid, uuid) to authenticated;
revoke all on function public.archive_client(uuid) from public;
grant execute on function public.archive_client(uuid) to authenticated;
revoke all on function public.restore_client(uuid) from public;
grant execute on function public.restore_client(uuid) to authenticated;
revoke all on function public.permanently_delete_client(uuid) from public;
grant execute on function public.permanently_delete_client(uuid) to authenticated;

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

alter table public.clients enable row level security;
alter table public.sessions enable row level security;
alter table public.client_items enable row level security;
alter table public.coaching_reports enable row level security;
alter table public.profiles enable row level security;

-- See supabase/migrations/20260724160000_auth_profiles_rls.sql for the full policy set.
-- Minimal ownership policies for fresh installs:
drop policy if exists "Coaches manage own clients" on public.clients;
drop policy if exists "Clients select own" on public.clients;
create policy "Clients select own" on public.clients for select to authenticated using (coach_id = auth.uid());
drop policy if exists "Clients insert own" on public.clients;
create policy "Clients insert own" on public.clients for insert to authenticated with check (coach_id = auth.uid());
drop policy if exists "Clients update own" on public.clients;
create policy "Clients update own" on public.clients for update to authenticated using (coach_id = auth.uid()) with check (coach_id = auth.uid());
drop policy if exists "Clients delete own" on public.clients;
create policy "Clients delete own" on public.clients for delete to authenticated using (coach_id = auth.uid());

drop policy if exists "Coaches manage own sessions" on public.sessions;
drop policy if exists "Sessions select own" on public.sessions;
create policy "Sessions select own" on public.sessions for select to authenticated using (coach_id = auth.uid() and public.client_belongs_to_coach(client_id, auth.uid()));
drop policy if exists "Sessions insert own" on public.sessions;
create policy "Sessions insert own" on public.sessions for insert to authenticated with check (coach_id = auth.uid() and public.client_belongs_to_coach(client_id, auth.uid()) and public.client_is_active_for_coach(client_id, coach_id));
drop policy if exists "Sessions update own" on public.sessions;
create policy "Sessions update own" on public.sessions for update to authenticated using (coach_id = auth.uid() and public.client_belongs_to_coach(client_id, auth.uid())) with check (coach_id = auth.uid() and public.client_belongs_to_coach(client_id, auth.uid()) and public.client_is_active_for_coach(client_id, coach_id));
drop policy if exists "Sessions delete own" on public.sessions;
create policy "Sessions delete own" on public.sessions for delete to authenticated using (coach_id = auth.uid() and public.client_belongs_to_coach(client_id, auth.uid()));

drop policy if exists "Coaches manage own client items" on public.client_items;
drop policy if exists "Client items select own" on public.client_items;
create policy "Client items select own" on public.client_items for select to authenticated using (coach_id = auth.uid());
drop policy if exists "Client items insert own" on public.client_items;
create policy "Client items insert own" on public.client_items for insert to authenticated with check (coach_id = auth.uid() and public.client_is_active_for_coach(client_id, coach_id));
drop policy if exists "Client items update own" on public.client_items;
create policy "Client items update own" on public.client_items for update to authenticated using (coach_id = auth.uid()) with check (coach_id = auth.uid() and public.client_is_active_for_coach(client_id, coach_id));
drop policy if exists "Client items delete own" on public.client_items;
create policy "Client items delete own" on public.client_items for delete to authenticated using (coach_id = auth.uid());

drop policy if exists "Coaches manage own coaching reports" on public.coaching_reports;
drop policy if exists "Coaching reports select own" on public.coaching_reports;
create policy "Coaching reports select own" on public.coaching_reports for select to authenticated using (coach_id = auth.uid());
drop policy if exists "Coaching reports insert own" on public.coaching_reports;
create policy "Coaching reports insert own" on public.coaching_reports for insert to authenticated with check (coach_id = auth.uid() and public.client_is_active_for_coach(client_id, coach_id));
drop policy if exists "Coaching reports update own" on public.coaching_reports;
create policy "Coaching reports update own" on public.coaching_reports for update to authenticated using (coach_id = auth.uid()) with check (coach_id = auth.uid() and public.client_is_active_for_coach(client_id, coach_id));
drop policy if exists "Coaching reports delete own" on public.coaching_reports;
create policy "Coaching reports delete own" on public.coaching_reports for delete to authenticated using (coach_id = auth.uid());

drop policy if exists "Profiles select own" on public.profiles;
create policy "Profiles select own" on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "Profiles insert own" on public.profiles;
create policy "Profiles insert own" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "Profiles update own" on public.profiles;
create policy "Profiles update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "Profiles delete own" on public.profiles;
create policy "Profiles delete own" on public.profiles for delete to authenticated using (id = auth.uid());


-- See also:
--   supabase/migrations/20260725140000_development_intelligence.sql
--   supabase/migrations/20260725150000_development_updates.sql
--   supabase/migrations/20260731180000_coaching_moments.sql
-- for intelligence_items, intelligence_evidence, session_intelligence_reviews,
-- development_profiles, development_updates,
-- question_insights, person_progress_signals, intelligence_audit_log,
-- and coaching_moments (lightweight interactions, not formal sessions).
