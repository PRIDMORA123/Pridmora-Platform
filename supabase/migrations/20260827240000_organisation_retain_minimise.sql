-- DATA-LIFECYCLE DL-08 Slice 2: retain_minimise for support_cases and
-- platform_audit_events.
--
-- DOES NOT delete tenant rows, Storage objects, Auth users, organisations,
-- commercial records, or deletion-run rows. Does not create certificates.
-- Does not advance organisation_deletion_runs.status.

alter table public.support_cases
  add column if not exists former_organisation_id uuid null;

alter table public.platform_audit_events
  add column if not exists former_organisation_id uuid null;

create index if not exists support_cases_former_org_idx
  on public.support_cases (former_organisation_id);

create index if not exists platform_audit_events_former_org_idx
  on public.platform_audit_events (former_organisation_id);

comment on column public.support_cases.former_organisation_id is
  'Set during retain_minimise from organisation_id. No organisations FK. Survives organisation deletion.';

comment on column public.platform_audit_events.former_organisation_id is
  'Set during retain_minimise from organisation_id. No organisations FK. Survives organisation deletion.';

create or replace function public.minimise_platform_audit_metadata(p_metadata jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_key text;
  v_value jsonb;
  v_allowed text[] := array[
    'deletionRunId',
    'formerOrganisationId',
    'organisationId',
    'instructionReference',
    'runStatus',
    'stage',
    'organisationStatus',
    'previousStatus',
    'permanentDeletionOccurred',
    'alreadyCopied',
    'alreadyMinimised',
    'repaired',
    'category',
    'status',
    'priority',
    'conversionStatus',
    'licenceStatus',
    'previousLicenceStatus',
    'trialConversionStatus',
    'licencePlanName',
    'planCode',
    'methodType',
    'fields',
    'role',
    'aiEnabled',
    'key',
    'licenceEndsAt',
    'previousLicenceEndsAt',
    'sourceCounts',
    'retainedCounts',
    'supportCasesMinimised',
    'auditEventsMinimised'
  ];
  v_fields jsonb;
  v_item jsonb;
  v_text text;
begin
  if p_metadata is null or jsonb_typeof(p_metadata) is distinct from 'object' then
    return '{}'::jsonb;
  end if;

  for v_key, v_value in
    select key, value from jsonb_each(p_metadata)
  loop
    if not (v_key = any (v_allowed)) then
      continue;
    end if;

    if v_key in ('sourceCounts', 'retainedCounts') then
      if jsonb_typeof(v_value) is distinct from 'object' then
        continue;
      end if;
      if exists (
        select 1
        from jsonb_each(v_value) e
        where jsonb_typeof(e.value) not in ('number', 'null')
      ) then
        continue;
      end if;
      v_out := v_out || jsonb_build_object(v_key, v_value);
      continue;
    end if;

    if v_key = 'fields' then
      if jsonb_typeof(v_value) is distinct from 'array' then
        continue;
      end if;
      v_fields := '[]'::jsonb;
      for v_item in
        select value from jsonb_array_elements(v_value) limit 50
      loop
        if jsonb_typeof(v_item) = 'string' then
          v_text := v_item #>> '{}';
          if char_length(v_text) <= 80 then
            v_fields := v_fields || jsonb_build_array(v_text);
          end if;
        end if;
      end loop;
      v_out := v_out || jsonb_build_object(v_key, v_fields);
      continue;
    end if;

    if jsonb_typeof(v_value) not in ('string', 'number', 'boolean', 'null') then
      continue;
    end if;

    if jsonb_typeof(v_value) = 'string' then
      v_text := v_value #>> '{}';
      if char_length(v_text) > 200 then
        continue;
      end if;
    end if;

    v_out := v_out || jsonb_build_object(v_key, v_value);
  end loop;

  return v_out;
end;
$$;

comment on function public.minimise_platform_audit_metadata(jsonb) is
  'Fail-closed allowlist for platform_audit_events.metadata after retain_minimise. '
  'Drops free text, nested objects other than numeric count maps, and unknown keys.';

revoke all on function public.minimise_platform_audit_metadata(jsonb) from public;
revoke all on function public.minimise_platform_audit_metadata(jsonb) from anon;

create or replace function public.minimise_platform_audit_entity_id(
  p_entity_type text,
  p_entity_id uuid
)
returns uuid
language sql
immutable
set search_path = public
as $$
  select case
    when p_entity_type in (
      'organisation_deletion_run',
      'support_case',
      'organisation_subscription',
      'invoice',
      'organisation_payment_method',
      'purchase_order',
      'organisation_contract',
      'organisation_trial'
    ) then p_entity_id
    else null
  end;
$$;

comment on function public.minimise_platform_audit_entity_id(text, uuid) is
  'Fail-closed entity_id retain allowlist for retain_minimise. '
  'Unknown and future entity_type values return null.';

revoke all on function public.minimise_platform_audit_entity_id(text, uuid) from public;
revoke all on function public.minimise_platform_audit_entity_id(text, uuid) from anon;

create or replace function public.owner_minimise_organisation_retain_records(
  p_organisation_id uuid,
  p_deletion_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org public.organisations%rowtype;
  v_run public.organisation_deletion_runs%rowtype;
  v_support_pending integer := 0;
  v_support_minimised integer := 0;
  v_audit_pending integer := 0;
  v_audit_minimised integer := 0;
  v_already boolean := false;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  end if;

  if not public.is_platform_owner(v_user) then
    return jsonb_build_object('ok', false, 'code', 'PERMISSION_DENIED');
  end if;

  if p_organisation_id is null or p_deletion_run_id is null then
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

  if v_org.organisation_type = 'personal' then
    return jsonb_build_object('ok', false, 'code', 'PERSONAL_ORGANISATION');
  end if;

  if exists (
    select 1
    from public.sample_organisation_installations i
    where i.organisation_id = p_organisation_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'SAMPLE_INSTALLATION');
  end if;

  if exists (
    select 1
    from public.sample_organisation_installations i
    where i.source_organisation_id = p_organisation_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'SAMPLE_SOURCE_ORGANISATION');
  end if;

  if exists (
    select 1
    from public.platform_settings s
    where s.key = 'undeletable_organisation_ids'
      and coalesce(s.value -> 'ids', '[]'::jsonb) ? p_organisation_id::text
  ) then
    return jsonb_build_object('ok', false, 'code', 'UNDELETABLE_ORGANISATION');
  end if;

  if v_org.status is distinct from 'pending_closure' then
    return jsonb_build_object('ok', false, 'code', 'STATUS_NOT_ALLOWED');
  end if;

  select *
  into v_run
  from public.organisation_deletion_runs r
  where r.id = p_deletion_run_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'RUN_NOT_FOUND');
  end if;

  if v_run.former_organisation_id is distinct from p_organisation_id
     or v_run.organisation_id is distinct from p_organisation_id then
    return jsonb_build_object('ok', false, 'code', 'INCONSISTENT_RUN');
  end if;

  if v_run.status not in ('frozen', 'commercial_copied') then
    return jsonb_build_object('ok', false, 'code', 'RUN_STATE_NOT_ALLOWED');
  end if;

  update public.support_cases
  set
    former_organisation_id = coalesce(former_organisation_id, organisation_id),
    organisation_id = null,
    user_id = null,
    subject = 'Minimised support case',
    description = '',
    assigned_to = null,
    resolution_notes = null,
    created_by = null,
    updated_at = now()
  where organisation_id = p_organisation_id
     or former_organisation_id = p_organisation_id;

  update public.platform_audit_events
  set
    former_organisation_id = coalesce(former_organisation_id, organisation_id),
    organisation_id = null,
    entity_id = public.minimise_platform_audit_entity_id(entity_type, entity_id),
    metadata = public.minimise_platform_audit_metadata(metadata)
  where organisation_id = p_organisation_id
     or former_organisation_id = p_organisation_id;

  select count(*) into v_support_pending
  from public.support_cases
  where organisation_id = p_organisation_id;

  select count(*) into v_support_minimised
  from public.support_cases
  where former_organisation_id = p_organisation_id;

  select count(*) into v_audit_pending
  from public.platform_audit_events
  where organisation_id = p_organisation_id;

  select count(*) into v_audit_minimised
  from public.platform_audit_events
  where former_organisation_id = p_organisation_id;

  v_already := v_support_pending = 0 and v_audit_pending = 0;

  insert into public.platform_audit_events (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    organisation_id,
    former_organisation_id,
    metadata
  )
  values (
    v_user,
    'organisation.retain_minimised',
    'organisation_deletion_run',
    v_run.id,
    null,
    v_org.id,
    public.minimise_platform_audit_metadata(
      jsonb_build_object(
        'formerOrganisationId', v_org.id,
        'deletionRunId', v_run.id,
        'alreadyMinimised', v_already,
        'supportCasesMinimised', v_support_minimised,
        'auditEventsMinimised', v_audit_minimised,
        'permanentDeletionOccurred', false,
        'runStatus', v_run.status
      )
    )
  );

  return jsonb_build_object(
    'ok', true,
    'alreadyMinimised', v_already,
    'deletionRunId', v_run.id,
    'organisationId', v_org.id,
    'formerOrganisationId', v_org.id,
    'organisationStatus', v_org.status,
    'runStatus', v_run.status,
    'stage', v_run.stage,
    'supportCasesPending', v_support_pending,
    'supportCasesMinimised', v_support_minimised,
    'auditEventsPending', v_audit_pending,
    'auditEventsMinimised', v_audit_minimised,
    'runStatusUnchanged', true,
    'tenantRowsDeleted', false,
    'storageDeleted', false,
    'authUsersDeleted', false,
    'permanentDeletionOccurred', false
  );
end;
$$;

comment on function public.owner_minimise_organisation_retain_records(uuid, uuid) is
  'Platform Owner only. Minimises support_cases and platform_audit_events for a '
  'pending_closure organisation with a frozen or commercial_copied deletion run. '
  'Clears free text, personal identifiers, and non-allowlisted metadata. Keeps the '
  'rows. Does not delete tenant data, Storage, or Auth users, does not change '
  'organisation status, and does not advance the deletion run.';

revoke all on function public.owner_minimise_organisation_retain_records(uuid, uuid)
  from public;
revoke all on function public.owner_minimise_organisation_retain_records(uuid, uuid)
  from anon;
grant execute on function public.owner_minimise_organisation_retain_records(uuid, uuid)
  to authenticated;
grant execute on function public.owner_minimise_organisation_retain_records(uuid, uuid)
  to service_role;
