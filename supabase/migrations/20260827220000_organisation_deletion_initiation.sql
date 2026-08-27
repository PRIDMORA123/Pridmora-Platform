-- DATA-LIFECYCLE DL-05: organisation deletion authorisation, run creation,
-- and pending_closure freeze only.
-- Duplicate open runs remain blocked by organisation_deletion_runs_one_open_per_org_idx.
--
-- DOES NOT implement organisation purge, DELETE FROM organisations,
-- storage deletion, commercial copy, support minimisation, certificates,
-- verification, Auth user deletion, or any later deletion stage.

create or replace function public.owner_initiate_organisation_closure(
  p_organisation_id uuid,
  p_confirmation_name text,
  p_instruction_reference text,
  p_inventory jsonb default '{}'::jsonb
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
  v_instruction text;
  v_inventory jsonb;
  v_now timestamptz := now();
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

  v_instruction := btrim(coalesce(p_instruction_reference, ''));
  if char_length(v_instruction) = 0 or char_length(v_instruction) > 200 then
    return jsonb_build_object('ok', false, 'code', 'INSTRUCTION_REQUIRED');
  end if;

  v_inventory := coalesce(p_inventory, '{}'::jsonb);
  if jsonb_typeof(v_inventory) is distinct from 'object' then
    v_inventory := '{}'::jsonb;
  end if;
  if v_inventory ?| array[
    'private_notes',
    'privateNotes',
    'extracted_text',
    'approved_content',
    'conversation_text',
    'structured_evidence'
  ] then
    v_inventory := '{}'::jsonb;
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

  if v_org.status = 'archived' then
    return jsonb_build_object('ok', false, 'code', 'ARCHIVED_ORGANISATION');
  end if;

  select *
  into v_run
  from public.organisation_deletion_runs r
  where r.former_organisation_id = p_organisation_id
    and r.status not in ('completed', 'blocked')
  for update;

  if found then
    if v_org.status = 'pending_closure' then
      return jsonb_build_object(
        'ok', true,
        'alreadyStarted', true,
        'deletionRunId', v_run.id,
        'organisationId', v_org.id,
        'formerOrganisationId', v_run.former_organisation_id,
        'organisationStatus', v_org.status,
        'runStatus', v_run.status,
        'stage', v_run.stage,
        'requestedAt', v_run.requested_at,
        'authorisedBy', v_run.authorized_by,
        'instructionReference', v_run.instruction_reference,
        'permanentDeletionOccurred', false
      );
    end if;
    return jsonb_build_object('ok', false, 'code', 'INCONSISTENT_RUN');
  end if;

  if v_org.status = 'pending_closure' then
    return jsonb_build_object('ok', false, 'code', 'INCONSISTENT_CLOSURE');
  end if;

  if v_org.status is distinct from 'active' then
    return jsonb_build_object('ok', false, 'code', 'STATUS_NOT_ALLOWED');
  end if;

  if btrim(coalesce(p_confirmation_name, '')) is distinct from btrim(v_org.name) then
    return jsonb_build_object('ok', false, 'code', 'CONFIRMATION_MISMATCH');
  end if;

  insert into public.organisation_deletion_runs (
    organisation_id,
    former_organisation_id,
    organisation_name_snapshot,
    organisation_type_snapshot,
    confirmation_name,
    instruction_reference,
    status,
    stage,
    authorized_by,
    requested_at,
    started_at,
    inventory,
    storage_status,
    verification_status,
    external_follow_up_status
  )
  values (
    v_org.id,
    v_org.id,
    v_org.name,
    v_org.organisation_type,
    btrim(p_confirmation_name),
    v_instruction,
    'frozen',
    'access_frozen',
    v_user,
    v_now,
    v_now,
    v_inventory,
    'not_started',
    'not_started',
    'not_started'
  )
  returning * into v_run;

  update public.organisations
  set
    status = 'pending_closure',
    updated_at = v_now
  where id = p_organisation_id
    and status = 'active';

  if not found then
    raise exception 'ORGANISATION_STATUS_UPDATE_FAILED';
  end if;

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
    'organisation.closure_initiated',
    'organisation_deletion_run',
    v_run.id,
    v_org.id,
    jsonb_build_object(
      'organisationId', v_org.id,
      'formerOrganisationId', v_org.id,
      'organisationNameSnapshot', v_org.name,
      'instructionReference', v_instruction,
      'deletionRunId', v_run.id,
      'previousStatus', 'active',
      'organisationStatus', 'pending_closure',
      'runStatus', 'frozen',
      'stage', 'access_frozen',
      'permanentDeletionOccurred', false
    )
  );

  insert into public.organisation_audit_log (
    organisation_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_org.id,
    v_user,
    'organisation.closure_initiated',
    'organisation_deletion_run',
    v_run.id,
    jsonb_build_object(
      'formerOrganisationId', v_org.id,
      'organisationNameSnapshot', v_org.name,
      'instructionReference', v_instruction,
      'deletionRunId', v_run.id,
      'organisationStatus', 'pending_closure',
      'runStatus', 'frozen',
      'stage', 'access_frozen',
      'permanentDeletionOccurred', false
    )
  );

  return jsonb_build_object(
    'ok', true,
    'alreadyStarted', false,
    'deletionRunId', v_run.id,
    'organisationId', v_org.id,
    'formerOrganisationId', v_org.id,
    'organisationStatus', 'pending_closure',
    'runStatus', 'frozen',
    'stage', 'access_frozen',
    'requestedAt', v_run.requested_at,
    'authorisedBy', v_user,
    'instructionReference', v_instruction,
    'permanentDeletionOccurred', false
  );
end;
$$;

comment on function public.owner_initiate_organisation_closure(uuid, text, text, jsonb) is
  'Platform Owner only. Atomically records an authorised organisation closure: '
  'creates one open organisation_deletion_run and sets organisations.status to pending_closure. '
  'Does not purge tenant data, delete the organisation row, copy commercial records, '
  'delete storage, create a certificate, or advance later deletion stages. '
  'Re-checks personal/sample/source/undeletable/archived/name/instruction in the database. '
  'Does not trust a client-supplied eligible flag.';

revoke all on function public.owner_initiate_organisation_closure(uuid, text, text, jsonb)
  from public;
revoke all on function public.owner_initiate_organisation_closure(uuid, text, text, jsonb)
  from anon;
grant execute on function public.owner_initiate_organisation_closure(uuid, text, text, jsonb)
  to authenticated;
grant execute on function public.owner_initiate_organisation_closure(uuid, text, text, jsonb)
  to service_role;
