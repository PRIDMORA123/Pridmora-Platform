-- Stage 6 O1 — Owner operational People counts exclude My Development records.
--
-- team_members / total_team_members mean organisation People, not internal
-- Manager self-development client rows. Reuses client_is_self_development.
-- Commercial seat / Manager counts are unchanged.

create or replace function public.owner_organisation_usage_counts(p_organisation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_since timestamptz := now() - interval '30 days';
begin
  if not public.is_platform_owner(auth.uid()) then
    raise exception 'not authorised';
  end if;

  select jsonb_build_object(
    'managers_invited', (
      select count(*)::int from public.organisation_memberships m
      where m.organisation_id = p_organisation_id
        and m.professional_role = 'manager'
    ),
    'managers_activated', (
      select count(*)::int from public.organisation_memberships m
      where m.organisation_id = p_organisation_id
        and m.professional_role = 'manager'
        and m.status = 'active'
        and m.joined_at is not null
    ),
    'team_members', (
      select count(*)::int from public.clients c
      where c.organisation_id = p_organisation_id
        and c.archived_at is null
        and not public.client_is_self_development(c.id)
    ),
    'active_members', (
      select count(*)::int from public.organisation_memberships m
      where m.organisation_id = p_organisation_id
        and m.status = 'active'
    ),
    'active_users_30d', (
      select count(*)::int from public.organisation_memberships m
      where m.organisation_id = p_organisation_id
        and m.status = 'active'
        and m.last_active_at is not null
        and m.last_active_at >= v_since
    ),
    'conversations_completed_30d', (
      select count(*)::int from public.sessions s
      where s.organisation_id = p_organisation_id
        and s.status = 'completed'
        and s.updated_at >= v_since
    ),
    'conversations_completed_total', (
      select count(*)::int from public.sessions s
      where s.organisation_id = p_organisation_id
        and s.status = 'completed'
    ),
    'preparations_generated_30d', (
      select count(*)::int from public.sessions s
      where s.organisation_id = p_organisation_id
        and s.prep_ai_brief_generated_at is not null
        and s.prep_ai_brief_generated_at >= v_since
    ),
    'preparations_generated_total', (
      select count(*)::int from public.sessions s
      where s.organisation_id = p_organisation_id
        and s.prep_ai_brief_generated_at is not null
    ),
    'ai_requests_30d', (
      select count(*)::int from public.sessions s
      where s.organisation_id = p_organisation_id
        and (
          (s.prep_ai_brief_generated_at is not null and s.prep_ai_brief_generated_at >= v_since)
          or (s.summary_status is not null and s.updated_at >= v_since and s.summary_status <> 'none')
        )
    ),
    'last_activity_at', (
      select greatest(
        (select max(m.last_active_at) from public.organisation_memberships m where m.organisation_id = p_organisation_id),
        (select max(s.updated_at) from public.sessions s where s.organisation_id = p_organisation_id)
      )
    )
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.owner_platform_usage_totals()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_since timestamptz := now() - interval '30 days';
begin
  if not public.is_platform_owner(auth.uid()) then
    raise exception 'not authorised';
  end if;

  select jsonb_build_object(
    'active_organisations', (
      select count(*)::int from public.organisations o
      where o.status = 'active'
        and coalesce(o.licence_status, 'active') in ('active', 'trial')
        and o.organisation_type <> 'personal'
    ),
    'trial_organisations', (
      select count(*)::int from public.organisations o
      where o.status = 'active'
        and o.licence_status = 'trial'
    ),
    'total_managers', (
      select count(*)::int from public.organisation_memberships m
      join public.organisations o on o.id = m.organisation_id
      where m.professional_role = 'manager'
        and m.status = 'active'
        and o.organisation_type <> 'personal'
    ),
    'total_team_members', (
      select count(*)::int from public.clients c
      join public.organisations o on o.id = c.organisation_id
      where c.archived_at is null
        and o.organisation_type <> 'personal'
        and not public.client_is_self_development(c.id)
    ),
    'active_users_30d', (
      select count(*)::int from public.organisation_memberships m
      where m.status = 'active'
        and m.last_active_at is not null
        and m.last_active_at >= v_since
    ),
    'conversations_30d', (
      select count(*)::int from public.sessions s
      where s.status = 'completed'
        and s.updated_at >= v_since
    ),
    'ai_requests_30d', (
      select count(*)::int from public.sessions s
      where (
        (s.prep_ai_brief_generated_at is not null and s.prep_ai_brief_generated_at >= v_since)
        or (s.summary_status is not null and s.updated_at >= v_since and s.summary_status <> 'none')
      )
    )
  ) into v_result;

  return v_result;
end;
$$;
