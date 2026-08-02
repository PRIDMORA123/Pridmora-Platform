-- Temporary integrity check: Journey-facing session text naming a person
-- different from the owning relationship.
--
-- Run in Supabase SQL editor or via psql.

select
  s.id as session_id,
  s.client_id as relationship_id,
  c.name as person_name,
  s.session_number,
  s.summary_status,
  s.ai_summary_approved,
  left(coalesce(s.summary, ''), 180) as summary_excerpt,
  s.created_at,
  s.updated_at
from public.sessions s
join public.clients c
  on c.id = s.client_id
 and c.coach_id = s.coach_id
where
  (
    lower(coalesce(s.summary, '')) like '%sarah%'
    or lower(coalesce(s.ai_draft_summary, '')) like '%sarah%'
    or lower(coalesce(s.notes, '')) like '%sarah%'
    or lower(coalesce(s.professional_identity_development, '')) like '%sarah%'
    or lower(coalesce(s.strengths_observed, '')) like '%sarah%'
    or lower(coalesce(s.coach_reflection, '')) like '%sarah%'
    or lower(coalesce(s.suggested_focus, '')) like '%sarah%'
  )
  and lower(c.name) not like '%sarah%'
order by s.updated_at desc;

-- Equivalent check for Emma / David / Sally when needed:
-- replace 'sarah' and adjust the person_name filter.
