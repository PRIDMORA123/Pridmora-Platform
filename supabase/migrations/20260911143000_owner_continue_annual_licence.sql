-- Atomic Owner Console annual licence continuation / renewal.
--
-- Commercial lifecycle:
-- Paid Pilot -> annual Core / Growth / Scale -> annual renewal.
--
-- This operation keeps the existing organisation and all customer data in place.
-- It records one organisation_subscriptions row per annual commercial term.
-- No billing, charging or automatic access expiry is performed here.

create or replace function public.owner_continue_annual_licence(
  p_organisation_id uuid,
  p_plan_name text,
  p_seats integer,
  p_starts_at date,
  p_renewal_at date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org public.organisations%rowtype;
  v_required_seats integer;
  v_subscription_id uuid;
  v_existing_subscription_id uuid;
  v_previous_plan text;
  v_previous_seats integer;
  v_previous_renewal date;
  v_superseded_subscriptions integer := 0;
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

  if p_plan_name is null or p_plan_name not in ('Core', 'Growth', 'Scale') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ANNUAL_PLAN');
  end if;

  v_required_seats :=
    case p_plan_name
      when 'Core' then 25
      when 'Growth' then 50
      when 'Scale' then 100
      else null
    end;

  if p_seats is distinct from v_required_seats then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_PLAN_CAPACITY',
      'requiredSeats', v_required_seats
    );
  end if;

  if p_starts_at is null or p_renewal_at is null then
    return jsonb_build_object('ok', false, 'code', 'ANNUAL_DATES_REQUIRED');
  end if;

  if p_starts_at > current_date then
    return jsonb_build_object('ok', false, 'code', 'INVALID_RENEWAL_DATE');
  end if;

  if p_renewal_at <> (p_starts_at + interval '1 year')::date then
    return jsonb_build_object('ok', false, 'code', 'INVALID_RENEWAL_DATE');
  end if;

  select *
  into v_org
  from public.organisations
  where id = p_organisation_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  -- Exact retries are idempotent. If this annual term is already the current
  -- canonical term and the organisation already carries the same licence
  -- state, return the existing result without cancelling/reinserting,
  -- duplicating audit events or changing customer data.
  select s.id
  into v_existing_subscription_id
  from public.organisation_subscriptions s
  where s.organisation_id = p_organisation_id
    and s.status = 'active'
    and s.billing_frequency = 'annual'
    and s.plan_code = lower(p_plan_name)
    and s.seats = v_required_seats
    and s.starts_at = p_starts_at
    and s.renewal_at = p_renewal_at
    and s.metadata ->> 'commercialModel' = 'customer_annual_licence'
  order by s.created_at desc
  limit 1;

  if
    v_existing_subscription_id is not null
    and v_org.licence_status = 'active'
    and v_org.licence_plan_name = p_plan_name
    and v_org.practitioner_seats_purchased = v_required_seats
    and v_org.licence_starts_at = p_starts_at
    and v_org.licence_ends_at = p_renewal_at
  then
    return jsonb_build_object(
      'ok', true,
      'organisationId', p_organisation_id,
      'subscriptionId', v_existing_subscription_id,
      'licenceStatus', 'active',
      'licencePlanName', p_plan_name,
      'practitionerSeatsPurchased', v_required_seats,
      'licenceStartsAt', p_starts_at,
      'licenceEndsAt', p_renewal_at,
      'billingFrequency', 'annual',
      'alreadyApplied', true
    );
  end if;

  v_previous_plan := v_org.licence_plan_name;
  v_previous_seats := v_org.practitioner_seats_purchased;
  v_previous_renewal := v_org.licence_ends_at;

  update public.organisations
  set
    licence_status = 'active',
    licence_plan_name = p_plan_name,
    practitioner_seats_purchased = v_required_seats,
    licence_starts_at = p_starts_at,
    licence_ends_at = p_renewal_at,
    updated_at = now()
  where id = p_organisation_id;

  if not found then
    raise exception 'Unable to update organisation licence';
  end if;

  -- Preserve previous commercial terms as history, but ensure there is only
  -- one active subscription for this organisation after continuation/renewal.
  update public.organisation_subscriptions
  set
    status = 'cancelled',
    cancelled_at = now(),
    updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'supersededByAnnualContinuation', true,
      'supersededAt', now()
    )
  where organisation_id = p_organisation_id
    and status = 'active';

  get diagnostics v_superseded_subscriptions = row_count;

  insert into public.organisation_subscriptions (
    organisation_id,
    plan_code,
    seats,
    billing_frequency,
    status,
    currency,
    starts_at,
    renewal_at,
    metadata
  )
  values (
    p_organisation_id,
    lower(p_plan_name),
    v_required_seats,
    'annual',
    'active',
    'GBP',
    p_starts_at,
    p_renewal_at,
    jsonb_build_object(
      'commercialModel', 'customer_annual_licence',
      'planName', p_plan_name
    )
  )
  returning id into v_subscription_id;

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
    'organisation.annual_licence_continued',
    'organisation_subscription',
    v_subscription_id,
    p_organisation_id,
    jsonb_build_object(
      'previousPlanName', v_previous_plan,
      'planName', p_plan_name,
      'previousSeats', v_previous_seats,
      'seats', v_required_seats,
      'previousRenewalAt', v_previous_renewal,
      'startsAt', p_starts_at,
      'renewalAt', p_renewal_at,
      'billingFrequency', 'annual',
      'supersededSubscriptions', v_superseded_subscriptions
    )
  );

  return jsonb_build_object(
    'ok', true,
    'organisationId', p_organisation_id,
    'subscriptionId', v_subscription_id,
    'licenceStatus', 'active',
    'licencePlanName', p_plan_name,
    'practitionerSeatsPurchased', v_required_seats,
    'licenceStartsAt', p_starts_at,
    'licenceEndsAt', p_renewal_at,
    'billingFrequency', 'annual'
  );
end;
$$;

comment on function public.owner_continue_annual_licence(uuid, text, integer, date, date) is
  'Platform Owner: atomically continue or renew an existing organisation onto an annual Core, Growth or Scale licence. Updates licence capacity, records the annual commercial term and writes platform audit without replacing the organisation.';

revoke all on function public.owner_continue_annual_licence(uuid, text, integer, date, date)
  from public;

revoke all on function public.owner_continue_annual_licence(uuid, text, integer, date, date)
  from anon;

grant execute on function public.owner_continue_annual_licence(uuid, text, integer, date, date)
  to authenticated;

grant execute on function public.owner_continue_annual_licence(uuid, text, integer, date, date)
  to service_role;
