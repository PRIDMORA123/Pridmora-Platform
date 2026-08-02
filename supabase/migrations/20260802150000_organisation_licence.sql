-- Organisation pilot licence metadata and practitioner seat limits.
-- Manual operator-managed fields only.

-- ---------------------------------------------------------------------------
-- 1. Licence columns on organisations
-- ---------------------------------------------------------------------------
alter table public.organisations
  add column if not exists licence_plan_name text not null default 'Pilot';

alter table public.organisations
  add column if not exists practitioner_seats_purchased integer not null default 5;

alter table public.organisations
  add column if not exists licence_status text not null default 'active';

alter table public.organisations
  add column if not exists licence_starts_at date null;

alter table public.organisations
  add column if not exists licence_ends_at date null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organisations_licence_status_check'
  ) then
    alter table public.organisations
      add constraint organisations_licence_status_check
      check (licence_status in ('active', 'trial', 'expired', 'suspended'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organisations_practitioner_seats_purchased_check'
  ) then
    alter table public.organisations
      add constraint organisations_practitioner_seats_purchased_check
      check (practitioner_seats_purchased >= 0);
  end if;
end $$;

-- Personal workspaces start with a single practitioner seat.
update public.organisations
set practitioner_seats_purchased = 1
where organisation_type = 'personal'
  and practitioner_seats_purchased = 5
  and licence_plan_name = 'Pilot';

-- Seed start date for existing orgs that have none.
update public.organisations
set licence_starts_at = (created_at at time zone 'utc')::date
where licence_starts_at is null;

comment on column public.organisations.licence_plan_name is
  'Commercial plan label for the organisation licence (manual pilot metadata).';
comment on column public.organisations.practitioner_seats_purchased is
  'Number of practitioner seats included in the organisation licence.';
comment on column public.organisations.licence_status is
  'Licence lifecycle status: active, trial, expired, or suspended.';
comment on column public.organisations.licence_starts_at is
  'Licence start date (manual).';
comment on column public.organisations.licence_ends_at is
  'Licence end or renewal date (manual).';
