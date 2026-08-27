-- DATA-LIFECYCLE DL-08 Slice 3: authoritative tenant DB purge + Storage
-- manifest binding.
--
-- Storage object bytes are removed by the application using the bound
-- manifest only. This SQL does not call Storage APIs and cannot be atomic
-- with Storage.
--
-- Does NOT delete Auth users, create certificates, or set run status
-- completed. Ends at verifying / awaiting_certificate after Storage verify.

create table if not exists public.organisation_deletion_storage_manifest (
  id uuid primary key default gen_random_uuid(),
  deletion_run_id uuid not null
    references public.organisation_deletion_runs(id) on delete restrict,
  former_organisation_id uuid not null,
  bucket text not null,
  object_path text not null,
  document_id uuid null,
  captured_at timestamptz not null default now(),
  deleted_at timestamptz null,
  verified_absent_at timestamptz null,
  unique (deletion_run_id, bucket, object_path)
);

create index if not exists organisation_deletion_storage_manifest_run_idx
  on public.organisation_deletion_storage_manifest (deletion_run_id);

comment on table public.organisation_deletion_storage_manifest is
  'Bound Storage object list for one deletion run. Paths only; no file content. '
  'Captured before tenant DB delete. Deletion may remove only these paths.';

alter table public.organisation_deletion_storage_manifest enable row level security;

revoke all on table public.organisation_deletion_storage_manifest from public;
grant select on table public.organisation_deletion_storage_manifest to authenticated;
grant select, insert, update on table public.organisation_deletion_storage_manifest
  to service_role;

drop policy if exists "Storage manifest select platform owner"
  on public.organisation_deletion_storage_manifest;
create policy "Storage manifest select platform owner"
  on public.organisation_deletion_storage_manifest
  for select to authenticated
  using (public.is_platform_owner(auth.uid()));

create or replace function public.owner_capture_organisation_storage_manifest(
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
  v_existing integer := 0;
  v_captured integer := 0;
  v_bad integer := 0;
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

  select * into v_run from public.organisation_deletion_runs
  where id = p_deletion_run_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'RUN_NOT_FOUND');
  end if;
  if v_run.former_organisation_id is distinct from p_organisation_id then
    return jsonb_build_object('ok', false, 'code', 'INCONSISTENT_RUN');
  end if;

  select count(*) into v_existing
  from public.organisation_deletion_storage_manifest
  where deletion_run_id = p_deletion_run_id;
  if v_existing > 0 then
    return jsonb_build_object(
      'ok', true,
      'alreadyCaptured', true,
      'capturedCount', v_existing,
      'deletionRunId', v_run.id,
      'reused', true
    );
  end if;

  if v_run.status not in ('commercial_copied', 'purging', 'failed') then
    return jsonb_build_object('ok', false, 'code', 'RUN_STATE_NOT_ALLOWED');
  end if;

  select * into v_org from public.organisations where id = p_organisation_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'STORAGE_MANIFEST_REQUIRED');
  end if;
  if v_org.status is distinct from 'pending_closure' then
    return jsonb_build_object('ok', false, 'code', 'STATUS_NOT_ALLOWED');
  end if;
  if v_run.organisation_id is distinct from p_organisation_id then
    return jsonb_build_object('ok', false, 'code', 'INCONSISTENT_RUN');
  end if;

  select count(*) into v_bad
  from public.development_evidence_documents d
  where d.organisation_id = p_organisation_id
    and (
      d.storage_path is null
      or d.storage_path like '%..%'
      or d.storage_path like '/%'
      or d.storage_path like '%\%'
      or split_part(d.storage_path, '/', 1) is distinct from p_organisation_id::text
      or split_part(d.storage_path, '/', 2) !~ '^[0-9a-f-]{36}$'
      or split_part(d.storage_path, '/', 2)::uuid not in (
        select c.id from public.clients c where c.organisation_id = p_organisation_id
      )
      or cardinality(string_to_array(d.storage_path, '/')) <> 3
    );

  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'code', 'STORAGE_PATH_NOT_AUTHORITATIVE');
  end if;

  insert into public.organisation_deletion_storage_manifest (
    deletion_run_id,
    former_organisation_id,
    bucket,
    object_path,
    document_id
  )
  select
    p_deletion_run_id,
    p_organisation_id,
    'development-evidence',
    d.storage_path,
    d.id
  from public.development_evidence_documents d
  where d.organisation_id = p_organisation_id
    and d.storage_path is not null;

  get diagnostics v_captured = row_count;

  update public.organisation_deletion_runs
  set
    stage = 'storage_manifest_captured',
    storage_status = 'pending',
    updated_at = now()
  where id = p_deletion_run_id
    and status in ('commercial_copied', 'purging', 'failed');

  return jsonb_build_object(
    'ok', true,
    'alreadyCaptured', false,
    'capturedCount', v_captured,
    'deletionRunId', v_run.id,
    'reused', false
  );
end;
$$;

comment on function public.owner_capture_organisation_storage_manifest(uuid, uuid) is
  'Platform Owner only. Binds authoritative development-evidence paths to the '
  'deletion run before tenant DB purge. Reuses an existing bound manifest.';

revoke all on function public.owner_capture_organisation_storage_manifest(uuid, uuid)
  from public;
revoke all on function public.owner_capture_organisation_storage_manifest(uuid, uuid)
  from anon;
grant execute on function public.owner_capture_organisation_storage_manifest(uuid, uuid)
  to authenticated;
grant execute on function public.owner_capture_organisation_storage_manifest(uuid, uuid)
  to service_role;

create or replace function public.owner_purge_organisation_tenant_data(
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
  v_table text;
  v_sql text;
  v_remain bigint;
  v_retained_before integer := 0;
  v_retained_after integer := 0;
  v_support integer := 0;
  v_audit integer := 0;
  v_manifest integer := 0;
  v_unknown integer := 0;
  v_ambiguous integer := 0;
  v_pending_minimise integer := 0;
  v_client_ids uuid[] := '{}';
  v_session_ids uuid[] := '{}';
  v_snapshot_ids uuid[] := '{}';
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

  select * into v_run from public.organisation_deletion_runs
  where id = p_deletion_run_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'RUN_NOT_FOUND');
  end if;
  if v_run.former_organisation_id is distinct from p_organisation_id then
    return jsonb_build_object('ok', false, 'code', 'INCONSISTENT_RUN');
  end if;

  if v_run.status in ('purged', 'storage_cleaning', 'verifying')
     or (v_run.status = 'failed' and v_run.organisation_id is null) then
    return jsonb_build_object(
      'ok', true,
      'alreadyPurged', true,
      'deletionRunId', v_run.id,
      'runStatus', v_run.status,
      'stage', v_run.stage,
      'organisationDeleted', v_run.organisation_id is null,
      'permanentDeletionOccurred', true,
      'authUsersDeleted', false,
      'certificateCreated', false
    );
  end if;

  if v_run.status not in ('commercial_copied', 'purging', 'failed') then
    return jsonb_build_object('ok', false, 'code', 'RUN_STATE_NOT_ALLOWED');
  end if;

  select * into v_org from public.organisations where id = p_organisation_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_run.organisation_id is distinct from p_organisation_id then
    return jsonb_build_object('ok', false, 'code', 'INCONSISTENT_RUN');
  end if;
  if v_org.status is distinct from 'pending_closure' then
    return jsonb_build_object('ok', false, 'code', 'STATUS_NOT_ALLOWED');
  end if;
  if v_org.organisation_type = 'personal' then
    return jsonb_build_object('ok', false, 'code', 'PERSONAL_ORGANISATION');
  end if;
  if exists (
    select 1 from public.sample_organisation_installations i
    where i.organisation_id = p_organisation_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'SAMPLE_INSTALLATION');
  end if;
  if exists (
    select 1 from public.sample_organisation_installations i
    where i.source_organisation_id = p_organisation_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'SAMPLE_SOURCE_ORGANISATION');
  end if;
  if exists (
    select 1 from public.platform_settings s
    where s.key = 'undeletable_organisation_ids'
      and coalesce(s.value -> 'ids', '[]'::jsonb) ? p_organisation_id::text
  ) then
    return jsonb_build_object('ok', false, 'code', 'UNDELETABLE_ORGANISATION');
  end if;
  if v_run.status is distinct from 'commercial_copied' and v_run.status is distinct from 'purging'
     and v_run.status is distinct from 'failed' then
    return jsonb_build_object('ok', false, 'code', 'RUN_STATE_NOT_ALLOWED');
  end if;
  if v_run.verification_status is distinct from 'passed' then
    return jsonb_build_object('ok', false, 'code', 'COMMERCIAL_COPY_NOT_VERIFIED');
  end if;

  select count(*) into v_pending_minimise
  from (
    select 1 from public.support_cases where organisation_id = p_organisation_id
    union all
    select 1 from public.platform_audit_events where organisation_id = p_organisation_id
  ) pending;
  if v_pending_minimise > 0 then
    return jsonb_build_object('ok', false, 'code', 'RETAIN_MINIMISE_PENDING');
  end if;

  select count(*) into v_unknown
  from public.organisation_migration_review r
  where r.table_name not in ('clients', 'sessions')
    and r.record_id in (
      select c.id from public.clients c where c.organisation_id = p_organisation_id
      union
      select s.id from public.sessions s where s.organisation_id = p_organisation_id
    );
  if v_unknown > 0 then
    return jsonb_build_object('ok', false, 'code', 'MIGRATION_REVIEW_UNKNOWN_TABLE');
  end if;

  select count(*) into v_ambiguous
  from public.organisation_migration_review r
  join public.sessions s on s.id = r.record_id
  join public.clients c on c.id = s.client_id
  where r.table_name = 'sessions'
    and s.organisation_id is not null
    and c.organisation_id is not null
    and s.organisation_id is distinct from c.organisation_id
    and (s.organisation_id = p_organisation_id or c.organisation_id = p_organisation_id);
  if v_ambiguous > 0 then
    return jsonb_build_object('ok', false, 'code', 'MIGRATION_REVIEW_AMBIGUOUS');
  end if;

  select count(*) into v_ambiguous
  from public.organisation_migration_review r
  join public.clients c on c.id = r.record_id
  where r.table_name = 'clients'
    and c.organisation_id is null
    and exists (
      select 1 from public.relationship_assignments a
      where a.client_id = c.id and a.status = 'active' and a.organisation_id = p_organisation_id
    )
    and (
      select count(distinct a.organisation_id)
      from public.relationship_assignments a
      where a.client_id = c.id and a.status = 'active'
    ) > 1;
  if v_ambiguous > 0 then
    return jsonb_build_object('ok', false, 'code', 'MIGRATION_REVIEW_AMBIGUOUS');
  end if;

  select count(*) into v_manifest
  from public.organisation_deletion_storage_manifest
  where deletion_run_id = p_deletion_run_id;
  if v_manifest = 0 and exists (
    select 1 from public.development_evidence_documents d
    where d.organisation_id = p_organisation_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'STORAGE_MANIFEST_REQUIRED');
  end if;

  select count(*) into v_retained_before
  from public.retained_organisation_commercial_records
  where deletion_run_id = p_deletion_run_id;

  update public.organisation_deletion_runs
  set
    status = 'purging',
    stage = 'db_purging',
    last_error = null,
    started_at = coalesce(started_at, now()),
    updated_at = now()
  where id = p_deletion_run_id;

  select coalesce(array_agg(id), '{}'::uuid[])
    into v_client_ids
    from public.clients
    where organisation_id = p_organisation_id;
  select coalesce(array_agg(id), '{}'::uuid[])
    into v_session_ids
    from public.sessions
    where organisation_id = p_organisation_id;
  select coalesce(array_agg(id), '{}'::uuid[])
    into v_snapshot_ids
    from public.organisation_intelligence_snapshots
    where organisation_id = p_organisation_id;

  delete from public.organisation_migration_review r
  where r.table_name = 'clients'
    and exists (
      select 1 from public.clients c
      where c.id = r.record_id and c.organisation_id = p_organisation_id
    );

  delete from public.organisation_migration_review r
  where r.table_name = 'sessions'
    and exists (
      select 1 from public.sessions s
      where s.id = r.record_id and s.organisation_id = p_organisation_id
    );

  foreach v_table in array array[
    'development_evidence_ai_usage',
    'development_evidence_audit_log',
    'development_evidence_links',
    'development_evidence_observations',
    'development_evidence_documents',
    'development_evidence',
    'intelligence_audit_log',
    'person_progress_signals',
    'question_insights',
    'intelligence_evidence',
    'session_intelligence_reviews',
    'intelligence_items',
    'coaching_moments',
    'development_updates',
    'development_profiles',
    'development_reports',
    'coaching_reports',
    'client_items',
    'client_private_identities',
    'relationship_assignments'
  ]
  loop
    v_sql := format('delete from public.%I where organisation_id = $1', v_table);
    execute v_sql using p_organisation_id;
  end loop;

  if to_regclass('public.sessions_workflow_backup_20260726') is not null then
    delete from public.sessions_workflow_backup_20260726 b
    where b.client_id in (
      select c.id from public.clients c where c.organisation_id = p_organisation_id
    );
  end if;

  delete from public.sessions s where s.organisation_id = p_organisation_id;
  delete from public.clients c where c.organisation_id = p_organisation_id;

  delete from public.organisation_intelligence_metrics m
  using public.organisation_intelligence_snapshots s
  where m.snapshot_id = s.id and s.organisation_id = p_organisation_id;
  delete from public.organisation_intelligence_themes t
  using public.organisation_intelligence_snapshots s
  where t.snapshot_id = s.id and s.organisation_id = p_organisation_id;
  delete from public.organisation_intelligence_recommendations r
  using public.organisation_intelligence_snapshots s
  where r.snapshot_id = s.id and s.organisation_id = p_organisation_id;
  delete from public.organisation_intelligence_generation_locks
  where organisation_id = p_organisation_id;
  delete from public.organisation_intelligence_snapshots
  where organisation_id = p_organisation_id;

  delete from public.organisation_framework_capabilities
  where organisation_id = p_organisation_id;
  delete from public.organisation_frameworks
  where organisation_id = p_organisation_id;
  delete from public.sample_organisation_records
  where organisation_id = p_organisation_id;
  delete from public.sample_organisation_installations
  where organisation_id = p_organisation_id;

  delete from public.organisation_audit_log where organisation_id = p_organisation_id;
  delete from public.organisation_invitations where organisation_id = p_organisation_id;
  delete from public.organisation_memberships where organisation_id = p_organisation_id;

  delete from public.organisation_subscriptions where organisation_id = p_organisation_id;
  delete from public.organisation_payment_methods where organisation_id = p_organisation_id;
  delete from public.invoices where organisation_id = p_organisation_id;
  delete from public.purchase_orders where organisation_id = p_organisation_id;
  delete from public.organisation_contracts where organisation_id = p_organisation_id;
  delete from public.organisation_trials where organisation_id = p_organisation_id;

  update public.profiles
  set current_organisation_id = null
  where current_organisation_id = p_organisation_id;

  -- EXHAUSTIVE RESIDUAL VERIFICATION
  -- Locked to ORGANISATION_PURGE_MANIFEST delete + clear_link surfaces.
  -- Retained commercial / support / audit / run / manifest / catalogue are excluded.
  v_table := 'organisation_migration_review';
  select count(*) into v_remain
  from public.organisation_migration_review r
  where (
      (r.table_name = 'clients' and r.record_id = any(v_client_ids))
      or (r.table_name = 'sessions' and r.record_id = any(v_session_ids))
      or (
        r.table_name not in ('clients', 'sessions')
        and (
          r.record_id = any(v_client_ids)
          or r.record_id = any(v_session_ids)
        )
      )
    );
  if v_remain > 0 then
    update public.organisation_deletion_runs
    set status = 'failed', stage = 'failed', last_error = 'RESIDUAL_' || v_table, updated_at = now()
    where id = p_deletion_run_id;
    return jsonb_build_object(
      'ok', false,
      'code', 'RESIDUAL_TENANT_ROWS',
      'table', v_table,
      'remainingCount', v_remain
    );
  end if;

  v_table := 'sessions_workflow_backup_20260726';
  if to_regclass('public.sessions_workflow_backup_20260726') is not null then
    select count(*) into v_remain
    from public.sessions_workflow_backup_20260726 b
    where b.client_id = any(v_client_ids);
    if v_remain > 0 then
      update public.organisation_deletion_runs
      set status = 'failed', stage = 'failed', last_error = 'RESIDUAL_' || v_table, updated_at = now()
      where id = p_deletion_run_id;
      return jsonb_build_object(
        'ok', false,
        'code', 'RESIDUAL_TENANT_ROWS',
        'table', v_table,
        'remainingCount', v_remain
      );
    end if;
  end if;

  foreach v_table in array array[
    'organisation_intelligence_metrics',
    'organisation_intelligence_themes',
    'organisation_intelligence_recommendations'
  ]
  loop
    v_sql := format(
      'select count(*) from public.%I where snapshot_id = any($1)',
      v_table
    );
    execute v_sql into v_remain using v_snapshot_ids;
    if v_remain > 0 then
      update public.organisation_deletion_runs
      set status = 'failed', stage = 'failed', last_error = 'RESIDUAL_' || v_table, updated_at = now()
      where id = p_deletion_run_id;
      return jsonb_build_object(
        'ok', false,
        'code', 'RESIDUAL_TENANT_ROWS',
        'table', v_table,
        'remainingCount', v_remain
      );
    end if;
  end loop;

  -- residual organisation_id surfaces
  foreach v_table in array array[
    'development_evidence_ai_usage',
    'development_evidence_audit_log',
    'development_evidence_links',
    'development_evidence_observations',
    'development_evidence_documents',
    'development_evidence',
    'intelligence_audit_log',
    'person_progress_signals',
    'question_insights',
    'intelligence_evidence',
    'session_intelligence_reviews',
    'intelligence_items',
    'coaching_moments',
    'development_updates',
    'development_profiles',
    'development_reports',
    'coaching_reports',
    'client_items',
    'client_private_identities',
    'relationship_assignments',
    'sessions',
    'clients',
    'organisation_intelligence_generation_locks',
    'organisation_intelligence_snapshots',
    'organisation_framework_capabilities',
    'organisation_frameworks',
    'sample_organisation_records',
    'sample_organisation_installations',
    'organisation_audit_log',
    'organisation_invitations',
    'organisation_memberships',
    'organisation_subscriptions',
    'organisation_payment_methods',
    'invoices',
    'purchase_orders',
    'organisation_contracts',
    'organisation_trials'
  ]
  loop
    v_sql := format(
      'select count(*) from public.%I where organisation_id = $1',
      v_table
    );
    execute v_sql into v_remain using p_organisation_id;
    if v_remain > 0 then
      update public.organisation_deletion_runs
      set status = 'failed', stage = 'failed', last_error = 'RESIDUAL_' || v_table, updated_at = now()
      where id = p_deletion_run_id;
      return jsonb_build_object(
        'ok', false,
        'code', 'RESIDUAL_TENANT_ROWS',
        'table', v_table,
        'remainingCount', v_remain
      );
    end if;
  end loop;

  v_table := 'profiles';
  select count(*) into v_remain from public.profiles
  where current_organisation_id = p_organisation_id;
  if v_remain > 0 then
    update public.organisation_deletion_runs
    set status = 'failed', stage = 'failed', last_error = 'RESIDUAL_' || v_table, updated_at = now()
    where id = p_deletion_run_id;
    return jsonb_build_object(
      'ok', false,
      'code', 'RESIDUAL_TENANT_ROWS',
      'table', v_table,
      'remainingCount', v_remain
    );
  end if;

  v_table := 'organisations';
  delete from public.organisations where id = p_organisation_id;
  select count(*) into v_remain from public.organisations where id = p_organisation_id;
  if v_remain > 0 then
    update public.organisation_deletion_runs
    set status = 'failed', stage = 'failed', last_error = 'RESIDUAL_' || v_table, updated_at = now()
    where id = p_deletion_run_id;
    return jsonb_build_object(
      'ok', false,
      'code', 'RESIDUAL_TENANT_ROWS',
      'table', v_table,
      'remainingCount', v_remain
    );
  end if;
  -- END EXHAUSTIVE RESIDUAL VERIFICATION

  select count(*) into v_support from public.support_cases
  where former_organisation_id = p_organisation_id;
  select count(*) into v_audit from public.platform_audit_events
  where former_organisation_id = p_organisation_id;

  select count(*) into v_retained_after
  from public.retained_organisation_commercial_records
  where deletion_run_id = p_deletion_run_id;
  if v_retained_after is distinct from v_retained_before then
    update public.organisation_deletion_runs
    set status = 'failed', stage = 'failed', last_error = 'RETAINED_COMMERCIAL_CHANGED', updated_at = now()
    where id = p_deletion_run_id;
    return jsonb_build_object('ok', false, 'code', 'RETAINED_COMMERCIAL_CHANGED');
  end if;

  update public.organisation_deletion_runs
  set
    organisation_id = null,
    status = 'purged',
    stage = 'db_purged',
    last_error = null,
    updated_at = now()
  where id = p_deletion_run_id;

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
    'organisation.tenant_rows_purged',
    'organisation_deletion_run',
    v_run.id,
    null,
    p_organisation_id,
    jsonb_build_object(
      'formerOrganisationId', p_organisation_id,
      'deletionRunId', v_run.id,
      'runStatus', 'purged',
      'stage', 'db_purged',
      'permanentDeletionOccurred', true,
      'authUsersDeleted', false
    )
  );

  return jsonb_build_object(
    'ok', true,
    'alreadyPurged', false,
    'deletionRunId', v_run.id,
    'formerOrganisationId', p_organisation_id,
    'runStatus', 'purged',
    'stage', 'db_purged',
    'organisationDeleted', true,
    'retainedCommercialUnchanged', true,
    'supportCasesRemaining', v_support,
    'auditEventsRemaining', v_audit,
    'permanentDeletionOccurred', true,
    'authUsersDeleted', false,
    'storageDeleted', false,
    'certificateCreated', false
  );
exception
  when others then
    update public.organisation_deletion_runs
    set status = 'failed', stage = 'failed', last_error = left(sqlerrm, 500), updated_at = now()
    where id = p_deletion_run_id;
    return jsonb_build_object('ok', false, 'code', 'UPDATE_FAILED', 'error', sqlerrm);
end;
$$;

comment on function public.owner_purge_organisation_tenant_data(uuid, uuid) is
  'Platform Owner only. Deletes allowlisted tenant DB rows for a frozen '
  'pending_closure organisation after commercial copy and retain_minimise. '
  'Does not delete Auth users, Storage objects, retained commercial rows, '
  'minimised support/audit rows, or create a certificate.';

revoke all on function public.owner_purge_organisation_tenant_data(uuid, uuid) from public;
revoke all on function public.owner_purge_organisation_tenant_data(uuid, uuid) from anon;
grant execute on function public.owner_purge_organisation_tenant_data(uuid, uuid)
  to authenticated;
grant execute on function public.owner_purge_organisation_tenant_data(uuid, uuid)
  to service_role;

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
      'organisation.storage_cleanup_verified',
      'organisation_deletion_run',
      v_run.id,
      null,
      p_organisation_id,
      jsonb_build_object(
        'formerOrganisationId', p_organisation_id,
        'deletionRunId', v_run.id,
        'runStatus', 'verifying',
        'stage', p_stage,
        'permanentDeletionOccurred', true,
        'authUsersDeleted', false
      )
    );
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
  'verifying (awaiting certificate). Never sets completed and never inserts a certificate.';

revoke all on function public.owner_mark_organisation_storage_cleanup(uuid, uuid, text, text)
  from public;
revoke all on function public.owner_mark_organisation_storage_cleanup(uuid, uuid, text, text)
  from anon;
grant execute on function public.owner_mark_organisation_storage_cleanup(uuid, uuid, text, text)
  to authenticated;
grant execute on function public.owner_mark_organisation_storage_cleanup(uuid, uuid, text, text)
  to service_role;
