-- DATA-LIFECYCLE: Platform Owner completion RPC. Inserts the existing
-- immutable organisation_deletion_certificates row and marks the deletion
-- run completed. Claim remains APPLICATION DATA PURGED.
--
-- Does NOT delete tenant rows, Storage, Auth users, commercial records,
-- support cases, or audit events.
-- Does NOT recreate the organisations row.
-- Does NOT set backup_status or external_follow_up_status to passed.
-- Does NOT insert a broader erasure claim.
-- Does NOT overwrite organisation_deletion_runs.verification_status
-- (that column is the DL-06 commercial-copy result).

create or replace function public.owner_issue_organisation_deletion_certificate(
  p_former_organisation_id uuid,
  p_deletion_run_id uuid,
  p_storage_cleanup_status text,
  p_commercial_retained_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_run public.organisation_deletion_runs%rowtype;
  v_certificate public.organisation_deletion_certificates%rowtype;
  v_org_exists boolean := false;
  v_commercial_count integer := 0;
  v_audit_exists boolean := false;
  v_summary jsonb;
  v_now timestamptz := now();
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
  if p_storage_cleanup_status is null
     or p_storage_cleanup_status not in ('passed', 'not_applicable') then
    return jsonb_build_object('ok', false, 'code', 'STORAGE_STATUS_MISMATCH');
  end if;
  if p_commercial_retained_count is null or p_commercial_retained_count < 0 then
    return jsonb_build_object('ok', false, 'code', 'RETAINED_COMMERCIAL_MISMATCH');
  end if;

  select * into v_run
  from public.organisation_deletion_runs
  where id = p_deletion_run_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'RUN_NOT_FOUND');
  end if;
  if v_run.former_organisation_id is distinct from p_former_organisation_id then
    return jsonb_build_object('ok', false, 'code', 'INCONSISTENT_RUN');
  end if;

  select * into v_certificate
  from public.organisation_deletion_certificates
  where deletion_run_id = v_run.id;

  if found then
    if v_run.status = 'completed'
       and v_certificate.former_organisation_id is not distinct from p_former_organisation_id then
      return jsonb_build_object(
        'ok', true,
        'alreadyCompleted', true,
        'certificateCreated', false,
        'runCompleted', true,
        'deletionRunId', v_run.id,
        'formerOrganisationId', v_run.former_organisation_id,
        'runStatus', v_run.status,
        'stage', v_run.stage,
        'completedAt', v_run.completed_at,
        'commercialCopyVerificationStatus', v_run.verification_status,
        'storageCleanupStatus', v_certificate.storage_cleanup_status,
        'commercialRetainedCount', v_certificate.commercial_retained_count,
        'eligibleErasureClaim', 'APPLICATION DATA PURGED',
        'backupStatus', 'unknown',
        'externalFollowUpStatus', 'unknown'
      );
    end if;
    return jsonb_build_object('ok', false, 'code', 'INCONSISTENT_CERTIFICATE_STATE');
  end if;

  if v_run.status = 'completed' then
    return jsonb_build_object('ok', false, 'code', 'INCONSISTENT_CERTIFICATE_STATE');
  end if;
  if v_run.status is distinct from 'verifying'
     or v_run.stage is distinct from 'awaiting_certificate' then
    return jsonb_build_object('ok', false, 'code', 'RUN_STATE_NOT_ALLOWED');
  end if;

  select exists (
    select 1
    from public.organisations o
    where o.id = p_former_organisation_id
  ) into v_org_exists;
  if v_org_exists then
    return jsonb_build_object('ok', false, 'code', 'ORGANISATION_ROW_REMAINS');
  end if;

  if v_run.storage_status is distinct from p_storage_cleanup_status then
    return jsonb_build_object('ok', false, 'code', 'STORAGE_STATUS_MISMATCH');
  end if;

  select count(*)::integer into v_commercial_count
  from public.retained_organisation_commercial_records r
  where r.deletion_run_id = v_run.id
    and r.former_organisation_id = p_former_organisation_id;
  if v_commercial_count is distinct from p_commercial_retained_count then
    return jsonb_build_object('ok', false, 'code', 'RETAINED_COMMERCIAL_MISMATCH');
  end if;

  v_summary := jsonb_build_object(
    'formerOrganisationId', v_run.former_organisation_id,
    'deletionRunId', v_run.id,
    'runStatus', 'completed',
    'stage', v_run.stage,
    'storageCleanupStatus', p_storage_cleanup_status,
    'backupStatus', 'unknown',
    'externalFollowUpStatus', 'unknown',
    'commercialRetainedCount', v_commercial_count,
    'eligibleErasureClaim', 'APPLICATION DATA PURGED'
  );

  insert into public.organisation_deletion_certificates (
    deletion_run_id,
    former_organisation_id,
    organisation_name,
    organisation_type,
    was_sample_installation,
    instruction_reference,
    authority_verified,
    authorised_by_user_id,
    requested_at,
    started_at,
    completed_at,
    verification_status,
    storage_cleanup_status,
    external_follow_up_status,
    backup_status,
    commercial_retained_count,
    inventory_summary
  ) values (
    v_run.id,
    v_run.former_organisation_id,
    v_run.organisation_name_snapshot,
    v_run.organisation_type_snapshot,
    false,
    v_run.instruction_reference,
    true,
    v_run.authorized_by,
    v_run.requested_at,
    v_run.started_at,
    v_now,
    'passed',
    p_storage_cleanup_status,
    'unknown',
    'unknown',
    v_commercial_count,
    v_summary
  );

  update public.organisation_deletion_runs
  set
    status = 'completed',
    completed_at = v_now,
    last_error = null,
    updated_at = v_now
  where id = v_run.id
    and status = 'verifying'
    and stage = 'awaiting_certificate';
  if not found then
    raise exception 'CERTIFICATE_COMPLETION_UPDATE_FAILED';
  end if;

  select exists (
    select 1
    from public.platform_audit_events e
    where e.former_organisation_id = p_former_organisation_id
      and e.action = 'organisation.purge_completed'
      and e.entity_type = 'organisation_deletion_run'
      and e.entity_id = v_run.id
  ) into v_audit_exists;
  if not v_audit_exists then
    perform public.write_minimised_deletion_lifecycle_audit(
      v_user,
      'organisation.purge_completed',
      'organisation_deletion_run',
      v_run.id,
      p_former_organisation_id,
      jsonb_build_object(
        'formerOrganisationId', p_former_organisation_id,
        'deletionRunId', v_run.id,
        'runStatus', 'completed',
        'stage', v_run.stage,
        'permanentDeletionOccurred', true
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'alreadyCompleted', false,
    'certificateCreated', true,
    'runCompleted', true,
    'deletionRunId', v_run.id,
    'formerOrganisationId', v_run.former_organisation_id,
    'runStatus', 'completed',
    'stage', v_run.stage,
    'completedAt', v_now,
    'commercialCopyVerificationStatus', v_run.verification_status,
    'storageCleanupStatus', p_storage_cleanup_status,
    'commercialRetainedCount', v_commercial_count,
    'eligibleErasureClaim', 'APPLICATION DATA PURGED',
    'backupStatus', 'unknown',
    'externalFollowUpStatus', 'unknown'
  );
end;
$$;

comment on function public.owner_issue_organisation_deletion_certificate(uuid, uuid, text, integer) is
  'Platform Owner only. Issues the existing immutable deletion certificate and '
  'completes the run. Fresh application-data verification is required by the '
  'Owner API before this RPC. Does not delete tenant/Storage/Auth/commercial/'
  'support/audit rows. backup_status and external_follow_up_status stay unknown. '
  'Claim is APPLICATION DATA PURGED. Idempotent when the same run is already '
  'completed with a certificate. Does not duplicate organisation.purge_completed.';

revoke all on function public.owner_issue_organisation_deletion_certificate(uuid, uuid, text, integer)
  from public;
revoke all on function public.owner_issue_organisation_deletion_certificate(uuid, uuid, text, integer)
  from anon;
grant execute on function public.owner_issue_organisation_deletion_certificate(uuid, uuid, text, integer)
  to authenticated;
grant execute on function public.owner_issue_organisation_deletion_certificate(uuid, uuid, text, integer)
  to service_role;
