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
