-- Professional Coaching Intelligence™ support levels.
-- Additive only. Maps alongside preparation_style (manual↔minimal, assisted↔guided, comprehensive↔enhanced).

alter table public.profiles
  add column if not exists coaching_intelligence_mode text not null default 'assisted';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'valid_coaching_intelligence_mode'
  ) then
    alter table public.profiles
      add constraint valid_coaching_intelligence_mode
      check (
        coaching_intelligence_mode in (
          'manual',
          'assisted',
          'comprehensive'
        )
      );
  end if;
end $$;

-- Backfill from existing preparation_style preferences.
update public.profiles
set coaching_intelligence_mode = case preparation_style
  when 'minimal' then 'manual'
  when 'enhanced' then 'comprehensive'
  else 'assisted'
end
where coaching_intelligence_mode is null
   or coaching_intelligence_mode not in ('manual', 'assisted', 'comprehensive');

alter table public.sessions
  add column if not exists intelligence_mode text;

alter table public.sessions
  add column if not exists intelligence_status text default 'idle';

alter table public.sessions
  add column if not exists intelligence_sources jsonb default '[]'::jsonb;

alter table public.sessions
  add column if not exists intelligence_last_refreshed_at timestamptz;

alter table public.sessions
  add column if not exists intelligence_error_code text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sessions_intelligence_mode_check'
  ) then
    alter table public.sessions
      add constraint sessions_intelligence_mode_check
      check (
        intelligence_mode is null
        or intelligence_mode in ('manual', 'assisted', 'comprehensive')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sessions_intelligence_status_check'
  ) then
    alter table public.sessions
      add constraint sessions_intelligence_status_check
      check (
        intelligence_status is null
        or intelligence_status in ('idle', 'preparing', 'ready', 'error')
      );
  end if;
end $$;

comment on column public.profiles.coaching_intelligence_mode is
  'Coach default Professional Coaching Intelligence support: manual | assisted | comprehensive.';

comment on column public.sessions.intelligence_mode is
  'Support level used for the latest preparation intelligence generation.';

comment on column public.sessions.intelligence_status is
  'idle | preparing | ready | error — user-facing status only.';

comment on column public.sessions.intelligence_sources is
  'Reviewed evidence source keys used in the latest generation.';

comment on column public.sessions.intelligence_last_refreshed_at is
  'When preparation intelligence was last refreshed for this conversation.';

comment on column public.sessions.intelligence_error_code is
  'Stable error code for failed generation. Do not store technical messages for display.';
