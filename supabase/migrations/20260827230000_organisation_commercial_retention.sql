-- DATA-LIFECYCLE DL-06: commercial retention copy and purge-readiness gate.
-- Duplicate retained rows are blocked by retained_organisation_commercial_run_source_key.
--
-- DOES NOT implement organisation purge, DELETE FROM organisations,
-- tenant-table deletion, storage deletion, support minimisation, Auth user
-- deletion, certificates, or any later destructive stage.

alter table public.retained_organisation_commercial_records
  drop constraint if exists retained_organisation_commercial_run_source_key;

alter table public.retained_organisation_commercial_records
  add constraint retained_organisation_commercial_run_source_key
  unique (deletion_run_id, record_type, source_id);

comment on constraint retained_organisation_commercial_run_source_key
  on public.retained_organisation_commercial_records is
  'Idempotent commercial retention: one snapshot per run, record type, and source row.';

create or replace function public.owner_copy_organisation_commercial_records(
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
  v_now timestamptz := now();
  v_already boolean := false;
  v_sources jsonb := '[]'::jsonb;
  v_sub_source integer := 0;
  v_pay_source integer := 0;
  v_inv_source integer := 0;
  v_po_source integer := 0;
  v_con_source integer := 0;
  v_trl_source integer := 0;
  v_sub_retained integer := 0;
  v_pay_retained integer := 0;
  v_inv_retained integer := 0;
  v_po_retained integer := 0;
  v_con_retained integer := 0;
  v_trl_retained integer := 0;
  v_lic_retained integer := 0;
  v_retained_total integer := 0;
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

  if v_run.status in ('completed', 'blocked', 'purging', 'purged', 'storage_cleaning', 'verifying', 'failed') then
    return jsonb_build_object('ok', false, 'code', 'RUN_STATE_NOT_ALLOWED');
  end if;

  if v_run.status not in ('frozen', 'commercial_copied') then
    return jsonb_build_object('ok', false, 'code', 'RUN_STATE_NOT_ALLOWED');
  end if;

  v_already := v_run.status = 'commercial_copied';

  select count(*) into v_sub_source
  from public.organisation_subscriptions s
  where s.organisation_id = p_organisation_id;
  select count(*) into v_pay_source
  from public.organisation_payment_methods s
  where s.organisation_id = p_organisation_id;
  select count(*) into v_inv_source
  from public.invoices s
  where s.organisation_id = p_organisation_id;
  select count(*) into v_po_source
  from public.purchase_orders s
  where s.organisation_id = p_organisation_id;
  select count(*) into v_con_source
  from public.organisation_contracts s
  where s.organisation_id = p_organisation_id;
  select count(*) into v_trl_source
  from public.organisation_trials s
  where s.organisation_id = p_organisation_id;

  insert into public.retained_organisation_commercial_records (
    deletion_run_id,
    former_organisation_id,
    former_organisation_name,
    record_type,
    source_id,
    snapshot
  )
  select
    v_run.id,
    v_org.id,
    v_org.name,
    'subscription',
    s.id,
    jsonb_strip_nulls(jsonb_build_object(
      'sourceId', s.id,
      'planId', s.plan_id,
      'planCode', s.plan_code,
      'seats', s.seats,
      'billingFrequency', s.billing_frequency,
      'status', s.status,
      'currency', s.currency,
      'monthlyValueMinor', s.monthly_value_minor,
      'annualValueMinor', s.annual_value_minor,
      'startsAt', s.starts_at,
      'renewalAt', s.renewal_at,
      'trialEndsAt', s.trial_ends_at,
      'cancelledAt', s.cancelled_at,
      'createdAt', s.created_at,
      'updatedAt', s.updated_at
    ))
  from public.organisation_subscriptions s
  where s.organisation_id = p_organisation_id
  on conflict on constraint retained_organisation_commercial_run_source_key do nothing;

  insert into public.retained_organisation_commercial_records (
    deletion_run_id,
    former_organisation_id,
    former_organisation_name,
    record_type,
    source_id,
    snapshot
  )
  select
    v_run.id,
    v_org.id,
    v_org.name,
    'payment_method_masked',
    s.id,
    jsonb_strip_nulls(jsonb_build_object(
      'sourceId', s.id,
      'methodType', s.method_type,
      'brand', s.brand,
      'lastFour', case
        when s.last_four is not null
          and char_length(s.last_four) <= 4
          and s.last_four ~ '^[0-9*]+$'
        then s.last_four
        else null
      end,
      'expMonth', s.exp_month,
      'expYear', s.exp_year,
      'maskedDescriptor', s.masked_descriptor,
      'isDefault', s.is_default,
      'status', s.status,
      'createdAt', s.created_at,
      'updatedAt', s.updated_at
    ))
  from public.organisation_payment_methods s
  where s.organisation_id = p_organisation_id
  on conflict on constraint retained_organisation_commercial_run_source_key do nothing;

  insert into public.retained_organisation_commercial_records (
    deletion_run_id,
    former_organisation_id,
    former_organisation_name,
    record_type,
    source_id,
    snapshot
  )
  select
    v_run.id,
    v_org.id,
    v_org.name,
    'invoice',
    s.id,
    jsonb_strip_nulls(jsonb_build_object(
      'sourceId', s.id,
      'invoiceNumber', s.invoice_number,
      'invoiceDate', s.invoice_date,
      'dueDate', s.due_date,
      'netMinor', s.net_minor,
      'vatMinor', s.vat_minor,
      'grossMinor', s.gross_minor,
      'currency', s.currency,
      'status', s.status,
      'paymentDate', s.payment_date,
      'purchaseOrderReference', s.purchase_order_reference,
      'createdAt', s.created_at,
      'updatedAt', s.updated_at
    ))
  from public.invoices s
  where s.organisation_id = p_organisation_id
  on conflict on constraint retained_organisation_commercial_run_source_key do nothing;

  insert into public.retained_organisation_commercial_records (
    deletion_run_id,
    former_organisation_id,
    former_organisation_name,
    record_type,
    source_id,
    snapshot
  )
  select
    v_run.id,
    v_org.id,
    v_org.name,
    'purchase_order',
    s.id,
    jsonb_strip_nulls(jsonb_build_object(
      'sourceId', s.id,
      'poNumber', s.po_number,
      'approvedValueMinor', s.approved_value_minor,
      'currency', s.currency,
      'startsAt', s.starts_at,
      'expiresAt', s.expires_at,
      'amountInvoicedMinor', s.amount_invoiced_minor,
      'status', s.status,
      'createdAt', s.created_at,
      'updatedAt', s.updated_at
    ))
  from public.purchase_orders s
  where s.organisation_id = p_organisation_id
  on conflict on constraint retained_organisation_commercial_run_source_key do nothing;

  insert into public.retained_organisation_commercial_records (
    deletion_run_id,
    former_organisation_id,
    former_organisation_name,
    record_type,
    source_id,
    snapshot
  )
  select
    v_run.id,
    v_org.id,
    v_org.name,
    'contract',
    s.id,
    jsonb_strip_nulls(jsonb_build_object(
      'sourceId', s.id,
      'name', s.name,
      'reference', s.reference,
      'startsAt', s.starts_at,
      'endsAt', s.ends_at,
      'noticePeriodDays', s.notice_period_days,
      'renewalType', s.renewal_type,
      'contractValueMinor', s.contract_value_minor,
      'currency', s.currency,
      'status', s.status,
      'createdAt', s.created_at,
      'updatedAt', s.updated_at
    ))
  from public.organisation_contracts s
  where s.organisation_id = p_organisation_id
  on conflict on constraint retained_organisation_commercial_run_source_key do nothing;

  insert into public.retained_organisation_commercial_records (
    deletion_run_id,
    former_organisation_id,
    former_organisation_name,
    record_type,
    source_id,
    snapshot
  )
  select
    v_run.id,
    v_org.id,
    v_org.name,
    'trial',
    s.id,
    jsonb_strip_nulls(jsonb_build_object(
      'sourceId', s.id,
      'trialStartsAt', s.trial_starts_at,
      'trialEndsAt', s.trial_ends_at,
      'durationDays', s.duration_days,
      'conversionStatus', s.conversion_status,
      'followUpAt', s.follow_up_at,
      'createdAt', s.created_at,
      'updatedAt', s.updated_at
    ))
  from public.organisation_trials s
  where s.organisation_id = p_organisation_id
  on conflict on constraint retained_organisation_commercial_run_source_key do nothing;

  insert into public.retained_organisation_commercial_records (
    deletion_run_id,
    former_organisation_id,
    former_organisation_name,
    record_type,
    source_id,
    snapshot
  )
  values (
    v_run.id,
    v_org.id,
    v_org.name,
    'licence_snapshot',
    v_org.id,
    jsonb_strip_nulls(jsonb_build_object(
      'planName', v_org.licence_plan_name,
      'seatsPurchased', v_org.practitioner_seats_purchased,
      'licenceStatus', v_org.licence_status,
      'licenceStartsAt', v_org.licence_starts_at,
      'licenceEndsAt', v_org.licence_ends_at,
      'legalName', v_org.legal_name
    ))
  )
  on conflict on constraint retained_organisation_commercial_run_source_key do nothing;

  select count(*) into v_sub_retained
  from public.retained_organisation_commercial_records r
  where r.deletion_run_id = v_run.id and r.record_type = 'subscription';
  select count(*) into v_pay_retained
  from public.retained_organisation_commercial_records r
  where r.deletion_run_id = v_run.id and r.record_type = 'payment_method_masked';
  select count(*) into v_inv_retained
  from public.retained_organisation_commercial_records r
  where r.deletion_run_id = v_run.id and r.record_type = 'invoice';
  select count(*) into v_po_retained
  from public.retained_organisation_commercial_records r
  where r.deletion_run_id = v_run.id and r.record_type = 'purchase_order';
  select count(*) into v_con_retained
  from public.retained_organisation_commercial_records r
  where r.deletion_run_id = v_run.id and r.record_type = 'contract';
  select count(*) into v_trl_retained
  from public.retained_organisation_commercial_records r
  where r.deletion_run_id = v_run.id and r.record_type = 'trial';
  select count(*) into v_lic_retained
  from public.retained_organisation_commercial_records r
  where r.deletion_run_id = v_run.id and r.record_type = 'licence_snapshot';

  if v_sub_source is distinct from v_sub_retained
     or v_pay_source is distinct from v_pay_retained
     or v_inv_source is distinct from v_inv_retained
     or v_po_source is distinct from v_po_retained
     or v_con_source is distinct from v_con_retained
     or v_trl_source is distinct from v_trl_retained
     or v_lic_retained is distinct from 1 then
    raise exception 'COMMERCIAL_COPY_INCOMPLETE';
  end if;

  v_retained_total :=
    v_sub_retained + v_pay_retained + v_inv_retained + v_po_retained
    + v_con_retained + v_trl_retained + v_lic_retained;

  v_sources := jsonb_build_array(
    jsonb_build_object('table', 'organisation_subscriptions', 'recordType', 'subscription', 'sourceCount', v_sub_source, 'retainedCount', v_sub_retained),
    jsonb_build_object('table', 'organisation_payment_methods', 'recordType', 'payment_method_masked', 'sourceCount', v_pay_source, 'retainedCount', v_pay_retained),
    jsonb_build_object('table', 'invoices', 'recordType', 'invoice', 'sourceCount', v_inv_source, 'retainedCount', v_inv_retained),
    jsonb_build_object('table', 'purchase_orders', 'recordType', 'purchase_order', 'sourceCount', v_po_source, 'retainedCount', v_po_retained),
    jsonb_build_object('table', 'organisation_contracts', 'recordType', 'contract', 'sourceCount', v_con_source, 'retainedCount', v_con_retained),
    jsonb_build_object('table', 'organisation_trials', 'recordType', 'trial', 'sourceCount', v_trl_source, 'retainedCount', v_trl_retained),
    jsonb_build_object('table', 'organisations', 'recordType', 'licence_snapshot', 'sourceCount', 1, 'retainedCount', v_lic_retained)
  );

  update public.organisation_deletion_runs
  set
    status = 'commercial_copied',
    stage = 'commercial_copied',
    verification_status = 'passed',
    last_error = null,
    updated_at = v_now,
    inventory = coalesce(inventory, '{}'::jsonb) || jsonb_build_object(
      'commercialRetention', jsonb_build_object(
        'copiedAt', v_now,
        'authorisedBy', v_user,
        'sources', v_sources,
        'retainedTotal', v_retained_total,
        'verificationStatus', 'passed',
        'permanentDeletionOccurred', false
      )
    )
  where id = v_run.id
    and status in ('frozen', 'commercial_copied');

  if not found then
    raise exception 'COMMERCIAL_COPY_RUN_UPDATE_FAILED';
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
    'organisation.commercial_retention_copied',
    'organisation_deletion_run',
    v_run.id,
    v_org.id,
    jsonb_build_object(
      'organisationId', v_org.id,
      'formerOrganisationId', v_org.id,
      'deletionRunId', v_run.id,
      'sourceCounts', jsonb_build_object(
        'subscriptions', v_sub_source,
        'paymentMethods', v_pay_source,
        'invoices', v_inv_source,
        'purchaseOrders', v_po_source,
        'contracts', v_con_source,
        'trials', v_trl_source,
        'licenceSnapshot', 1
      ),
      'retainedCounts', jsonb_build_object(
        'subscriptions', v_sub_retained,
        'paymentMethods', v_pay_retained,
        'invoices', v_inv_retained,
        'purchaseOrders', v_po_retained,
        'contracts', v_con_retained,
        'trials', v_trl_retained,
        'licenceSnapshot', v_lic_retained
      ),
      'retainedTotal', v_retained_total,
      'runStatus', 'commercial_copied',
      'stage', 'commercial_copied',
      'verificationStatus', 'passed',
      'alreadyCopied', v_already,
      'purgeReadinessResult', 'requires_review',
      'acknowledgedLimitations', jsonb_build_array(
        'organisation_migration_review.details JSON is not searched; future purge must use authoritative record_id descendant keys only.',
        'Backup and external-processor retention cannot be confirmed from this inventory.'
      ),
      'permanentDeletionOccurred', false
    )
  );

  return jsonb_build_object(
    'ok', true,
    'alreadyCopied', v_already,
    'deletionRunId', v_run.id,
    'organisationId', v_org.id,
    'formerOrganisationId', v_org.id,
    'organisationStatus', v_org.status,
    'runStatus', 'commercial_copied',
    'stage', 'commercial_copied',
    'verificationStatus', 'passed',
    'sources', v_sources,
    'retainedTotal', v_retained_total,
    'copiedAt', v_now,
    'authorisedBy', v_user,
    'permanentDeletionOccurred', false
  );
end;
$$;

comment on function public.owner_copy_organisation_commercial_records(uuid, uuid) is
  'Platform Owner only. Atomically copies allowlisted commercial metadata into '
  'retained_organisation_commercial_records for a frozen pending_closure deletion run, '
  'verifies source/retained counts, and advances the run to commercial_copied. '
  'Does not purge tenant data, delete storage, create a certificate, change '
  'pending_closure, or advance later deletion stages. Does not copy notes, metadata JSON, '
  'provider secrets, documents, or coaching/development content.';

revoke all on function public.owner_copy_organisation_commercial_records(uuid, uuid)
  from public;
revoke all on function public.owner_copy_organisation_commercial_records(uuid, uuid)
  from anon;
grant execute on function public.owner_copy_organisation_commercial_records(uuid, uuid)
  to authenticated;
grant execute on function public.owner_copy_organisation_commercial_records(uuid, uuid)
  to service_role;
