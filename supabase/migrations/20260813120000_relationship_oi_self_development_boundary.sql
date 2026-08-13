-- Stage 3.1A — Database boundary hardening for relationship Organisation Intelligence.
--
-- 1. Canonical clients.is_self_development (idempotent) + unique index
-- 2. Backfill from legacy role sentinel "Self development"
-- 3. Replace aggregate_organisation_intelligence_sources to exclude self-development
--    BEFORE the payload leaves the database boundary
-- 4. Minimise contributor identifiers (opaque md5 tokens, not client UUIDs)
-- 5. Drop non-essential candidate fields (category and occurrence timestamps)
--
-- DO NOT confuse with Manager Development Intelligence (separate API/product lens).
-- This migration is created for review and must be applied deliberately.

-- ---------------------------------------------------------------------------
-- A. Self-development column (canonical)
-- ---------------------------------------------------------------------------
alter table public.clients
  add column if not exists is_self_development boolean not null default false;

comment on column public.clients.is_self_development is
  'True when this client row is the practitioner''s own My Development record, not a managed person.';

create unique index if not exists clients_org_coach_self_development_uidx
  on public.clients (organisation_id, coach_id)
  where is_self_development = true
    and archived_at is null;

-- Transition: promote legacy role-sentinel rows.
update public.clients
set is_self_development = true
where is_self_development = false
  and archived_at is null
  and lower(btrim(coalesce(role, ''))) = 'self development';

-- ---------------------------------------------------------------------------
-- B. Helper — self-development classification (flag OR legacy role)
-- ---------------------------------------------------------------------------
create or replace function public.client_is_self_development(p_client_id uuid)
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
      and (
        c.is_self_development = true
        or lower(btrim(coalesce(c.role, ''))) = 'self development'
      )
  );
$$;

revoke all on function public.client_is_self_development(uuid) from public;
grant execute on function public.client_is_self_development(uuid) to authenticated;

comment on function public.client_is_self_development(uuid) is
  'True when the client is a Manager/practitioner self-development record (flag or legacy role sentinel).';

-- ---------------------------------------------------------------------------
-- C. Relationship OI aggregation — exclude self-development at DB boundary
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
    -- Stage 3.1A: RPC already excludes self-development; app sanitize may skip.
    'selfDevelopmentExcluded', true,
    'activeRelationships', (
      select count(*)::integer
      from public.clients c
      where c.organisation_id = p_organisation_id
        and c.archived_at is null
        and c.is_self_development = false
        and lower(btrim(coalesce(c.role, ''))) <> 'self development'
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
        and not public.client_is_self_development(s.client_id)
    ),
    'previousConversations', (
      select count(*)::integer
      from public.sessions s
      where s.organisation_id = p_organisation_id
        and s.updated_at >= v_prev_start_ts
        and s.updated_at < v_prev_end_ts
        and s.status in ('completed', 'awaiting_completion', 'in_progress')
        and not public.client_is_self_development(s.client_id)
    ),
    'completedConversations', (
      select count(*)::integer
      from public.sessions s
      where s.organisation_id = p_organisation_id
        and s.updated_at >= v_start
        and s.updated_at < v_end
        and s.status = 'completed'
        and not public.client_is_self_development(s.client_id)
    ),
    'previousCompletedConversations', (
      select count(*)::integer
      from public.sessions s
      where s.organisation_id = p_organisation_id
        and s.updated_at >= v_prev_start_ts
        and s.updated_at < v_prev_end_ts
        and s.status = 'completed'
        and not public.client_is_self_development(s.client_id)
    ),
    'actionsTotal', (
      select count(*)::integer
      from public.client_items ci
      where ci.organisation_id = p_organisation_id
        and ci.item_type = 'action'
        and ci.created_at >= v_start
        and ci.created_at < v_end
        and not public.client_is_self_development(ci.client_id)
    ),
    'actionsCompleted', (
      select count(*)::integer
      from public.client_items ci
      where ci.organisation_id = p_organisation_id
        and ci.item_type = 'action'
        and ci.created_at >= v_start
        and ci.created_at < v_end
        and lower(coalesce(ci.status, '')) in ('complete', 'completed')
        and not public.client_is_self_development(ci.client_id)
    ),
    'previousActionsTotal', (
      select count(*)::integer
      from public.client_items ci
      where ci.organisation_id = p_organisation_id
        and ci.item_type = 'action'
        and ci.created_at >= v_prev_start_ts
        and ci.created_at < v_prev_end_ts
        and not public.client_is_self_development(ci.client_id)
    ),
    'previousActionsCompleted', (
      select count(*)::integer
      from public.client_items ci
      where ci.organisation_id = p_organisation_id
        and ci.item_type = 'action'
        and ci.created_at >= v_prev_start_ts
        and ci.created_at < v_prev_end_ts
        and lower(coalesce(ci.status, '')) in ('complete', 'completed')
        and not public.client_is_self_development(ci.client_id)
    ),
    'reflectionsCompleted', (
      select count(*)::integer
      from public.sessions s
      where s.organisation_id = p_organisation_id
        and s.updated_at >= v_start
        and s.updated_at < v_end
        and nullif(btrim(coalesce(s.coach_reflection, '')), '') is not null
        and not public.client_is_self_development(s.client_id)
    ),
    'previousReflectionsCompleted', (
      select count(*)::integer
      from public.sessions s
      where s.organisation_id = p_organisation_id
        and s.updated_at >= v_prev_start_ts
        and s.updated_at < v_prev_end_ts
        and nullif(btrim(coalesce(s.coach_reflection, '')), '') is not null
        and not public.client_is_self_development(s.client_id)
    ),
    'developmentUpdatesCompleted', (
      select count(*)::integer
      from public.development_updates du
      where du.organisation_id = p_organisation_id
        and du.status = 'applied'
        and coalesce(du.applied_at, du.updated_at, du.created_at) >= v_start
        and coalesce(du.applied_at, du.updated_at, du.created_at) < v_end
        and not public.client_is_self_development(du.client_id)
    ),
    'previousDevelopmentUpdatesCompleted', (
      select count(*)::integer
      from public.development_updates du
      where du.organisation_id = p_organisation_id
        and du.status = 'applied'
        and coalesce(du.applied_at, du.updated_at, du.created_at) >= v_prev_start_ts
        and coalesce(du.applied_at, du.updated_at, du.created_at) < v_prev_end_ts
        and not public.client_is_self_development(du.client_id)
    ),
    'evidenceItems', (
      select count(*)::integer
      from public.intelligence_items ii
      where ii.organisation_id = p_organisation_id
        and ii.status = 'approved'
        and ii.archived_at is null
        and coalesce(ii.approved_at, ii.last_updated_at, ii.created_at) >= v_start
        and coalesce(ii.approved_at, ii.last_updated_at, ii.created_at) < v_end
        and not public.client_is_self_development(ii.client_id)
    ),
    'previousEvidenceItems', (
      select count(*)::integer
      from public.intelligence_items ii
      where ii.organisation_id = p_organisation_id
        and ii.status = 'approved'
        and ii.archived_at is null
        and coalesce(ii.approved_at, ii.last_updated_at, ii.created_at) >= v_prev_start_ts
        and coalesce(ii.approved_at, ii.last_updated_at, ii.created_at) < v_prev_end_ts
        and not public.client_is_self_development(ii.client_id)
    ),
    'contributingRelationships', (
      select count(distinct s.client_id)::integer
      from public.sessions s
      where s.organisation_id = p_organisation_id
        and s.updated_at >= v_start
        and s.updated_at < v_end
        and s.status in ('completed', 'awaiting_completion', 'in_progress')
        and not public.client_is_self_development(s.client_id)
    ),
    -- Opaque contributor tokens (md5) for distinct counting — not client UUIDs.
    -- themeKey remains normalised title text required for theme composition.
    'themeCandidates', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'themeKey', lower(regexp_replace(btrim(ii.title), '\s+', ' ', 'g')),
          'contributorKey', md5(ii.client_id::text),
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
        and coalesce(ii.approved_at, ii.last_updated_at, ii.created_at) >= v_start
        and coalesce(ii.approved_at, ii.last_updated_at, ii.created_at) < v_end
        and nullif(btrim(ii.title), '') is not null
        and char_length(ii.title) <= 120
        and not public.client_is_self_development(ii.client_id)
    ), '[]'::jsonb),
    'previousThemeCandidates', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'themeKey', lower(regexp_replace(btrim(ii.title), '\s+', ' ', 'g')),
          'contributorKey', md5(ii.client_id::text),
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
        and not public.client_is_self_development(ii.client_id)
    ), '[]'::jsonb),
    'progressSignals', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'signalName', lower(regexp_replace(btrim(pps.signal_name), '\s+', ' ', 'g')),
          'direction', pps.direction,
          'contributorKey', md5(pps.client_id::text),
          'coachValidated', pps.coach_validated
        )
      )
      from public.person_progress_signals pps
      where pps.organisation_id = p_organisation_id
        and pps.recorded_at >= v_start
        and pps.recorded_at < v_end
        and pps.coach_validated = true
        and not public.client_is_self_development(pps.client_id)
    ), '[]'::jsonb),
    'itemThemes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'themeKey', lower(regexp_replace(btrim(ci.title), '\s+', ' ', 'g')),
          'contributorKey', md5(ci.client_id::text),
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
        and not public.client_is_self_development(ci.client_id)
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
            and not public.client_is_self_development(s.client_id)
          union all
          select 1 as marker
          from public.intelligence_items ii
          where ii.organisation_id = p_organisation_id
            and coalesce(ii.approved_at, ii.created_at) >= v_prev_start_ts
            and coalesce(ii.approved_at, ii.created_at) < v_prev_end_ts
            and not public.client_is_self_development(ii.client_id)
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
  'Returns anonymised organisation aggregates for relationship Organisation Intelligence. Excludes self-development clients. Uses opaque contributor keys (not client UUIDs). Never returns private identity, session notes, evidence text or confidential references.';
