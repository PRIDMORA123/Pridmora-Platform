-- Development Intelligence Platform: cumulative, evidence-based intelligence.
-- Additive only — preserves existing clients, sessions and coaching records.
--
-- Ownership model (existing): public.clients.id (uuid PK), owned by coach_id
-- (uuid → auth.users). Helper public.client_belongs_to_coach(uuid, uuid) is
-- defined in earlier migrations; recreate it here so this file is safe when
-- those helpers are missing from a partially migrated database.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Required before intelligence RLS policies. Idempotent; matches
-- 20260724160000_auth_profiles_rls.sql / 20260724170000_client_archive_delete.sql.
create or replace function public.client_belongs_to_coach(p_client_id uuid, p_coach_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.coach_id = p_coach_id
  );
$$;

revoke all on function public.client_belongs_to_coach(uuid, uuid) from public;
grant execute on function public.client_belongs_to_coach(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6.1 intelligence_items
-- ---------------------------------------------------------------------------
create table if not exists public.intelligence_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  category text not null,
  title text not null,
  description text,
  status text not null default 'proposed',
  confidence_score numeric,
  confidence_label text,
  source_type text,
  first_identified_at timestamptz,
  last_updated_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  is_locked boolean not null default false,
  coach_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint intelligence_items_category_check check (category in (
    'strength',
    'value',
    'motivator',
    'goal',
    'purpose',
    'limiting_belief',
    'empowering_belief',
    'behaviour_pattern',
    'emotional_pattern',
    'communication_style',
    'decision_style',
    'learning_preference',
    'recurring_theme',
    'development_opportunity',
    'risk_indicator',
    'breakthrough',
    'relationship_observation'
  )),
  constraint intelligence_items_status_check check (status in (
    'proposed',
    'approved',
    'rejected',
    'archived'
  )),
  constraint intelligence_items_confidence_score_check check (
    confidence_score is null
    or (confidence_score >= 0 and confidence_score <= 100)
  ),
  constraint intelligence_items_confidence_label_check check (
    confidence_label is null
    or confidence_label in (
      'early signal',
      'emerging',
      'supported',
      'strongly supported'
    )
  )
);

create index if not exists intelligence_items_user_id_idx
  on public.intelligence_items (user_id);
create index if not exists intelligence_items_client_id_idx
  on public.intelligence_items (client_id);
create index if not exists intelligence_items_status_idx
  on public.intelligence_items (status);
create index if not exists intelligence_items_category_idx
  on public.intelligence_items (category);
create index if not exists intelligence_items_user_client_status_idx
  on public.intelligence_items (user_id, client_id, status);

drop trigger if exists intelligence_items_set_updated_at on public.intelligence_items;
create trigger intelligence_items_set_updated_at
  before update on public.intelligence_items
  for each row execute function public.set_updated_at();

comment on table public.intelligence_items is
  'Living cumulative development intelligence for a person. AI output starts as proposed and requires coach validation.';
comment on column public.intelligence_items.status is
  'proposed | approved | rejected | archived — never auto-approved from AI.';
comment on column public.intelligence_items.confidence_label is
  'early signal | emerging | supported | strongly supported';

-- ---------------------------------------------------------------------------
-- 6.2 intelligence_evidence
-- ---------------------------------------------------------------------------
create table if not exists public.intelligence_evidence (
  id uuid primary key default gen_random_uuid(),
  intelligence_item_id uuid not null
    references public.intelligence_items(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  evidence_text text not null,
  evidence_type text,
  source_excerpt text,
  occurred_at timestamptz,
  created_at timestamptz not null default now(),
  created_by text,
  is_redacted boolean not null default false,
  constraint intelligence_evidence_type_check check (
    evidence_type is null
    or evidence_type in (
      'session_note',
      'coach_observation',
      'client_statement',
      'reflection',
      'commitment',
      'preparation',
      'manual_entry',
      'AI_interpretation'
    )
  )
);

create index if not exists intelligence_evidence_item_id_idx
  on public.intelligence_evidence (intelligence_item_id);
create index if not exists intelligence_evidence_session_id_idx
  on public.intelligence_evidence (session_id);
create index if not exists intelligence_evidence_user_id_idx
  on public.intelligence_evidence (user_id);

comment on table public.intelligence_evidence is
  'Explainable evidence behind an intelligence item. Session deletion clears the link but does not destroy approved intelligence.';
comment on column public.intelligence_evidence.evidence_type is
  'Includes AI_interpretation which always requires coach validation.';

-- ---------------------------------------------------------------------------
-- 6.3 session_intelligence_reviews
-- ---------------------------------------------------------------------------
create table if not exists public.session_intelligence_reviews (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  review_status text not null default 'pending',
  generated_at timestamptz,
  reviewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_intelligence_reviews_status_check check (review_status in (
    'pending',
    'in_review',
    'approved',
    'partially_approved',
    'rejected',
    'completed'
  )),
  constraint session_intelligence_reviews_session_unique unique (session_id)
);

create index if not exists session_intelligence_reviews_user_id_idx
  on public.session_intelligence_reviews (user_id);
create index if not exists session_intelligence_reviews_client_id_idx
  on public.session_intelligence_reviews (client_id);
create index if not exists session_intelligence_reviews_status_idx
  on public.session_intelligence_reviews (review_status);

drop trigger if exists session_intelligence_reviews_set_updated_at
  on public.session_intelligence_reviews;
create trigger session_intelligence_reviews_set_updated_at
  before update on public.session_intelligence_reviews
  for each row execute function public.set_updated_at();

comment on table public.session_intelligence_reviews is
  'Review state for proposed intelligence generated after a session.';

-- ---------------------------------------------------------------------------
-- 6.4 question_insights
-- ---------------------------------------------------------------------------
create table if not exists public.question_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  question_text text not null,
  question_type text,
  source text,
  effectiveness_rating integer,
  coach_notes text,
  created_at timestamptz not null default now(),
  constraint question_insights_source_check check (
    source is null
    or source in ('coach', 'AI_suggested', 'template', 'previous_session')
  ),
  constraint question_insights_effectiveness_check check (
    effectiveness_rating is null
    or (effectiveness_rating >= 1 and effectiveness_rating <= 5)
  )
);

create index if not exists question_insights_user_id_idx
  on public.question_insights (user_id);
create index if not exists question_insights_client_id_idx
  on public.question_insights (client_id);
create index if not exists question_insights_session_id_idx
  on public.question_insights (session_id);

comment on table public.question_insights is
  'Questions used or recommended for a person. Effectiveness is coach judgement only.';

-- ---------------------------------------------------------------------------
-- 6.5 person_progress_signals
-- ---------------------------------------------------------------------------
create table if not exists public.person_progress_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  signal_name text not null,
  direction text,
  score numeric,
  coach_validated boolean not null default false,
  evidence_summary text,
  recorded_at timestamptz not null default now(),
  constraint person_progress_signals_direction_check check (
    direction is null
    or direction in ('improving', 'stable', 'declining', 'unclear')
  )
);

create index if not exists person_progress_signals_user_id_idx
  on public.person_progress_signals (user_id);
create index if not exists person_progress_signals_client_id_idx
  on public.person_progress_signals (client_id);
create index if not exists person_progress_signals_session_id_idx
  on public.person_progress_signals (session_id);

comment on table public.person_progress_signals is
  'Development signals over time — not psychometric assessments.';

-- ---------------------------------------------------------------------------
-- 6.6 intelligence_audit_log
-- ---------------------------------------------------------------------------
create table if not exists public.intelligence_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists intelligence_audit_log_user_id_idx
  on public.intelligence_audit_log (user_id);
create index if not exists intelligence_audit_log_entity_idx
  on public.intelligence_audit_log (entity_type, entity_id);

comment on table public.intelligence_audit_log is
  'Audit trail for intelligence proposals, approvals, edits, locks and evidence changes.';

-- ---------------------------------------------------------------------------
-- Row Level Security — owner-only via auth.uid()
-- ---------------------------------------------------------------------------
alter table public.intelligence_items enable row level security;
alter table public.intelligence_evidence enable row level security;
alter table public.session_intelligence_reviews enable row level security;
alter table public.question_insights enable row level security;
alter table public.person_progress_signals enable row level security;
alter table public.intelligence_audit_log enable row level security;

drop policy if exists "Intelligence items select own" on public.intelligence_items;
create policy "Intelligence items select own" on public.intelligence_items
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "Intelligence items insert own" on public.intelligence_items;
create policy "Intelligence items insert own" on public.intelligence_items
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );
drop policy if exists "Intelligence items update own" on public.intelligence_items;
create policy "Intelligence items update own" on public.intelligence_items
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );
drop policy if exists "Intelligence items delete own" on public.intelligence_items;
create policy "Intelligence items delete own" on public.intelligence_items
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "Intelligence evidence select own" on public.intelligence_evidence;
create policy "Intelligence evidence select own" on public.intelligence_evidence
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "Intelligence evidence insert own" on public.intelligence_evidence;
create policy "Intelligence evidence insert own" on public.intelligence_evidence
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Intelligence evidence update own" on public.intelligence_evidence;
create policy "Intelligence evidence update own" on public.intelligence_evidence
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop policy if exists "Intelligence evidence delete own" on public.intelligence_evidence;
create policy "Intelligence evidence delete own" on public.intelligence_evidence
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "Session intelligence reviews select own" on public.session_intelligence_reviews;
create policy "Session intelligence reviews select own" on public.session_intelligence_reviews
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "Session intelligence reviews insert own" on public.session_intelligence_reviews;
create policy "Session intelligence reviews insert own" on public.session_intelligence_reviews
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );
drop policy if exists "Session intelligence reviews update own" on public.session_intelligence_reviews;
create policy "Session intelligence reviews update own" on public.session_intelligence_reviews
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );
drop policy if exists "Session intelligence reviews delete own" on public.session_intelligence_reviews;
create policy "Session intelligence reviews delete own" on public.session_intelligence_reviews
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "Question insights select own" on public.question_insights;
create policy "Question insights select own" on public.question_insights
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "Question insights insert own" on public.question_insights;
create policy "Question insights insert own" on public.question_insights
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );
drop policy if exists "Question insights update own" on public.question_insights;
create policy "Question insights update own" on public.question_insights
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );
drop policy if exists "Question insights delete own" on public.question_insights;
create policy "Question insights delete own" on public.question_insights
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "Progress signals select own" on public.person_progress_signals;
create policy "Progress signals select own" on public.person_progress_signals
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "Progress signals insert own" on public.person_progress_signals;
create policy "Progress signals insert own" on public.person_progress_signals
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );
drop policy if exists "Progress signals update own" on public.person_progress_signals;
create policy "Progress signals update own" on public.person_progress_signals
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );
drop policy if exists "Progress signals delete own" on public.person_progress_signals;
create policy "Progress signals delete own" on public.person_progress_signals
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "Intelligence audit select own" on public.intelligence_audit_log;
create policy "Intelligence audit select own" on public.intelligence_audit_log
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "Intelligence audit insert own" on public.intelligence_audit_log;
create policy "Intelligence audit insert own" on public.intelligence_audit_log
  for insert to authenticated with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Extend permanent delete to clean intelligence tables (additive)
-- ---------------------------------------------------------------------------
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

  if to_regclass('public.intelligence_audit_log') is not null then
    delete from public.intelligence_audit_log
    where user_id = v_coach_id
      and (
        entity_id = p_client_id
        or entity_id in (
          select id from public.intelligence_items
          where client_id = p_client_id and user_id = v_coach_id
        )
      );
  end if;

  if to_regclass('public.intelligence_evidence') is not null then
    delete from public.intelligence_evidence
    where user_id = v_coach_id
      and intelligence_item_id in (
        select id from public.intelligence_items
        where client_id = p_client_id and user_id = v_coach_id
      );
  end if;

  if to_regclass('public.session_intelligence_reviews') is not null then
    delete from public.session_intelligence_reviews
    where client_id = p_client_id and user_id = v_coach_id;
  end if;

  if to_regclass('public.question_insights') is not null then
    delete from public.question_insights
    where client_id = p_client_id and user_id = v_coach_id;
  end if;

  if to_regclass('public.person_progress_signals') is not null then
    delete from public.person_progress_signals
    where client_id = p_client_id and user_id = v_coach_id;
  end if;

  if to_regclass('public.intelligence_items') is not null then
    delete from public.intelligence_items
    where client_id = p_client_id and user_id = v_coach_id;
  end if;

  if to_regclass('public.coaching_reports') is not null then
    delete from public.coaching_reports
    where client_id = p_client_id and coach_id = v_coach_id;
  end if;

  if to_regclass('public.sessions') is not null then
    delete from public.sessions
    where client_id = p_client_id and coach_id = v_coach_id;
  end if;

  if to_regclass('public.client_items') is not null then
    delete from public.client_items
    where client_id = p_client_id and coach_id = v_coach_id;
  end if;

  delete from public.clients
  where id = p_client_id and coach_id = v_coach_id;

  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'not found';
  end if;
end;
$$;

revoke all on function public.permanently_delete_client(uuid) from public;
grant execute on function public.permanently_delete_client(uuid) to authenticated;

notify pgrst, 'reload schema';
