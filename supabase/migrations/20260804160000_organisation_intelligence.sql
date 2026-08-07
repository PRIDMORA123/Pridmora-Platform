-- Organisation Intelligence: anonymised executive snapshots.
-- Additive only. Does not alter Confidential Coaching, assignment rules,
-- or existing coaching workflow tables beyond extending the permission helper.
--
-- Privacy rules enforced here:
-- - Snapshots store aggregated evidence only (no raw notes, names or private identity).
-- - RLS requires intelligence.organisation.read via active membership.
-- - Aggregation RPC returns counts and normalised theme keys only.
-- - Never joins client_private_identities.

-- ---------------------------------------------------------------------------
-- 1. Permission: intelligence.organisation.read
-- ---------------------------------------------------------------------------
create or replace function public.has_organisation_permission(
  p_organisation_id uuid,
  p_user_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_memberships m
    where m.organisation_id = p_organisation_id
      and m.user_id = p_user_id
      and m.status = 'active'
      and (
        (p_permission = 'organisation.manage' and m.role in ('owner', 'administrator'))
        or (p_permission = 'organisation.view_usage' and m.role in ('owner', 'administrator', 'oversight'))
        or (p_permission = 'organisation.view_safe_oversight' and m.role in ('owner', 'administrator', 'oversight'))
        or (p_permission = 'intelligence.organisation.read' and m.role in ('owner', 'administrator', 'oversight'))
        or (p_permission = 'members.invite' and m.role in ('owner', 'administrator'))
        or (p_permission = 'members.manage' and m.role in ('owner', 'administrator'))
        or (p_permission = 'members.deactivate' and m.role in ('owner', 'administrator'))
        or (p_permission = 'assignments.manage' and m.role in ('owner', 'administrator'))
        or (p_permission = 'relationships.create' and m.role in ('owner', 'administrator', 'practitioner'))
        or (p_permission = 'relationships.view_assigned' and m.role in ('owner', 'administrator', 'practitioner', 'oversight', 'viewer'))
        or (p_permission = 'relationships.transfer' and m.role in ('owner', 'administrator'))
        or (p_permission = 'coaching_content.view' and m.role in ('practitioner', 'owner', 'administrator'))
        or (p_permission = 'private_notes.view' and m.role in ('practitioner', 'owner', 'administrator'))
        or (p_permission = 'reports.generate' and m.role in ('practitioner', 'owner', 'administrator'))
        or (p_permission = 'reports.view_relationship' and m.role in ('practitioner', 'owner', 'administrator'))
        or (p_permission = 'billing.manage' and m.role = 'owner')
      )
  );
$$;

revoke all on function public.has_organisation_permission(uuid, uuid, text) from public;
grant execute on function public.has_organisation_permission(uuid, uuid, text) to authenticated;

comment on function public.has_organisation_permission(uuid, uuid, text) is
  'Organisation role permission matrix. intelligence.organisation.read is owner/administrator/oversight only and never grants private identity or coaching content.';

-- ---------------------------------------------------------------------------
-- 2. Snapshot tables
-- ---------------------------------------------------------------------------
create table if not exists public.organisation_intelligence_snapshots (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  period_key text not null default 'last_90_days',
  generated_at timestamptz not null default now(),
  generated_by uuid references auth.users(id) on delete set null,
  source_relationship_count integer not null default 0
    check (source_relationship_count >= 0),
  source_conversation_count integer not null default 0
    check (source_conversation_count >= 0),
  source_evidence_count integer not null default 0
    check (source_evidence_count >= 0),
  confidence_level text not null default 'low'
    check (confidence_level in ('low', 'moderate', 'high')),
  executive_brief text,
  status text not null default 'ready'
    check (status in ('generating', 'ready', 'failed', 'superseded')),
  generation_error text,
  restricted_evidence_excluded boolean not null default false,
  privacy_threshold integer not null default 5
    check (privacy_threshold >= 1),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_intelligence_snapshots_period_check
    check (period_end >= period_start)
);

create index if not exists organisation_intelligence_snapshots_org_generated_idx
  on public.organisation_intelligence_snapshots (organisation_id, generated_at desc);

create index if not exists organisation_intelligence_snapshots_org_period_idx
  on public.organisation_intelligence_snapshots (organisation_id, period_start, period_end);

create index if not exists organisation_intelligence_snapshots_org_status_idx
  on public.organisation_intelligence_snapshots (organisation_id, status);

comment on table public.organisation_intelligence_snapshots is
  'Anonymised organisation development intelligence snapshots. No private identity or raw notes.';

create table if not exists public.organisation_intelligence_metrics (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null
    references public.organisation_intelligence_snapshots(id) on delete cascade,
  metric_key text not null,
  metric_label text not null,
  metric_value numeric,
  previous_value numeric,
  direction text
    check (direction is null or direction in (
      'up', 'down', 'stable', 'strengthening', 'requiring_attention',
      'insufficient_evidence', 'unavailable'
    )),
  confidence_level text not null default 'low'
    check (confidence_level in ('low', 'moderate', 'high')),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  relationship_count integer not null default 0 check (relationship_count >= 0),
  suppressed boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint organisation_intelligence_metrics_snapshot_key_unique
    unique (snapshot_id, metric_key)
);

create index if not exists organisation_intelligence_metrics_snapshot_idx
  on public.organisation_intelligence_metrics (snapshot_id);

comment on table public.organisation_intelligence_metrics is
  'Aggregated metrics for an organisation intelligence snapshot.';

create table if not exists public.organisation_intelligence_themes (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null
    references public.organisation_intelligence_snapshots(id) on delete cascade,
  theme_key text not null,
  theme_label text not null,
  evidence_count integer not null default 0 check (evidence_count >= 0),
  relationship_count integer not null default 0 check (relationship_count >= 0),
  direction text
    check (direction is null or direction in (
      'strengthening', 'stable', 'requiring_attention', 'insufficient_evidence'
    )),
  confidence_level text not null default 'low'
    check (confidence_level in ('low', 'moderate', 'high')),
  summary text,
  suppressed boolean not null default false,
  related_capabilities text[] not null default '{}',
  evidence_types text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint organisation_intelligence_themes_snapshot_key_unique
    unique (snapshot_id, theme_key)
);

create index if not exists organisation_intelligence_themes_snapshot_idx
  on public.organisation_intelligence_themes (snapshot_id);

comment on table public.organisation_intelligence_themes is
  'Anonymised aggregated themes. Titles are normalised keys only; no quotations or identities.';

create table if not exists public.organisation_intelligence_recommendations (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null
    references public.organisation_intelligence_snapshots(id) on delete cascade,
  priority integer not null check (priority >= 1 and priority <= 10),
  title text not null,
  rationale text not null,
  recommendation text not null,
  confidence_level text not null default 'low'
    check (confidence_level in ('low', 'moderate', 'high')),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  relationship_count integer not null default 0 check (relationship_count >= 0),
  status text not null default 'proposed'
    check (status in ('proposed', 'accepted', 'dismissed', 'completed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists organisation_intelligence_recommendations_snapshot_idx
  on public.organisation_intelligence_recommendations (snapshot_id, priority);

comment on table public.organisation_intelligence_recommendations is
  'Evidence-led organisational recommendations. Never commercial product pitches.';

create table if not exists public.organisation_intelligence_generation_locks (
  organisation_id uuid primary key
    references public.organisations(id) on delete cascade,
  locked_by uuid references auth.users(id) on delete set null,
  locked_at timestamptz not null default now(),
  snapshot_id uuid references public.organisation_intelligence_snapshots(id)
    on delete set null
);

comment on table public.organisation_intelligence_generation_locks is
  'Prevents duplicate concurrent organisation intelligence generation.';

-- updated_at trigger
drop trigger if exists organisation_intelligence_snapshots_set_updated_at
  on public.organisation_intelligence_snapshots;
create trigger organisation_intelligence_snapshots_set_updated_at
  before update on public.organisation_intelligence_snapshots
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
alter table public.organisation_intelligence_snapshots enable row level security;
alter table public.organisation_intelligence_metrics enable row level security;
alter table public.organisation_intelligence_themes enable row level security;
alter table public.organisation_intelligence_recommendations enable row level security;
alter table public.organisation_intelligence_generation_locks enable row level security;

drop policy if exists "Org intelligence snapshots select"
  on public.organisation_intelligence_snapshots;
create policy "Org intelligence snapshots select"
  on public.organisation_intelligence_snapshots
  for select to authenticated
  using (
    public.has_organisation_permission(
      organisation_id,
      auth.uid(),
      'intelligence.organisation.read'
    )
  );

drop policy if exists "Org intelligence snapshots insert"
  on public.organisation_intelligence_snapshots;
create policy "Org intelligence snapshots insert"
  on public.organisation_intelligence_snapshots
  for insert to authenticated
  with check (
    public.has_organisation_permission(
      organisation_id,
      auth.uid(),
      'intelligence.organisation.read'
    )
  );

drop policy if exists "Org intelligence snapshots update"
  on public.organisation_intelligence_snapshots;
create policy "Org intelligence snapshots update"
  on public.organisation_intelligence_snapshots
  for update to authenticated
  using (
    public.has_organisation_permission(
      organisation_id,
      auth.uid(),
      'intelligence.organisation.read'
    )
  )
  with check (
    public.has_organisation_permission(
      organisation_id,
      auth.uid(),
      'intelligence.organisation.read'
    )
  );

drop policy if exists "Org intelligence metrics select"
  on public.organisation_intelligence_metrics;
create policy "Org intelligence metrics select"
  on public.organisation_intelligence_metrics
  for select to authenticated
  using (
    exists (
      select 1
      from public.organisation_intelligence_snapshots s
      where s.id = snapshot_id
        and public.has_organisation_permission(
          s.organisation_id,
          auth.uid(),
          'intelligence.organisation.read'
        )
    )
  );

drop policy if exists "Org intelligence metrics insert"
  on public.organisation_intelligence_metrics;
create policy "Org intelligence metrics insert"
  on public.organisation_intelligence_metrics
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.organisation_intelligence_snapshots s
      where s.id = snapshot_id
        and public.has_organisation_permission(
          s.organisation_id,
          auth.uid(),
          'intelligence.organisation.read'
        )
    )
  );

drop policy if exists "Org intelligence themes select"
  on public.organisation_intelligence_themes;
create policy "Org intelligence themes select"
  on public.organisation_intelligence_themes
  for select to authenticated
  using (
    exists (
      select 1
      from public.organisation_intelligence_snapshots s
      where s.id = snapshot_id
        and public.has_organisation_permission(
          s.organisation_id,
          auth.uid(),
          'intelligence.organisation.read'
        )
    )
  );

drop policy if exists "Org intelligence themes insert"
  on public.organisation_intelligence_themes;
create policy "Org intelligence themes insert"
  on public.organisation_intelligence_themes
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.organisation_intelligence_snapshots s
      where s.id = snapshot_id
        and public.has_organisation_permission(
          s.organisation_id,
          auth.uid(),
          'intelligence.organisation.read'
        )
    )
  );

drop policy if exists "Org intelligence recommendations select"
  on public.organisation_intelligence_recommendations;
create policy "Org intelligence recommendations select"
  on public.organisation_intelligence_recommendations
  for select to authenticated
  using (
    exists (
      select 1
      from public.organisation_intelligence_snapshots s
      where s.id = snapshot_id
        and public.has_organisation_permission(
          s.organisation_id,
          auth.uid(),
          'intelligence.organisation.read'
        )
    )
  );

drop policy if exists "Org intelligence recommendations insert"
  on public.organisation_intelligence_recommendations;
create policy "Org intelligence recommendations insert"
  on public.organisation_intelligence_recommendations
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.organisation_intelligence_snapshots s
      where s.id = snapshot_id
        and public.has_organisation_permission(
          s.organisation_id,
          auth.uid(),
          'intelligence.organisation.read'
        )
    )
  );

drop policy if exists "Org intelligence locks select"
  on public.organisation_intelligence_generation_locks;
create policy "Org intelligence locks select"
  on public.organisation_intelligence_generation_locks
  for select to authenticated
  using (
    public.has_organisation_permission(
      organisation_id,
      auth.uid(),
      'intelligence.organisation.read'
    )
  );

drop policy if exists "Org intelligence locks insert"
  on public.organisation_intelligence_generation_locks;
create policy "Org intelligence locks insert"
  on public.organisation_intelligence_generation_locks
  for insert to authenticated
  with check (
    public.has_organisation_permission(
      organisation_id,
      auth.uid(),
      'intelligence.organisation.read'
    )
  );

drop policy if exists "Org intelligence locks update"
  on public.organisation_intelligence_generation_locks;
create policy "Org intelligence locks update"
  on public.organisation_intelligence_generation_locks
  for update to authenticated
  using (
    public.has_organisation_permission(
      organisation_id,
      auth.uid(),
      'intelligence.organisation.read'
    )
  )
  with check (
    public.has_organisation_permission(
      organisation_id,
      auth.uid(),
      'intelligence.organisation.read'
    )
  );

drop policy if exists "Org intelligence locks delete"
  on public.organisation_intelligence_generation_locks;
create policy "Org intelligence locks delete"
  on public.organisation_intelligence_generation_locks
  for delete to authenticated
  using (
    public.has_organisation_permission(
      organisation_id,
      auth.uid(),
      'intelligence.organisation.read'
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Safe aggregation RPC (no private identity, no raw notes)
-- ---------------------------------------------------------------------------
create or replace function public.aggregate_organisation_intelligence_sources(
  p_organisation_id uuid,
  p_period_start date,
  p_period_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_start timestamptz;
  v_end timestamptz;
  v_prev_start date;
  v_prev_end date;
  v_prev_start_ts timestamptz;
  v_prev_end_ts timestamptz;
  v_period_days integer;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_organisation_permission(
    p_organisation_id,
    v_user,
    'intelligence.organisation.read'
  ) then
    raise exception 'Permission denied';
  end if;

  if p_period_end < p_period_start then
    raise exception 'Invalid period';
  end if;

  v_start := p_period_start::timestamptz;
  v_end := (p_period_end + 1)::timestamptz;
  v_period_days := greatest(p_period_end - p_period_start + 1, 1);
  v_prev_end := p_period_start - 1;
  v_prev_start := v_prev_end - (v_period_days - 1);
  v_prev_start_ts := v_prev_start::timestamptz;
  v_prev_end_ts := (v_prev_end + 1)::timestamptz;

  return jsonb_build_object(
    'organisationId', p_organisation_id,
    'periodStart', p_period_start,
    'periodEnd', p_period_end,
    'previousPeriodStart', v_prev_start,
    'previousPeriodEnd', v_prev_end,
    'activeRelationships', (
      select count(*)::integer
      from public.clients c
      where c.organisation_id = p_organisation_id
        and c.archived_at is null
    ),
    'activePractitioners', (
      select count(distinct m.user_id)::integer
      from public.organisation_memberships m
      where m.organisation_id = p_organisation_id
        and m.status = 'active'
        and (
          m.role = 'practitioner'
          or (
            m.role in ('owner', 'administrator', 'practitioner')
            and exists (
              select 1
              from public.relationship_assignments ra
              where ra.organisation_id = p_organisation_id
                and ra.user_id = m.user_id
                and ra.status = 'active'
                and ra.assignment_role in ('primary', 'co_practitioner', 'cover')
            )
          )
        )
    ),
    'conversations', (
      select count(*)::integer
      from public.sessions s
      where s.organisation_id = p_organisation_id
        and s.updated_at >= v_start
        and s.updated_at < v_end
        and s.status in ('completed', 'awaiting_completion', 'in_progress')
    ),
    'previousConversations', (
      select count(*)::integer
      from public.sessions s
      where s.organisation_id = p_organisation_id
        and s.updated_at >= v_prev_start_ts
        and s.updated_at < v_prev_end_ts
        and s.status in ('completed', 'awaiting_completion', 'in_progress')
    ),
    'completedConversations', (
      select count(*)::integer
      from public.sessions s
      where s.organisation_id = p_organisation_id
        and s.updated_at >= v_start
        and s.updated_at < v_end
        and s.status = 'completed'
    ),
    'previousCompletedConversations', (
      select count(*)::integer
      from public.sessions s
      where s.organisation_id = p_organisation_id
        and s.updated_at >= v_prev_start_ts
        and s.updated_at < v_prev_end_ts
        and s.status = 'completed'
    ),
    'actionsTotal', (
      select count(*)::integer
      from public.client_items ci
      where ci.organisation_id = p_organisation_id
        and ci.item_type = 'action'
        and ci.created_at >= v_start
        and ci.created_at < v_end
    ),
    'actionsCompleted', (
      select count(*)::integer
      from public.client_items ci
      where ci.organisation_id = p_organisation_id
        and ci.item_type = 'action'
        and ci.created_at >= v_start
        and ci.created_at < v_end
        and lower(coalesce(ci.status, '')) in ('complete', 'completed')
    ),
    'previousActionsTotal', (
      select count(*)::integer
      from public.client_items ci
      where ci.organisation_id = p_organisation_id
        and ci.item_type = 'action'
        and ci.created_at >= v_prev_start_ts
        and ci.created_at < v_prev_end_ts
    ),
    'previousActionsCompleted', (
      select count(*)::integer
      from public.client_items ci
      where ci.organisation_id = p_organisation_id
        and ci.item_type = 'action'
        and ci.created_at >= v_prev_start_ts
        and ci.created_at < v_prev_end_ts
        and lower(coalesce(ci.status, '')) in ('complete', 'completed')
    ),
    'reflectionsCompleted', (
      select count(*)::integer
      from public.sessions s
      where s.organisation_id = p_organisation_id
        and s.updated_at >= v_start
        and s.updated_at < v_end
        and nullif(btrim(coalesce(s.coach_reflection, '')), '') is not null
    ),
    'previousReflectionsCompleted', (
      select count(*)::integer
      from public.sessions s
      where s.organisation_id = p_organisation_id
        and s.updated_at >= v_prev_start_ts
        and s.updated_at < v_prev_end_ts
        and nullif(btrim(coalesce(s.coach_reflection, '')), '') is not null
    ),
    'developmentUpdatesCompleted', (
      select count(*)::integer
      from public.development_updates du
      where du.organisation_id = p_organisation_id
        and du.status = 'applied'
        and coalesce(du.applied_at, du.updated_at, du.created_at) >= v_start
        and coalesce(du.applied_at, du.updated_at, du.created_at) < v_end
    ),
    'previousDevelopmentUpdatesCompleted', (
      select count(*)::integer
      from public.development_updates du
      where du.organisation_id = p_organisation_id
        and du.status = 'applied'
        and coalesce(du.applied_at, du.updated_at, du.created_at) >= v_prev_start_ts
        and coalesce(du.applied_at, du.updated_at, du.created_at) < v_prev_end_ts
    ),
    'evidenceItems', (
      select count(*)::integer
      from public.intelligence_items ii
      where ii.organisation_id = p_organisation_id
        and ii.status = 'approved'
        and ii.archived_at is null
        and coalesce(ii.approved_at, ii.last_updated_at, ii.created_at) >= v_start
        and coalesce(ii.approved_at, ii.last_updated_at, ii.created_at) < v_end
    ),
    'previousEvidenceItems', (
      select count(*)::integer
      from public.intelligence_items ii
      where ii.organisation_id = p_organisation_id
        and ii.status = 'approved'
        and ii.archived_at is null
        and coalesce(ii.approved_at, ii.last_updated_at, ii.created_at) >= v_prev_start_ts
        and coalesce(ii.approved_at, ii.last_updated_at, ii.created_at) < v_prev_end_ts
    ),
    'contributingRelationships', (
      select count(distinct s.client_id)::integer
      from public.sessions s
      where s.organisation_id = p_organisation_id
        and s.updated_at >= v_start
        and s.updated_at < v_end
        and s.status in ('completed', 'awaiting_completion', 'in_progress')
    ),
    'themeCandidates', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'themeKey', lower(regexp_replace(btrim(ii.title), '\s+', ' ', 'g')),
          'category', ii.category,
          'relationshipId', ii.client_id,
          'sourceType', coalesce(ii.source_type, 'intelligence_item'),
          'occurredAt', coalesce(ii.approved_at, ii.last_updated_at, ii.created_at)
        )
      )
      from public.intelligence_items ii
      where ii.organisation_id = p_organisation_id
        and ii.status = 'approved'
        and ii.archived_at is null
        and ii.category in (
          'recurring_theme',
          'development_opportunity',
          'behaviour_pattern',
          'communication_style',
          'emotional_pattern',
          'limiting_belief',
          'breakthrough'
        )
        and coalesce(ii.approved_at, ii.last_updated_at, ii.created_at) >= v_start
        and coalesce(ii.approved_at, ii.last_updated_at, ii.created_at) < v_end
        -- Titles only; never description, coach_notes or evidence text.
        and nullif(btrim(ii.title), '') is not null
        and char_length(ii.title) <= 120
    ), '[]'::jsonb),
    'previousThemeCandidates', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'themeKey', lower(regexp_replace(btrim(ii.title), '\s+', ' ', 'g')),
          'category', ii.category,
          'relationshipId', ii.client_id,
          'sourceType', coalesce(ii.source_type, 'intelligence_item')
        )
      )
      from public.intelligence_items ii
      where ii.organisation_id = p_organisation_id
        and ii.status = 'approved'
        and ii.archived_at is null
        and ii.category in (
          'recurring_theme',
          'development_opportunity',
          'behaviour_pattern',
          'communication_style',
          'emotional_pattern',
          'limiting_belief',
          'breakthrough'
        )
        and coalesce(ii.approved_at, ii.last_updated_at, ii.created_at) >= v_prev_start_ts
        and coalesce(ii.approved_at, ii.last_updated_at, ii.created_at) < v_prev_end_ts
        and nullif(btrim(ii.title), '') is not null
        and char_length(ii.title) <= 120
    ), '[]'::jsonb),
    'progressSignals', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'signalName', lower(regexp_replace(btrim(pps.signal_name), '\s+', ' ', 'g')),
          'direction', pps.direction,
          'relationshipId', pps.client_id,
          'coachValidated', pps.coach_validated
        )
      )
      from public.person_progress_signals pps
      where pps.organisation_id = p_organisation_id
        and pps.recorded_at >= v_start
        and pps.recorded_at < v_end
        and pps.coach_validated = true
        -- signal_name and direction only; never evidence_summary.
    ), '[]'::jsonb),
    'itemThemes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'themeKey', lower(regexp_replace(btrim(ci.title), '\s+', ' ', 'g')),
          'relationshipId', ci.client_id,
          'sourceType', 'client_item_theme'
        )
      )
      from public.client_items ci
      where ci.organisation_id = p_organisation_id
        and ci.item_type = 'theme'
        and ci.created_at >= v_start
        and ci.created_at < v_end
        and nullif(btrim(ci.title), '') is not null
        and char_length(ci.title) <= 120
        -- Never select detail or evidence columns.
    ), '[]'::jsonb),
    'hasEarlierPeriodActivity', (
      select exists (
        select 1
        from (
          select 1 as marker
          from public.sessions s
          where s.organisation_id = p_organisation_id
            and s.updated_at >= v_prev_start_ts
            and s.updated_at < v_prev_end_ts
          union all
          select 1 as marker
          from public.intelligence_items ii
          where ii.organisation_id = p_organisation_id
            and coalesce(ii.approved_at, ii.created_at) >= v_prev_start_ts
            and coalesce(ii.approved_at, ii.created_at) < v_prev_end_ts
          limit 1
        ) earlier
      )
    )
  );
end;
$$;

revoke all on function public.aggregate_organisation_intelligence_sources(uuid, date, date)
  from public;
grant execute on function public.aggregate_organisation_intelligence_sources(uuid, date, date)
  to authenticated;

comment on function public.aggregate_organisation_intelligence_sources(uuid, date, date) is
  'Returns anonymised organisation aggregates for intelligence generation. Never returns private identity, session notes, evidence text or confidential references.';
