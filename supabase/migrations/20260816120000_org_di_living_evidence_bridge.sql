-- Gate 3.2B — Privacy-safe organisational DI bridge (Option 3).
-- Extends aggregate_organisation_intelligence_sources to emit authorised living
-- development_evidence capability keys (opaque contributor tokens only).
-- Does NOT create tables. Does NOT revive intelligence_items generation.
-- Legacy approved intelligence_items titles remain temporary theme candidates.
-- Additive function replace only.

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
    -- Gate 3.2B: authorised living Development Evidence volume (not intelligence_items).
    'evidenceItems', (
      select count(*)::integer
      from public.development_evidence de
      where de.organisation_id = p_organisation_id
        and de.deleted_at is null
        and de.restricted = false
        and de.include_in_intelligence = true
        and de.review_status in ('approved', 'edited')
        and coalesce(de.updated_at, de.created_at) >= v_start
        and coalesce(de.updated_at, de.created_at) < v_end
        and not public.client_is_self_development(de.client_id)
    ),
    'previousEvidenceItems', (
      select count(*)::integer
      from public.development_evidence de
      where de.organisation_id = p_organisation_id
        and de.deleted_at is null
        and de.restricted = false
        and de.include_in_intelligence = true
        and de.review_status in ('approved', 'edited')
        and coalesce(de.updated_at, de.created_at) >= v_prev_start_ts
        and coalesce(de.updated_at, de.created_at) < v_prev_end_ts
        and not public.client_is_self_development(de.client_id)
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
    -- Gate 3.2B: capability keys from authorised living evidence (opaque contributor keys).
    -- App maps capabilityKey → catalogue themeKey; unmapped keys emit no org signal.
    'authorisedEvidenceCapabilities', coalesce((
      select jsonb_agg(row_json)
      from (
        select jsonb_build_object(
          'capabilityKey', cap.capability_key,
          'contributorKey', md5(de.client_id::text),
          'sourceType', 'development_evidence',
          'occurredAt', coalesce(de.updated_at, de.created_at)
        ) as row_json
        from public.development_evidence de
        cross join lateral unnest(de.capability_keys) as cap(capability_key)
        where de.organisation_id = p_organisation_id
          and de.deleted_at is null
          and de.restricted = false
          and de.include_in_intelligence = true
          and de.review_status in ('approved', 'edited')
          and coalesce(de.updated_at, de.created_at) >= v_start
          and coalesce(de.updated_at, de.created_at) < v_end
          and nullif(btrim(cap.capability_key), '') is not null
          and not public.client_is_self_development(de.client_id)
        union all
        select jsonb_build_object(
          'capabilityKey', o.capability_key,
          'contributorKey', md5(o.client_id::text),
          'sourceType', 'development_evidence_observation',
          'occurredAt', coalesce(o.updated_at, o.created_at)
        ) as row_json
        from public.development_evidence_observations o
        inner join public.development_evidence de
          on de.id = o.evidence_id
        where o.organisation_id = p_organisation_id
          and o.include_in_intelligence = true
          and o.review_status in ('approved', 'edited')
          and de.deleted_at is null
          and de.restricted = false
          and de.include_in_intelligence = true
          and de.review_status in ('approved', 'edited')
          and coalesce(o.updated_at, o.created_at) >= v_start
          and coalesce(o.updated_at, o.created_at) < v_end
          and nullif(btrim(coalesce(o.capability_key, '')), '') is not null
          and not public.client_is_self_development(o.client_id)
      ) living_caps
    ), '[]'::jsonb),
    'previousAuthorisedEvidenceCapabilities', coalesce((
      select jsonb_agg(row_json)
      from (
        select jsonb_build_object(
          'capabilityKey', cap.capability_key,
          'contributorKey', md5(de.client_id::text),
          'sourceType', 'development_evidence',
          'occurredAt', coalesce(de.updated_at, de.created_at)
        ) as row_json
        from public.development_evidence de
        cross join lateral unnest(de.capability_keys) as cap(capability_key)
        where de.organisation_id = p_organisation_id
          and de.deleted_at is null
          and de.restricted = false
          and de.include_in_intelligence = true
          and de.review_status in ('approved', 'edited')
          and coalesce(de.updated_at, de.created_at) >= v_prev_start_ts
          and coalesce(de.updated_at, de.created_at) < v_prev_end_ts
          and nullif(btrim(cap.capability_key), '') is not null
          and not public.client_is_self_development(de.client_id)
        union all
        select jsonb_build_object(
          'capabilityKey', o.capability_key,
          'contributorKey', md5(o.client_id::text),
          'sourceType', 'development_evidence_observation',
          'occurredAt', coalesce(o.updated_at, o.created_at)
        ) as row_json
        from public.development_evidence_observations o
        inner join public.development_evidence de
          on de.id = o.evidence_id
        where o.organisation_id = p_organisation_id
          and o.include_in_intelligence = true
          and o.review_status in ('approved', 'edited')
          and de.deleted_at is null
          and de.restricted = false
          and de.include_in_intelligence = true
          and de.review_status in ('approved', 'edited')
          and coalesce(o.updated_at, o.created_at) >= v_prev_start_ts
          and coalesce(o.updated_at, o.created_at) < v_prev_end_ts
          and nullif(btrim(coalesce(o.capability_key, '')), '') is not null
          and not public.client_is_self_development(o.client_id)
      ) living_caps_prev
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
          union all
          select 1 as marker
          from public.development_evidence de
          where de.organisation_id = p_organisation_id
            and de.deleted_at is null
            and de.include_in_intelligence = true
            and de.review_status in ('approved', 'edited')
            and coalesce(de.updated_at, de.created_at) >= v_prev_start_ts
            and coalesce(de.updated_at, de.created_at) < v_prev_end_ts
            and not public.client_is_self_development(de.client_id)
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
  'Returns anonymised organisation aggregates for relationship People Development Intelligence. Includes authorised living development_evidence capability keys (opaque contributor keys). Excludes self-development. Never returns private identity, session notes, evidence text or confidential references. Does not create intelligence_items.';
