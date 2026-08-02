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