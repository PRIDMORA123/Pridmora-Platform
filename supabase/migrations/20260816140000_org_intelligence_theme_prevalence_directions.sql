-- Gate 3.3B — Align organisation_intelligence_themes.direction with Gate 3.2B
-- prevalence semantics.
--
-- Root cause: app emits increasing/decreasing/unchanged_prevalence, but the
-- Pilot check still only allowed legacy progress-like labels.
--
-- New writes use prevalence values only. Legacy labels remain permitted so
-- historical ready snapshot theme rows (e.g. stable) are not rewritten.

alter table public.organisation_intelligence_themes
  drop constraint if exists organisation_intelligence_themes_direction_check;

alter table public.organisation_intelligence_themes
  add constraint organisation_intelligence_themes_direction_check
  check (
    direction is null
    or direction in (
      -- Current Gate 3.2B organisational theme semantics (new generation writes)
      'increasing_prevalence',
      'decreasing_prevalence',
      'unchanged_prevalence',
      'insufficient_evidence',
      -- Legacy historical snapshot values only — do not emit from new generation
      'stable',
      'strengthening',
      'requiring_attention'
    )
  );

comment on constraint organisation_intelligence_themes_direction_check
  on public.organisation_intelligence_themes is
  'Theme direction uses prevalence semantics for new snapshots. Legacy strengthening/stable/requiring_attention retained only for historical rows.';
