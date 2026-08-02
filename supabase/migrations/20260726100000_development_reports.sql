-- Premium Development Reports: evidence-led coaching outputs.
-- Additive only — does not modify coaching_reports or session private notes.

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
-- Development reports
-- ---------------------------------------------------------------------------
create table if not exists public.development_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  audience text not null,
  title text not null,
  reporting_period_start date,
  reporting_period_end date,
  status text not null default 'draft',
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
  updated_at timestamptz not null default now(),
  constraint development_reports_type_check check (
    type in ('progress_snapshot', 'development_report', 'impact_summary')
  ),
  constraint development_reports_audience_check check (
    audience in ('coachee', 'coach', 'sponsor')
  ),
  constraint development_reports_status_check check (
    status in ('draft', 'approved')
  )
);

create index if not exists development_reports_coach_id_idx
  on public.development_reports (coach_id);

create index if not exists development_reports_client_id_idx
  on public.development_reports (client_id);

create index if not exists development_reports_status_idx
  on public.development_reports (coach_id, status, approved_at desc);

comment on table public.development_reports is
  'Coach-owned premium reports. Approved rows are immutable snapshots; edits create a new draft.';

comment on column public.development_reports.evidence_items is
  'Snapshot of selected evidence with source references. Private coach notes are never stored here by default.';

drop trigger if exists development_reports_set_updated_at on public.development_reports;
create trigger development_reports_set_updated_at
  before update on public.development_reports
  for each row execute function public.set_updated_at();

-- Prevent silent mutation of approved reports at the database layer.
create or replace function public.prevent_approved_development_report_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'approved' then
    raise exception 'Approved development reports are immutable. Create a new draft instead.';
  end if;
  return new;
end;
$$;

drop trigger if exists development_reports_prevent_approved_mutation
  on public.development_reports;
create trigger development_reports_prevent_approved_mutation
  before update on public.development_reports
  for each row execute function public.prevent_approved_development_report_mutation();

alter table public.development_reports enable row level security;

drop policy if exists "Development reports select own" on public.development_reports;
create policy "Development reports select own" on public.development_reports
  for select to authenticated
  using (
    coach_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );

drop policy if exists "Development reports insert own" on public.development_reports;
create policy "Development reports insert own" on public.development_reports
  for insert to authenticated
  with check (
    coach_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );

drop policy if exists "Development reports update own" on public.development_reports;
create policy "Development reports update own" on public.development_reports
  for update to authenticated
  using (
    coach_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  )
  with check (
    coach_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );

drop policy if exists "Development reports delete own" on public.development_reports;
create policy "Development reports delete own" on public.development_reports
  for delete to authenticated
  using (
    coach_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
    and status = 'draft'
  );

grant select, insert, update, delete on public.development_reports to authenticated;
grant all on public.development_reports to service_role;
