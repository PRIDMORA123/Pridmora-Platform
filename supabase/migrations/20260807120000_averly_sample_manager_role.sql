-- Averly sample organisation installs as a manager-development demonstration.
-- Membership professional_role must be manager so product language resolves correctly.
-- Legacy Northbridge installs remain coach via pack-key branch.
-- Additive only. Does not modify existing installation rows.

create or replace function public.begin_sample_organisation_installation(
  p_source_organisation_id uuid,
  p_pack_key text,
  p_pack_version text,
  p_organisation_name text,
  p_organisation_type text default 'public_sector',
  p_slug text default null,
  p_idempotency_key text default null,
  p_seats_purchased integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_existing public.sample_organisation_installations%rowtype;
  v_org_id uuid;
  v_membership_id uuid;
  v_installation_id uuid;
  v_slug text;
  v_professional_role text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  end if;

  if p_source_organisation_id is null or nullif(trim(p_pack_key), '') is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  end if;

  if not public.has_organisation_permission(
    p_source_organisation_id, v_user, 'sample_organisation.manage'
  ) then
    return jsonb_build_object('ok', false, 'code', 'PERMISSION_DENIED');
  end if;

  v_professional_role := case
    when p_pack_key = 'averly-services-group' then 'manager'
    else 'coach'
  end;

  -- Idempotency / duplicate active install
  if p_idempotency_key is not null then
    select * into v_existing
    from public.sample_organisation_installations
    where installed_by = v_user
      and pack_key = p_pack_key
      and idempotency_key = p_idempotency_key
      and status in ('installing', 'ready', 'resetting', 'removing', 'intelligence_pending')
    limit 1;

    if found then
      return jsonb_build_object(
        'ok', true,
        'resumed', true,
        'installationId', v_existing.id,
        'organisationId', v_existing.organisation_id,
        'status', v_existing.status,
        'stage', v_existing.stage
      );
    end if;
  end if;

  select * into v_existing
  from public.sample_organisation_installations
  where installed_by = v_user
    and pack_key = p_pack_key
    and status in ('installing', 'ready', 'resetting', 'removing', 'intelligence_pending')
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'resumed', true,
      'installationId', v_existing.id,
      'organisationId', v_existing.organisation_id,
      'status', v_existing.status,
      'stage', v_existing.stage,
      'code', case
        when v_existing.status = 'ready' then 'ALREADY_INSTALLED'
        else 'IN_PROGRESS'
      end
    );
  end if;

  v_slug := coalesce(
    nullif(trim(p_slug), ''),
    'sample-' || replace(p_pack_key, '_', '-') || '-' || substr(replace(v_user::text, '-', ''), 1, 12)
  );

  insert into public.organisations (
    name,
    slug,
    organisation_type,
    status,
    created_by,
    default_preparation_style,
    ai_enabled,
    data_retention_policy_label,
    branding_status,
    licence_plan_name,
    practitioner_seats_purchased,
    licence_status
  )
  values (
    nullif(trim(p_organisation_name), ''),
    v_slug,
    coalesce(nullif(trim(p_organisation_type), ''), 'public_sector'),
    'active',
    v_user,
    'guided',
    true,
    'standard',
    'none',
    'Sample',
    greatest(coalesce(p_seats_purchased, 5), 1),
    'active'
  )
  returning id into v_org_id;

  insert into public.organisation_memberships (
    organisation_id,
    user_id,
    role,
    professional_role,
    status,
    joined_at,
    last_active_at
  )
  values (
    v_org_id,
    v_user,
    'owner',
    v_professional_role,
    'active',
    now(),
    now()
  )
  returning id into v_membership_id;

  insert into public.sample_organisation_installations (
    organisation_id,
    source_organisation_id,
    pack_key,
    pack_version,
    status,
    stage,
    installed_by,
    idempotency_key,
    metadata
  )
  values (
    v_org_id,
    p_source_organisation_id,
    p_pack_key,
    p_pack_version,
    'installing',
    'creating_organisation',
    v_user,
    nullif(trim(p_idempotency_key), ''),
    jsonb_build_object(
      'packKey', p_pack_key,
      'packVersion', p_pack_version,
      'professionalRole', v_professional_role
    )
  )
  returning id into v_installation_id;

  insert into public.sample_organisation_records (
    installation_id, organisation_id, record_type, record_id, pack_entity_key
  ) values
    (v_installation_id, v_org_id, 'organisation', v_org_id, p_pack_key),
    (v_installation_id, v_org_id, 'membership', v_membership_id, 'owner');

  return jsonb_build_object(
    'ok', true,
    'resumed', false,
    'installationId', v_installation_id,
    'organisationId', v_org_id,
    'membershipId', v_membership_id,
    'status', 'installing',
    'stage', 'creating_organisation'
  );
exception
  when unique_violation then
    select * into v_existing
    from public.sample_organisation_installations
    where installed_by = v_user
      and pack_key = p_pack_key
      and status in ('installing', 'ready', 'resetting', 'removing', 'intelligence_pending')
    order by created_at desc
    limit 1;

    if found then
      return jsonb_build_object(
        'ok', true,
        'resumed', true,
        'installationId', v_existing.id,
        'organisationId', v_existing.organisation_id,
        'status', v_existing.status,
        'stage', v_existing.stage,
        'code', 'CONCURRENT_BLOCKED'
      );
    end if;

    return jsonb_build_object('ok', false, 'code', 'CONCURRENT_BLOCKED');
end;
$$;
