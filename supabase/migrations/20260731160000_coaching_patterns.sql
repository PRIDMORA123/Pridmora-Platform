-- Longitudinal coaching patterns: extend development_profiles rather than
-- creating a competing intelligence system. Additive only.

alter table public.development_profiles
  add column if not exists coaching_patterns jsonb not null default '[]'::jsonb;

alter table public.development_profiles
  add column if not exists patterns_evidence_fingerprint text;

alter table public.development_profiles
  add column if not exists patterns_generated_at timestamptz;

comment on column public.development_profiles.coaching_patterns is
  'Longitudinal CoachingPattern[] with evidence provenance and coach review state.';
comment on column public.development_profiles.patterns_evidence_fingerprint is
  'Fingerprint of authorised evidence used for the last pattern generation run.';
comment on column public.development_profiles.patterns_generated_at is
  'When longitudinal patterns were last generated for this relationship.';
