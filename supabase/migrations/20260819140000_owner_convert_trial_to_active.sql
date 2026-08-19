-- Atomic Owner Console: convert trial organisation licence to permanent active.
-- Single transaction via security-definer RPC (platform owners only).

create or replace function public.owner_convert_trial_organisation_to_active(
  p_organisation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org public.organisations%rowtype;
  v_previous_ends date;
  v_plan_name text;
  v_trial_exists boolean := false;
  v_trial_already_converted boolean := false;
  v_already_fully_converted boolean := false;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  end if;

  if not public.is_platform_owner(v_user) then
    return jsonb_build_object('ok', false, 'code', 'PERMISSION_DENIED');
  end if;

  if p_organisation_id is null then
    return jsonb_build_object('ok', false, 'code', 'ORGANISATION_REQUIRED');
  end if;

  select *
  into v_org
  from public.organisations
  where id = p_organisation_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  select exists (
    select 1
    from public.organisation_trials t
    where t.organisation_id = p_organisation_id
  )
  into v_trial_exists;

  if v_trial_exists then
    select t.conversion_status = 'converted'
    into v_trial_already_converted
    from public.organisation_trials t
    where t.organisation_id = p_organisation_id;
  else
    v_trial_already_converted := true;
  end if;

  -- Idempotent success: already permanent active with cleared end date
  -- and trial history marked converted (or no trial row).
  if v_org.licence_status = 'active'
     and v_org.licence_ends_at is null
     and v_trial_already_converted then
    return jsonb_build_object(
      'ok', true,
      'alreadyConverted', true,
      'organisationId', v_org.id,
      'licenceStatus', 'active',
      'licenceEndsAt', null,
      'licencePlanName', v_org.licence_plan_name,
      'practitionerSeatsPurchased', v_org.practitioner_seats_purchased,
      'organisationStatus', v_org.status
    );
  end if;

  -- Repair incomplete prior conversion only when a trial history row exists
  -- and conversion is unfinished (avoids clearing renewal dates on ordinary active accounts).
  if v_org.licence_status = 'active'
     and v_trial_exists
     and (
       not v_trial_already_converted
       or v_org.licence_ends_at is not null
     ) then
    v_previous_ends := v_org.licence_ends_at;
    v_plan_name := v_org.licence_plan_name;

    update public.organisations
    set
      licence_ends_at = null,
      updated_at = now()
    where id = p_organisation_id
      and licence_status = 'active'
      and licence_ends_at is not null;

    update public.organisation_trials
    set
      conversion_status = 'converted',
      updated_at = now()
    where organisation_id = p_organisation_id
      and conversion_status is distinct from 'converted';

    insert into public.platform_audit_events (
      actor_user_id,
      action,
      entity_type,
      entity_id,
      organisation_id,
      metadata
    )
    values (
      v_user,
      'organisation.trial_converted_to_active',
      'organisation',
      p_organisation_id,
      p_organisation_id,
      jsonb_build_object(
        'previousLicenceStatus', 'active',
        'licenceStatus', 'active',
        'previousLicenceEndsAt', v_previous_ends,
        'licenceEndsAt', null,
        'licencePlanName', v_plan_name,
        'trialConversionStatus', 'converted',
        'repaired', true
      )
    );

    return jsonb_build_object(
      'ok', true,
      'alreadyConverted', false,
      'repaired', true,
      'organisationId', p_organisation_id,
      'licenceStatus', 'active',
      'licenceEndsAt', null,
      'licencePlanName', v_plan_name,
      'practitionerSeatsPurchased', v_org.practitioner_seats_purchased,
      'organisationStatus', v_org.status
    );
  end if;

  if v_org.licence_status is distinct from 'trial' then
    return jsonb_build_object('ok', false, 'code', 'NOT_TRIAL');
  end if;

  v_previous_ends := v_org.licence_ends_at;
  v_plan_name := v_org.licence_plan_name;

  update public.organisations
  set
    licence_status = 'active',
    licence_ends_at = null,
    updated_at = now()
  where id = p_organisation_id
    and licence_status = 'trial';

  if not found then
    return jsonb_build_object('ok', false, 'code', 'UPDATE_FAILED');
  end if;

  -- Preserve trial history row; mark converted. Zero rows is allowed.
  update public.organisation_trials
  set
    conversion_status = 'converted',
    updated_at = now()
  where organisation_id = p_organisation_id
    and conversion_status is distinct from 'converted';

  insert into public.platform_audit_events (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    organisation_id,
    metadata
  )
  values (
    v_user,
    'organisation.trial_converted_to_active',
    'organisation',
    p_organisation_id,
    p_organisation_id,
    jsonb_build_object(
      'previousLicenceStatus', 'trial',
      'licenceStatus', 'active',
      'previousLicenceEndsAt', v_previous_ends,
      'licenceEndsAt', null,
      'licencePlanName', v_plan_name,
      'trialConversionStatus', 'converted'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'alreadyConverted', false,
    'organisationId', p_organisation_id,
    'licenceStatus', 'active',
    'licenceEndsAt', null,
    'licencePlanName', v_plan_name,
    'practitionerSeatsPurchased', v_org.practitioner_seats_purchased,
    'organisationStatus', v_org.status
  );
end;
$$;

comment on function public.owner_convert_trial_organisation_to_active(uuid) is
  'Platform Owner: atomically convert a trial organisation to permanent active (same org id). Clears licence_ends_at, marks organisation_trials converted, writes platform audit. Idempotent when already converted.';

revoke all on function public.owner_convert_trial_organisation_to_active(uuid)
  from public;
revoke all on function public.owner_convert_trial_organisation_to_active(uuid)
  from anon;
grant execute on function public.owner_convert_trial_organisation_to_active(uuid)
  to authenticated;
grant execute on function public.owner_convert_trial_organisation_to_active(uuid)
  to service_role;
