-- DATA-LIFECYCLE: write-time minimisation for post-Slice-2 retained
-- platform_audit_events, retry-safe storage-cleanup success audit, and a
-- last-mile re-minimise RPC that works after the organisations row is gone.
--
-- Does NOT delete audit/support/commercial/tenant/Storage/Auth rows.
-- Does NOT create a certificate or set run status completed.
-- Does NOT insert organisation.purge_completed.

create or replace function public.write_minimised_deletion_lifecycle_audit(
  p_actor_user_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_former_organisation_id uuid,
  p_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
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
    p_actor_user_id,
    p_action,
    p_entity_type,
    public.minimise_platform_audit_entity_id(p_entity_type, p_entity_id),
    null,
    p_former_organisation_id,
    public.minimise_platform_audit_metadata(coalesce(p_metadata, '{}'::jsonb))
  );
end;
$$;

comment on function public.write_minimised_deletion_lifecycle_audit(uuid, text, text, uuid, uuid, jsonb) is
  'Insert a deletion-lifecycle platform_audit_events row already minimised. '
  'organisation_id is NULL. Metadata and entity_id use Slice 2 fail-closed minimisers. '
  'Future organisation.purge_completed must use this helper or the same minimisers.';

revoke all on function public.write_minimised_deletion_lifecycle_audit(uuid, text, text, uuid, uuid, jsonb)
  from public;
revoke all on function public.write_minimised_deletion_lifecycle_audit(uuid, text, text, uuid, uuid, jsonb)
  from anon;
grant execute on function public.write_minimised_deletion_lifecycle_audit(uuid, text, text, uuid, uuid, jsonb)
  to service_role;

create or replace function public.minimise_retained_platform_audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Write-time contract for retained deletion-lifecycle rows, including
  -- organisation.tenant_rows_purged and organisation.storage_cleanup_verified.
  if new.former_organisation_id is not null then
    new.organisation_id := null;
    new.entity_id := public.minimise_platform_audit_entity_id(
      new.entity_type,
      new.entity_id
    );
    new.metadata := public.minimise_platform_audit_metadata(
      coalesce(new.metadata, '{}'::jsonb)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists platform_audit_events_minimise_retained
  on public.platform_audit_events;
create trigger platform_audit_events_minimise_retained
before insert or update on public.platform_audit_events
for each row
execute function public.minimise_retained_platform_audit_row();

create or replace function public.owner_mark_organisation_storage_cleanup(
  p_organisation_id uuid,
  p_deletion_run_id uuid,
  p_storage_status text,
  p_stage text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_run public.organisation_deletion_runs%rowtype;
  v_status text;
  v_already boolean := false;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  end if;
  if not public.is_platform_owner(v_user) then
    return jsonb_build_object('ok', false, 'code', 'PERMISSION_DENIED');
  end if;
  if p_storage_status not in ('passed', 'failed', 'pending') then
    return jsonb_build_object('ok', false, 'code', 'ORGANISATION_REQUIRED');
  end if;

  select * into v_run from public.organisation_deletion_runs
  where id = p_deletion_run_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'RUN_NOT_FOUND');
  end if;
  if v_run.former_organisation_id is distinct from p_organisation_id then
    return jsonb_build_object('ok', false, 'code', 'INCONSISTENT_RUN');
  end if;
  if v_run.status not in ('purged', 'storage_cleaning', 'failed', 'verifying') then
    return jsonb_build_object('ok', false, 'code', 'RUN_STATE_NOT_ALLOWED');
  end if;

  if p_storage_status = 'passed' then
    v_status := 'verifying';
  elsif p_storage_status = 'failed' then
    v_status := 'failed';
  else
    v_status := 'storage_cleaning';
  end if;

  update public.organisation_deletion_runs
  set
    status = v_status,
    stage = p_stage,
    storage_status = p_storage_status,
    last_error = case
      when p_storage_status = 'failed' then coalesce(last_error, 'PARTIAL_STORAGE_FAILURE')
      else null
    end,
    updated_at = now()
  where id = p_deletion_run_id
    and status <> 'completed';

  if v_status = 'verifying' then
    select exists (
      select 1
      from public.platform_audit_events e
      where e.former_organisation_id = p_organisation_id
        and e.action = 'organisation.storage_cleanup_verified'
        and e.entity_type = 'organisation_deletion_run'
        and e.entity_id = v_run.id
    ) into v_already;
    if not v_already then
      perform public.write_minimised_deletion_lifecycle_audit(
        v_user,
        'organisation.storage_cleanup_verified',
        'organisation_deletion_run',
        v_run.id,
        p_organisation_id,
        jsonb_build_object(
          'formerOrganisationId', p_organisation_id,
          'deletionRunId', v_run.id,
          'runStatus', 'verifying',
          'stage', p_stage,
          'permanentDeletionOccurred', true
        )
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'deletionRunId', v_run.id,
    'runStatus', v_status,
    'stage', p_stage,
    'storageStatus', p_storage_status,
    'certificateCreated', false,
    'authUsersDeleted', false
  );
end;
$$;

comment on function public.owner_mark_organisation_storage_cleanup(uuid, uuid, text, text) is
  'Platform Owner only. Records Storage cleanup result. passed advances to '
  'verifying (awaiting certificate). Success audit is written already minimised '
  'and is not duplicated on retry. Never sets completed and never inserts a certificate.';

revoke all on function public.owner_mark_organisation_storage_cleanup(uuid, uuid, text, text)
  from public;
revoke all on function public.owner_mark_organisation_storage_cleanup(uuid, uuid, text, text)
  from anon;
grant execute on function public.owner_mark_organisation_storage_cleanup(uuid, uuid, text, text)
  to authenticated;
grant execute on function public.owner_mark_organisation_storage_cleanup(uuid, uuid, text, text)
  to service_role;

create or replace function public.owner_reminimise_organisation_audit_events(
  p_former_organisation_id uuid,
  p_deletion_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_run public.organisation_deletion_runs%rowtype;
  v_updated integer := 0;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  end if;
  if not public.is_platform_owner(v_user) then
    return jsonb_build_object('ok', false, 'code', 'PERMISSION_DENIED');
  end if;
  if p_former_organisation_id is null or p_deletion_run_id is null then
    return jsonb_build_object('ok', false, 'code', 'ORGANISATION_REQUIRED');
  end if;

  select * into v_run from public.organisation_deletion_runs
  where id = p_deletion_run_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'RUN_NOT_FOUND');
  end if;
  if v_run.former_organisation_id is distinct from p_former_organisation_id then
    return jsonb_build_object('ok', false, 'code', 'INCONSISTENT_RUN');
  end if;
  if v_run.status not in ('purged', 'storage_cleaning', 'verifying', 'failed') then
    return jsonb_build_object('ok', false, 'code', 'RUN_STATE_NOT_ALLOWED');
  end if;

  update public.platform_audit_events
  set
    organisation_id = null,
    entity_id = public.minimise_platform_audit_entity_id(entity_type, entity_id),
    metadata = public.minimise_platform_audit_metadata(coalesce(metadata, '{}'::jsonb))
  where former_organisation_id = p_former_organisation_id;

  get diagnostics v_updated = row_count;

  return jsonb_build_object(
    'ok', true,
    'formerOrganisationId', p_former_organisation_id,
    'deletionRunId', v_run.id,
    'runStatus', v_run.status,
    'stage', v_run.stage,
    'auditEventsUpdated', v_updated,
    'runStatusUnchanged', true,
    'certificateCreated', false,
    'permanentDeletionOccurred', false,
    'authUsersDeleted', false,
    'storageDeleted', false,
    'tenantRowsDeleted', false
  );
end;
$$;

comment on function public.owner_reminimise_organisation_audit_events(uuid, uuid) is
  'Platform Owner only. Idempotently re-minimises retained platform_audit_events '
  'for one former organisation after tenant purge. Does not require the '
  'organisations row. Does not change the deletion run, create a certificate, '
  'or insert another audit event.';

revoke all on function public.owner_reminimise_organisation_audit_events(uuid, uuid)
  from public;
revoke all on function public.owner_reminimise_organisation_audit_events(uuid, uuid)
  from anon;
grant execute on function public.owner_reminimise_organisation_audit_events(uuid, uuid)
  to authenticated;
grant execute on function public.owner_reminimise_organisation_audit_events(uuid, uuid)
  to service_role;
