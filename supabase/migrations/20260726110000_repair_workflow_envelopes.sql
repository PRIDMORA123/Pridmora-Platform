-- Repair: remove IDENTITY_WORKFLOW_V1 envelopes from human text columns.
-- Backs up affected rows, migrates payload into structured columns when empty,
-- and records workflow_migrated_at. Additive and idempotent for already-clean rows.

alter table public.sessions
  add column if not exists workflow_migrated_at timestamptz;

-- One-time backup of contaminated rows (safe to re-run; table kept if present).
create table if not exists public.sessions_workflow_backup_20260726 as
select
  s.*,
  now() as backed_up_at
from public.sessions s
where
  coalesce(s.preparation, '') like '%---IDENTITY_WORKFLOW_V1---%'
  or coalesce(s.private_notes, '') like '%---IDENTITY_WORKFLOW_V1---%'
  or coalesce(s.reflection, '') like '%---IDENTITY_WORKFLOW_V1---%'
  or coalesce(s.prep_private_notes, '') like '%---IDENTITY_WORKFLOW_V1---%'
  or coalesce(s.notes, '') like '%---IDENTITY_WORKFLOW_V1---%'
limit 0;

insert into public.sessions_workflow_backup_20260726
select
  s.*,
  now() as backed_up_at
from public.sessions s
where
  (
    coalesce(s.preparation, '') like '%---IDENTITY_WORKFLOW_V1---%'
    or coalesce(s.private_notes, '') like '%---IDENTITY_WORKFLOW_V1---%'
    or coalesce(s.reflection, '') like '%---IDENTITY_WORKFLOW_V1---%'
    or coalesce(s.prep_private_notes, '') like '%---IDENTITY_WORKFLOW_V1---%'
    or coalesce(s.notes, '') like '%---IDENTITY_WORKFLOW_V1---%'
  )
  and not exists (
    select 1
    from public.sessions_workflow_backup_20260726 b
    where b.id = s.id
  );

create or replace function public.identity_text_before_workflow(raw text)
returns text
language sql
immutable
as $$
  select case
    when raw is null then null
    when position('---IDENTITY_WORKFLOW_V1---' in raw) = 0 then btrim(raw)
    else btrim(split_part(raw, '---IDENTITY_WORKFLOW_V1---', 1))
  end;
$$;

create or replace function public.identity_workflow_json(raw text)
returns jsonb
language plpgsql
immutable
as $$
declare
  payload text;
  parsed jsonb;
begin
  if raw is null or position('---IDENTITY_WORKFLOW_V1---' in raw) = 0 then
    return null;
  end if;

  payload := btrim(split_part(raw, '---IDENTITY_WORKFLOW_V1---', 2));
  if payload = '' then
    return null;
  end if;

  begin
    parsed := payload::jsonb;
    return parsed;
  exception
    when others then
      return null;
  end;
end;
$$;

do $$
declare
  rec record;
  payload jsonb;
  preparation_payload jsonb;
  private_payload jsonb;
  prep_notes_payload jsonb;
  visible_prep text;
  visible_private text;
  visible_reflection text;
  visible_prep_notes text;
  visible_notes text;
begin
  for rec in
    select *
    from public.sessions
    where
      coalesce(preparation, '') like '%---IDENTITY_WORKFLOW_V1---%'
      or coalesce(private_notes, '') like '%---IDENTITY_WORKFLOW_V1---%'
      or coalesce(reflection, '') like '%---IDENTITY_WORKFLOW_V1---%'
      or coalesce(prep_private_notes, '') like '%---IDENTITY_WORKFLOW_V1---%'
      or coalesce(notes, '') like '%---IDENTITY_WORKFLOW_V1---%'
  loop
    preparation_payload := public.identity_workflow_json(rec.preparation);
    private_payload := public.identity_workflow_json(rec.private_notes);
    prep_notes_payload := public.identity_workflow_json(rec.prep_private_notes);
    payload := coalesce(preparation_payload, '{}'::jsonb)
      || coalesce(private_payload, '{}'::jsonb)
      || coalesce(prep_notes_payload, '{}'::jsonb);

    visible_prep := public.identity_text_before_workflow(rec.preparation);
    visible_private := public.identity_text_before_workflow(rec.private_notes);
    visible_reflection := public.identity_text_before_workflow(rec.reflection);
    visible_prep_notes := public.identity_text_before_workflow(rec.prep_private_notes);
    visible_notes := public.identity_text_before_workflow(rec.notes);

    update public.sessions
    set
      preparation = nullif(visible_prep, ''),
      private_notes = nullif(
        coalesce(
          nullif(visible_private, ''),
          nullif(visible_reflection, ''),
          nullif(payload->>'reflectPrivate', ''),
          ''
        ),
        ''
      ),
      reflection = nullif(
        coalesce(
          nullif(visible_reflection, ''),
          nullif(visible_private, ''),
          nullif(payload->>'reflectPrivate', ''),
          ''
        ),
        ''
      ),
      notes = nullif(visible_notes, ''),
      prep_private_notes = nullif(
        coalesce(
          nullif(visible_prep_notes, ''),
          nullif(payload->>'prepPrivateNotes', ''),
          ''
        ),
        ''
      ),
      -- Fill structured columns only when currently empty.
      status = case
        when coalesce(rec.status, '') in ('', 'planned')
          and coalesce(payload->>'status', '') <> ''
          then payload->>'status'
        else rec.status
      end,
      title = coalesce(nullif(rec.title, ''), nullif(payload->>'title', ''), rec.title),
      duration_minutes = coalesce(
        rec.duration_minutes,
        nullif(payload->>'durationMinutes', '')::integer,
        60
      ),
      location = coalesce(nullif(rec.location, ''), nullif(payload->>'location', '')),
      completed_at = coalesce(
        rec.completed_at,
        nullif(payload->>'completedAt', '')::timestamptz
      ),
      notes_saved_at = coalesce(
        rec.notes_saved_at,
        nullif(payload->>'notesSavedAt', '')::timestamptz
      ),
      summary_status = case
        when coalesce(rec.summary_status, 'not_generated') = 'not_generated'
          and coalesce(payload->>'summaryStatus', '') <> ''
          then payload->>'summaryStatus'
        else rec.summary_status
      end,
      prep_purpose = coalesce(
        nullif(rec.prep_purpose, ''),
        nullif(payload->>'prepPurpose', '')
      ),
      prep_topics = coalesce(
        nullif(rec.prep_topics, ''),
        nullif(payload->>'prepTopics', '')
      ),
      prep_questions = coalesce(
        nullif(rec.prep_questions, ''),
        nullif(payload->>'prepQuestions', '')
      ),
      prep_commitments_review = coalesce(
        nullif(rec.prep_commitments_review, ''),
        nullif(payload->>'prepCommitmentsReview', '')
      ),
      prep_risks = coalesce(
        nullif(rec.prep_risks, ''),
        nullif(payload->>'prepRisks', '')
      ),
      reflect_what_shifted = coalesce(
        nullif(rec.reflect_what_shifted, ''),
        nullif(payload->>'reflectWhatShifted', '')
      ),
      reflect_what_surprised = coalesce(
        nullif(rec.reflect_what_surprised, ''),
        nullif(payload->>'reflectWhatSurprised', '')
      ),
      reflect_what_worked = coalesce(
        nullif(rec.reflect_what_worked, ''),
        nullif(payload->>'reflectWhatWorked', '')
      ),
      reflect_differently = coalesce(
        nullif(rec.reflect_differently, ''),
        nullif(payload->>'reflectDifferently', '')
      ),
      reflect_professional_learning = coalesce(
        nullif(rec.reflect_professional_learning, ''),
        nullif(payload->>'reflectProfessionalLearning', '')
      ),
      reflect_private = coalesce(
        nullif(rec.reflect_private, ''),
        nullif(visible_private, ''),
        nullif(payload->>'reflectPrivate', '')
      ),
      commitments = coalesce(
        nullif(rec.commitments, ''),
        nullif(payload->>'commitments', '')
      ),
      parking_lot = coalesce(
        nullif(rec.parking_lot, ''),
        nullif(payload->>'parkingLot', '')
      ),
      outcomes = coalesce(
        nullif(rec.outcomes, ''),
        nullif(payload->>'outcomes', '')
      ),
      workflow_migrated_at = coalesce(rec.workflow_migrated_at, now()),
      updated_at = now()
    where id = rec.id;
  end loop;
end;
$$;

comment on column public.sessions.workflow_migrated_at is
  'Set when IDENTITY_WORKFLOW_V1 envelopes were removed from text columns.';

comment on table public.sessions_workflow_backup_20260726 is
  'Backup of sessions that contained IDENTITY_WORKFLOW_V1 envelopes before repair.';
