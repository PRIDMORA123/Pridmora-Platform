-- Replace the legacy five-argument trial-only RPC.
-- The new six-argument RPC adds an explicit starting route.
drop function if exists public.owner_create_customer_organisation(
  text,
  text,
  text,
  text,
  integer
);

create or replace function public.owner_create_customer_organisation(
  p_name text,
  p_country text,
  p_website text default null,
  p_owner_notes text default null,
  p_seats integer default null,
  p_starting_route text default 'paid_pilot'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_country text := nullif(trim(coalesce(p_country, '')), '');
  v_website text := nullif(trim(coalesce(p_website, '')), '');
  v_owner_notes text := nullif(trim(coalesce(p_owner_notes, '')), '');
  v_starting_route text := lower(trim(coalesce(p_starting_route, 'paid_pilot')));
  v_trial_defaults jsonb;
  v_seats integer;
  v_duration_days integer;
  v_plan_name text := 'Pilot';
  v_slug_base text;
  v_slug text;
  v_org_id uuid;
  v_starts date := (timezone('utc', now()))::date;
  v_ends date;
  v_follow_up date;
  v_follow_up_days integer;
  v_trial_id uuid := null;
  v_licence_status text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  end if;

  if not public.is_platform_owner(v_user) then
    return jsonb_build_object('ok', false, 'code', 'PERMISSION_DENIED');
  end if;

  if v_name is null then
    return jsonb_build_object('ok', false, 'code', 'NAME_REQUIRED');
  end if;

  if v_country is null then
    return jsonb_build_object('ok', false, 'code', 'COUNTRY_REQUIRED');
  end if;

  if char_length(v_name) > 200 then
    return jsonb_build_object('ok', false, 'code', 'NAME_TOO_LONG');
  end if;

  if char_length(v_country) > 120 then
    return jsonb_build_object('ok', false, 'code', 'COUNTRY_TOO_LONG');
  end if;

  if v_website is not null and char_length(v_website) > 500 then
    return jsonb_build_object('ok', false, 'code', 'WEBSITE_TOO_LONG');
  end if;

  if v_owner_notes is not null and char_length(v_owner_notes) > 4000 then
    return jsonb_build_object('ok', false, 'code', 'NOTES_TOO_LONG');
  end if;

  if v_starting_route not in ('paid_pilot', 'evaluation') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STARTING_ROUTE');
  end if;

  select value into v_trial_defaults
  from public.platform_settings
  where key = 'trial_defaults';

  v_seats := coalesce(
    p_seats,
    15
  );

  if v_seats is null or v_seats < 1 or v_seats > 100 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SEATS');
  end if;

  if v_starting_route = 'paid_pilot' then
    v_licence_status := 'active';
    v_duration_days := null;
    v_ends := null;
  else
    v_licence_status := 'trial';

    v_duration_days := coalesce(
      nullif((v_trial_defaults->>'duration_days')::integer, 0),
      14
    );

    if v_duration_days < 1 or v_duration_days > 3650 then
      v_duration_days := 14;
    end if;

    v_follow_up_days := coalesce(
      nullif((v_trial_defaults->>'follow_up_days_before_end')::integer, 0),
      7
    );

    v_ends := v_starts + v_duration_days;
    v_follow_up := greatest(v_starts, v_ends - v_follow_up_days);
  end if;

  v_slug_base := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug_base := trim(both '-' from v_slug_base);

  if v_slug_base is null or v_slug_base = '' then
    v_slug_base := 'organisation';
  end if;

  v_slug_base := left(v_slug_base, 60);
  v_slug := v_slug_base;

  if exists (select 1 from public.organisations where slug = v_slug) then
    v_slug :=
      left(v_slug_base, 48)
      || '-'
      || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  end if;

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
    country,
    website,
    owner_notes,
    licence_plan_name,
    practitioner_seats_purchased,
    licence_status,
    licence_starts_at,
    licence_ends_at
  )
  values (
    v_name,
    v_slug,
    'business',
    'active',
    v_user,
    'guided',
    true,
    'standard',
    'none',
    v_country,
    v_website,
    v_owner_notes,
    v_plan_name,
    v_seats,
    v_licence_status,
    v_starts,
    v_ends
  )
  returning id into v_org_id;

  if v_starting_route = 'evaluation' then
    insert into public.organisation_trials (
      organisation_id,
      trial_starts_at,
      trial_ends_at,
      duration_days,
      conversion_status,
      follow_up_at
    )
    values (
      v_org_id,
      v_starts,
      v_ends,
      v_duration_days,
      'new',
      v_follow_up
    )
    returning id into v_trial_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'organisationId', v_org_id,
    'trialId', v_trial_id,
    'name', v_name,
    'country', v_country,
    'seats', v_seats,
    'licenceStatus', v_licence_status,
    'licencePlanName', v_plan_name,
    'licenceStartsAt', v_starts,
    'licenceEndsAt', v_ends,
    'durationDays', v_duration_days,
    'startingRoute', v_starting_route,
    'organisationType', 'business'
  );
end;
$$;

comment on function public.owner_create_customer_organisation(
  text,
  text,
  text,
  text,
  integer,
  text
) is
  'Platform Owner creates a non-personal customer organisation as a Paid Pilot by default or an optional Evaluation. No invitations.';

revoke all on function public.owner_create_customer_organisation(
  text,
  text,
  text,
  text,
  integer,
  text
) from public;

revoke all on function public.owner_create_customer_organisation(
  text,
  text,
  text,
  text,
  integer,
  text
) from anon;

grant execute on function public.owner_create_customer_organisation(
  text,
  text,
  text,
  text,
  integer,
  text
) to authenticated;

grant execute on function public.owner_create_customer_organisation(
  text,
  text,
  text,
  text,
  integer,
  text
) to service_role;
