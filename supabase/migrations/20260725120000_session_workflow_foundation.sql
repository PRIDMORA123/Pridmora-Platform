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
