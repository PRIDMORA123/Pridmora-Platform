-- Coaching Moments: lightweight relationship interactions, separate from formal sessions.
-- Never inflate session_number, programme milestones, or formal session counts.

create table if not exists public.coaching_moments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  occurred_at timestamptz,
  status text not null default 'draft'
    check (status in (
      'draft',
      'prepared',
      'in_progress',
      'captured',
      'complete',
      'discarded'
    )),
  situation text not null default '',
  desired_outcome text,
  inferred_type text
    check (
      inferred_type is null
      or inferred_type in (
        'feedback',
        'delegation',
        'accountability',
        'difficult_conversation',
        'recognition',
        'performance',
        'conflict',
        'wellbeing',
        'career',
        'change',
        'stakeholder',
        'check_in',
        'general'
      )
    ),
  generated_intention text,
  generated_opening text,
  generated_questions jsonb not null default '[]'::jsonb,
  generated_consideration text,
  relevant_context jsonb,
  private_note text,
  outcome_notes text,
  agreed_commitment text,
  no_commitment_agreed boolean not null default false,
  follow_up text,
  generated_insight jsonb,
  insight_status text not null default 'not_requested'
    check (insight_status in (
      'not_requested',
      'draft',
      'accepted',
      'edited',
      'discarded'
    )),
  guidance_fingerprint text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.coaching_moments is
  'Lightweight coaching interactions. interaction_type equivalent: coaching_moment. Not formal sessions.';
comment on column public.coaching_moments.private_note is
  'Coach-only quick note. Excluded from AI, shared summaries, reports, and patterns.';
comment on column public.coaching_moments.insight_status is
  'Optional AI insight review state. Never auto-approved.';

create index if not exists coaching_moments_client_id_idx
  on public.coaching_moments (client_id);
create index if not exists coaching_moments_coach_id_idx
  on public.coaching_moments (coach_id);
create index if not exists coaching_moments_client_status_idx
  on public.coaching_moments (client_id, status, updated_at desc);
create index if not exists coaching_moments_client_occurred_idx
  on public.coaching_moments (client_id, occurred_at desc nulls last);

alter table public.coaching_moments enable row level security;

drop policy if exists "Coaching moments select own" on public.coaching_moments;
create policy "Coaching moments select own" on public.coaching_moments
  for select to authenticated
  using (
    coach_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );

drop policy if exists "Coaching moments insert own" on public.coaching_moments;
create policy "Coaching moments insert own" on public.coaching_moments
  for insert to authenticated
  with check (
    coach_id = auth.uid()
    and created_by = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
    and public.client_is_active_for_coach(client_id, coach_id)
  );

drop policy if exists "Coaching moments update own" on public.coaching_moments;
create policy "Coaching moments update own" on public.coaching_moments
  for update to authenticated
  using (
    coach_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  )
  with check (
    coach_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
    and (
      status = 'discarded'
      or public.client_is_active_for_coach(client_id, coach_id)
    )
  );

drop policy if exists "Coaching moments delete own" on public.coaching_moments;
create policy "Coaching moments delete own" on public.coaching_moments
  for delete to authenticated
  using (
    coach_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );

grant select, insert, update, delete on public.coaching_moments to authenticated;

-- Extend permanent delete to remove coaching moments before the client row.
create or replace function public.permanently_delete_client(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := auth.uid();
  v_deleted integer;
begin
  if v_coach_id is null then
    raise exception 'Authentication required.';
  end if;

  if to_regclass('public.coaching_moments') is not null then
    delete from public.coaching_moments
    where client_id = p_client_id
      and coach_id = v_coach_id;
  end if;

  if to_regclass('public.coaching_reports') is not null then
    delete from public.coaching_reports
    where client_id = p_client_id
      and coach_id = v_coach_id;
  end if;

  if to_regclass('public.sessions') is not null then
    delete from public.sessions
    where client_id = p_client_id
      and coach_id = v_coach_id;
  end if;

  if to_regclass('public.client_items') is not null then
    delete from public.client_items
    where client_id = p_client_id
      and coach_id = v_coach_id;
  end if;

  if to_regclass('public.development_updates') is not null then
    delete from public.development_updates
    where client_id = p_client_id
      and coach_id = v_coach_id;
  end if;

  if to_regclass('public.development_profiles') is not null then
    delete from public.development_profiles
    where client_id = p_client_id
      and coach_id = v_coach_id;
  end if;

  if to_regclass('public.development_reports') is not null then
    delete from public.development_reports
    where client_id = p_client_id
      and coach_id = v_coach_id;
  end if;

  delete from public.clients
  where id = p_client_id
    and coach_id = v_coach_id;

  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'not found';
  end if;
end;
$$;

revoke all on function public.permanently_delete_client(uuid) from public;
grant execute on function public.permanently_delete_client(uuid) to authenticated;

notify pgrst, 'reload schema';
