-- Live coaching workspace: persistent session timer fields.
-- Additive only — does not wipe existing conversation data.

alter table public.sessions
  add column if not exists timer_elapsed_seconds integer not null default 0,
  add column if not exists timer_started_at timestamptz,
  add column if not exists session_started_at timestamptz;

-- Allow pause during a live conversation.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'sessions_status_check'
  ) then
    alter table public.sessions drop constraint sessions_status_check;
  end if;

  alter table public.sessions
    add constraint sessions_status_check
    check (status in (
      'planned',
      'prepared',
      'in_progress',
      'paused',
      'awaiting_completion',
      'completed'
    ));
end $$;

comment on column public.sessions.timer_elapsed_seconds is
  'Accumulated live coaching seconds when the timer is not running.';
comment on column public.sessions.timer_started_at is
  'When the live timer last started; null when paused or not running.';
comment on column public.sessions.session_started_at is
  'First time the live coaching conversation was started.';
