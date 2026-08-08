-- Pridmora Owner Console — platform administration foundation
-- Platform-level role (platform_owner) is separate from organisation membership roles.
-- Platform owners may administer organisations/commercial metadata.
-- They must NOT gain access to confidential coaching/development content via these policies.

-- ---------------------------------------------------------------------------
-- 1. Platform owners
-- ---------------------------------------------------------------------------
create table if not exists public.platform_owners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'suspended')),
  notes text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists platform_owners_status_idx
  on public.platform_owners (status);

create or replace function public.is_platform_owner(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_owners po
    where po.user_id = p_user_id
      and po.status = 'active'
  );
$$;

revoke all on function public.is_platform_owner(uuid) from public;
grant execute on function public.is_platform_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Organisation commercial profile fields (extend existing tenant)
-- ---------------------------------------------------------------------------
alter table public.organisations
  add column if not exists legal_name text null;

alter table public.organisations
  add column if not exists trading_name text null;

alter table public.organisations
  add column if not exists sector text null;

alter table public.organisations
  add column if not exists company_size text null;

alter table public.organisations
  add column if not exists primary_contact_name text null;

alter table public.organisations
  add column if not exists primary_contact_email text null;

alter table public.organisations
  add column if not exists billing_contact_name text null;

alter table public.organisations
  add column if not exists billing_contact_email text null;

alter table public.organisations
  add column if not exists account_owner_label text null;

-- Align licence_status with owner console account statuses (cancelled added).
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'organisations_licence_status_check'
  ) then
    alter table public.organisations drop constraint organisations_licence_status_check;
  end if;
  alter table public.organisations
    add constraint organisations_licence_status_check
    check (licence_status in ('active', 'trial', 'expired', 'suspended', 'cancelled'));
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Platform plans (evolve without hard-coding UI)
-- ---------------------------------------------------------------------------
create table if not exists public.platform_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text null,
  billing_frequency text not null default 'monthly'
    check (billing_frequency in ('monthly', 'annual', 'custom')),
  currency text not null default 'GBP',
  unit_amount_minor integer null check (unit_amount_minor is null or unit_amount_minor >= 0),
  seats_included integer null check (seats_included is null or seats_included >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.platform_plans (code, name, description, billing_frequency, unit_amount_minor, seats_included, sort_order)
values
  ('pilot', 'Pilot', 'Pilot / evaluation plan', 'monthly', null, 5, 10),
  ('standard_monthly', 'Standard (Monthly)', 'Standard monthly subscription', 'monthly', null, 10, 20),
  ('standard_annual', 'Standard (Annual)', 'Standard annual subscription', 'annual', null, 10, 30),
  ('enterprise', 'Enterprise', 'Enterprise / NHS / custom commercial', 'custom', null, null, 40)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Organisation subscriptions
-- ---------------------------------------------------------------------------
create table if not exists public.organisation_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  plan_id uuid null references public.platform_plans(id) on delete set null,
  plan_code text not null default 'pilot',
  seats integer not null default 1 check (seats >= 0),
  billing_frequency text not null default 'monthly'
    check (billing_frequency in ('monthly', 'annual', 'custom')),
  status text not null default 'trial'
    check (status in ('trial', 'active', 'past_due', 'paused', 'cancelled')),
  currency text not null default 'GBP',
  monthly_value_minor integer null check (monthly_value_minor is null or monthly_value_minor >= 0),
  annual_value_minor integer null check (annual_value_minor is null or annual_value_minor >= 0),
  starts_at date null,
  renewal_at date null,
  trial_ends_at date null,
  cancelled_at timestamptz null,
  external_provider text null,
  external_customer_id text null,
  external_subscription_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organisation_subscriptions_org_idx
  on public.organisation_subscriptions (organisation_id);
create index if not exists organisation_subscriptions_status_idx
  on public.organisation_subscriptions (status);
create index if not exists organisation_subscriptions_renewal_idx
  on public.organisation_subscriptions (renewal_at);

-- ---------------------------------------------------------------------------
-- 5. Payment methods (masked / provider metadata only — never full PAN/CVV)
-- ---------------------------------------------------------------------------
create table if not exists public.organisation_payment_methods (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  method_type text not null
    check (method_type in ('card', 'direct_debit', 'bank_transfer', 'purchase_order')),
  provider text null,
  provider_customer_id text null,
  provider_payment_method_id text null,
  brand text null,
  last_four text null,
  exp_month integer null check (exp_month is null or (exp_month >= 1 and exp_month <= 12)),
  exp_year integer null,
  billing_name text null,
  masked_descriptor text not null default '',
  is_default boolean not null default false,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'expired', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_payment_methods_no_full_pan
    check (
      last_four is null
      or (char_length(last_four) <= 4 and last_four ~ '^[0-9*]+$')
    )
);

create index if not exists organisation_payment_methods_org_idx
  on public.organisation_payment_methods (organisation_id);

-- ---------------------------------------------------------------------------
-- 6. Invoices
-- ---------------------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  invoice_number text not null,
  invoice_date date not null,
  due_date date null,
  net_minor integer not null default 0 check (net_minor >= 0),
  vat_minor integer not null default 0 check (vat_minor >= 0),
  gross_minor integer not null default 0 check (gross_minor >= 0),
  currency text not null default 'GBP',
  status text not null default 'draft'
    check (status in ('draft', 'issued', 'paid', 'part_paid', 'overdue', 'void', 'refunded', 'credited')),
  payment_date date null,
  payment_method_id uuid null references public.organisation_payment_methods(id) on delete set null,
  purchase_order_reference text null,
  external_provider text null,
  external_invoice_id text null,
  document_reference text null,
  notes text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_number)
);

create index if not exists invoices_org_idx on public.invoices (organisation_id);
create index if not exists invoices_status_idx on public.invoices (status);
create index if not exists invoices_due_date_idx on public.invoices (due_date);

-- ---------------------------------------------------------------------------
-- 7. Purchase orders (NHS / enterprise)
-- ---------------------------------------------------------------------------
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  po_number text not null,
  description text null,
  approved_value_minor integer not null check (approved_value_minor >= 0),
  currency text not null default 'GBP',
  starts_at date null,
  expires_at date null,
  amount_invoiced_minor integer not null default 0 check (amount_invoiced_minor >= 0),
  status text not null default 'active'
    check (status in ('active', 'expiring', 'expired', 'fully_used', 'cancelled')),
  document_reference text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, po_number)
);

create index if not exists purchase_orders_org_idx on public.purchase_orders (organisation_id);
create index if not exists purchase_orders_status_idx on public.purchase_orders (status);
create index if not exists purchase_orders_expires_idx on public.purchase_orders (expires_at);

-- ---------------------------------------------------------------------------
-- 8. Contracts
-- ---------------------------------------------------------------------------
create table if not exists public.organisation_contracts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  reference text null,
  starts_at date null,
  ends_at date null,
  notice_period_days integer null check (notice_period_days is null or notice_period_days >= 0),
  renewal_type text not null default 'manual'
    check (renewal_type in ('manual', 'auto', 'fixed_term', 'rolling')),
  contract_value_minor integer null check (contract_value_minor is null or contract_value_minor >= 0),
  currency text not null default 'GBP',
  account_owner text null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'renewal_due', 'expired', 'terminated')),
  document_reference text null,
  notes text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organisation_contracts_org_idx
  on public.organisation_contracts (organisation_id);
create index if not exists organisation_contracts_status_idx
  on public.organisation_contracts (status);

-- ---------------------------------------------------------------------------
-- 9. Organisation trials
-- ---------------------------------------------------------------------------
create table if not exists public.organisation_trials (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  trial_starts_at date not null,
  trial_ends_at date not null,
  duration_days integer not null check (duration_days > 0),
  conversion_status text not null default 'new'
    check (conversion_status in (
      'new', 'engaging', 'review_required', 'conversion_discussion', 'converted', 'not_converted'
    )),
  follow_up_at date null,
  notes text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id)
);

create index if not exists organisation_trials_ends_idx
  on public.organisation_trials (trial_ends_at);
create index if not exists organisation_trials_conversion_idx
  on public.organisation_trials (conversion_status);

-- ---------------------------------------------------------------------------
-- 10. Support cases
-- ---------------------------------------------------------------------------
create table if not exists public.support_cases (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid null references public.organisations(id) on delete set null,
  user_id uuid null references auth.users(id) on delete set null,
  category text not null default 'other'
    check (category in (
      'access', 'account', 'billing', 'technical', 'ai', 'data', 'feature_request', 'other'
    )),
  subject text not null,
  description text not null default '',
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to text null,
  resolution_notes text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_cases_org_idx on public.support_cases (organisation_id);
create index if not exists support_cases_status_idx on public.support_cases (status);
create index if not exists support_cases_priority_idx on public.support_cases (priority);

-- ---------------------------------------------------------------------------
-- 11. Platform audit events (immutable via ordinary UI — no update/delete policies)
-- ---------------------------------------------------------------------------
create table if not exists public.platform_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid null references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid null,
  organisation_id uuid null references public.organisations(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_audit_events_created_idx
  on public.platform_audit_events (created_at desc);
create index if not exists platform_audit_events_org_idx
  on public.platform_audit_events (organisation_id, created_at desc);
create index if not exists platform_audit_events_action_idx
  on public.platform_audit_events (action);

-- ---------------------------------------------------------------------------
-- 12. Platform settings (non-secret configuration only)
-- ---------------------------------------------------------------------------
create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (key, value, description)
values
  ('trial_defaults', '{"duration_days": 30, "follow_up_days_before_end": 7}'::jsonb, 'Default trial configuration'),
  ('commercial_defaults', '{"currency": "GBP", "vat_rate_bps": 2000}'::jsonb, 'Commercial defaults (basis points for VAT)'),
  ('organisation_defaults', '{"licence_plan_name": "Pilot", "seats": 5}'::jsonb, 'Defaults for new organisations')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 13. Safe usage count RPC (counts only — never conversation/content text)
-- ---------------------------------------------------------------------------
create or replace function public.owner_organisation_usage_counts(p_organisation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_since timestamptz := now() - interval '30 days';
begin
  if not public.is_platform_owner(auth.uid()) then
    raise exception 'not authorised';
  end if;

  select jsonb_build_object(
    'managers_invited', (
      select count(*)::int from public.organisation_memberships m
      where m.organisation_id = p_organisation_id
        and m.professional_role = 'manager'
    ),
    'managers_activated', (
      select count(*)::int from public.organisation_memberships m
      where m.organisation_id = p_organisation_id
        and m.professional_role = 'manager'
        and m.status = 'active'
        and m.joined_at is not null
    ),
    'team_members', (
      select count(*)::int from public.clients c
      where c.organisation_id = p_organisation_id
        and c.archived_at is null
    ),
    'active_members', (
      select count(*)::int from public.organisation_memberships m
      where m.organisation_id = p_organisation_id
        and m.status = 'active'
    ),
    'active_users_30d', (
      select count(*)::int from public.organisation_memberships m
      where m.organisation_id = p_organisation_id
        and m.status = 'active'
        and m.last_active_at is not null
        and m.last_active_at >= v_since
    ),
    'conversations_completed_30d', (
      select count(*)::int from public.sessions s
      where s.organisation_id = p_organisation_id
        and s.status = 'completed'
        and s.updated_at >= v_since
    ),
    'conversations_completed_total', (
      select count(*)::int from public.sessions s
      where s.organisation_id = p_organisation_id
        and s.status = 'completed'
    ),
    'preparations_generated_30d', (
      select count(*)::int from public.sessions s
      where s.organisation_id = p_organisation_id
        and s.prep_ai_brief_generated_at is not null
        and s.prep_ai_brief_generated_at >= v_since
    ),
    'preparations_generated_total', (
      select count(*)::int from public.sessions s
      where s.organisation_id = p_organisation_id
        and s.prep_ai_brief_generated_at is not null
    ),
    'ai_requests_30d', (
      select count(*)::int from public.sessions s
      where s.organisation_id = p_organisation_id
        and (
          (s.prep_ai_brief_generated_at is not null and s.prep_ai_brief_generated_at >= v_since)
          or (s.summary_status is not null and s.updated_at >= v_since and s.summary_status <> 'none')
        )
    ),
    'last_activity_at', (
      select greatest(
        (select max(m.last_active_at) from public.organisation_memberships m where m.organisation_id = p_organisation_id),
        (select max(s.updated_at) from public.sessions s where s.organisation_id = p_organisation_id)
      )
    )
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.owner_platform_usage_totals()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_since timestamptz := now() - interval '30 days';
begin
  if not public.is_platform_owner(auth.uid()) then
    raise exception 'not authorised';
  end if;

  select jsonb_build_object(
    'active_organisations', (
      select count(*)::int from public.organisations o
      where o.status = 'active'
        and coalesce(o.licence_status, 'active') in ('active', 'trial')
        and o.organisation_type <> 'personal'
    ),
    'trial_organisations', (
      select count(*)::int from public.organisations o
      where o.status = 'active'
        and o.licence_status = 'trial'
    ),
    'total_managers', (
      select count(*)::int from public.organisation_memberships m
      join public.organisations o on o.id = m.organisation_id
      where m.professional_role = 'manager'
        and m.status = 'active'
        and o.organisation_type <> 'personal'
    ),
    'total_team_members', (
      select count(*)::int from public.clients c
      join public.organisations o on o.id = c.organisation_id
      where c.archived_at is null
        and o.organisation_type <> 'personal'
    ),
    'active_users_30d', (
      select count(*)::int from public.organisation_memberships m
      where m.status = 'active'
        and m.last_active_at is not null
        and m.last_active_at >= v_since
    ),
    'conversations_30d', (
      select count(*)::int from public.sessions s
      where s.status = 'completed'
        and s.updated_at >= v_since
    ),
    'ai_requests_30d', (
      select count(*)::int from public.sessions s
      where (
        (s.prep_ai_brief_generated_at is not null and s.prep_ai_brief_generated_at >= v_since)
        or (s.summary_status is not null and s.updated_at >= v_since and s.summary_status <> 'none')
      )
    )
  ) into v_result;

  return v_result;
end;
$$;

-- Directory helper: membership + profile + email for platform owners only
create or replace function public.owner_list_platform_users(
  p_search text default null,
  p_organisation_id uuid default null,
  p_role text default null,
  p_status text default null,
  p_limit integer default 100
)
returns table (
  membership_id uuid,
  user_id uuid,
  organisation_id uuid,
  organisation_name text,
  role text,
  professional_role text,
  status text,
  full_name text,
  email text,
  last_active_at timestamptz,
  joined_at timestamptz,
  invited_at timestamptz,
  created_at timestamptz,
  invitation_status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner(auth.uid()) then
    raise exception 'not authorised';
  end if;

  return query
  select
    m.id as membership_id,
    m.user_id,
    m.organisation_id,
    o.name as organisation_name,
    m.role,
    m.professional_role,
    m.status,
    coalesce(p.full_name, '') as full_name,
    coalesce(u.email, '') as email,
    m.last_active_at,
    m.joined_at,
    m.invited_at,
    m.created_at,
    case
      when m.status = 'invited' then 'pending'
      when m.status = 'active' and m.joined_at is not null then 'accepted'
      when m.status = 'deactivated' then 'deactivated'
      else m.status
    end as invitation_status
  from public.organisation_memberships m
  join public.organisations o on o.id = m.organisation_id
  left join public.profiles p on p.id = m.user_id
  left join auth.users u on u.id = m.user_id
  where (p_organisation_id is null or m.organisation_id = p_organisation_id)
    and (p_role is null or m.role = p_role)
    and (p_status is null or m.status = p_status)
    and (
      p_search is null
      or p_search = ''
      or o.name ilike '%' || p_search || '%'
      or coalesce(p.full_name, '') ilike '%' || p_search || '%'
      or coalesce(u.email, '') ilike '%' || p_search || '%'
    )
  order by m.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

revoke all on function public.owner_organisation_usage_counts(uuid) from public;
revoke all on function public.owner_platform_usage_totals() from public;
revoke all on function public.owner_list_platform_users(text, uuid, text, text, integer) from public;
grant execute on function public.owner_organisation_usage_counts(uuid) to authenticated;
grant execute on function public.owner_platform_usage_totals() to authenticated;
grant execute on function public.owner_list_platform_users(text, uuid, text, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 14. RLS — enable on new tables
-- ---------------------------------------------------------------------------
alter table public.platform_owners enable row level security;
alter table public.platform_plans enable row level security;
alter table public.organisation_subscriptions enable row level security;
alter table public.organisation_payment_methods enable row level security;
alter table public.invoices enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.organisation_contracts enable row level security;
alter table public.organisation_trials enable row level security;
alter table public.support_cases enable row level security;
alter table public.platform_audit_events enable row level security;
alter table public.platform_settings enable row level security;

-- platform_owners: owners can read active peers; no self-insert via client
drop policy if exists "Platform owners select self or peers" on public.platform_owners;
create policy "Platform owners select self or peers" on public.platform_owners
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_platform_owner(auth.uid())
  );

-- Admin tables: platform owners only
drop policy if exists "Platform plans select owner" on public.platform_plans;
create policy "Platform plans select owner" on public.platform_plans
  for select to authenticated
  using (public.is_platform_owner(auth.uid()));

drop policy if exists "Platform plans write owner" on public.platform_plans;
create policy "Platform plans write owner" on public.platform_plans
  for all to authenticated
  using (public.is_platform_owner(auth.uid()))
  with check (public.is_platform_owner(auth.uid()));

drop policy if exists "Subscriptions owner all" on public.organisation_subscriptions;
create policy "Subscriptions owner all" on public.organisation_subscriptions
  for all to authenticated
  using (public.is_platform_owner(auth.uid()))
  with check (public.is_platform_owner(auth.uid()));

drop policy if exists "Payment methods owner all" on public.organisation_payment_methods;
create policy "Payment methods owner all" on public.organisation_payment_methods
  for all to authenticated
  using (public.is_platform_owner(auth.uid()))
  with check (public.is_platform_owner(auth.uid()));

drop policy if exists "Invoices owner all" on public.invoices;
create policy "Invoices owner all" on public.invoices
  for all to authenticated
  using (public.is_platform_owner(auth.uid()))
  with check (public.is_platform_owner(auth.uid()));

drop policy if exists "Purchase orders owner all" on public.purchase_orders;
create policy "Purchase orders owner all" on public.purchase_orders
  for all to authenticated
  using (public.is_platform_owner(auth.uid()))
  with check (public.is_platform_owner(auth.uid()));

drop policy if exists "Contracts owner all" on public.organisation_contracts;
create policy "Contracts owner all" on public.organisation_contracts
  for all to authenticated
  using (public.is_platform_owner(auth.uid()))
  with check (public.is_platform_owner(auth.uid()));

drop policy if exists "Trials owner all" on public.organisation_trials;
create policy "Trials owner all" on public.organisation_trials
  for all to authenticated
  using (public.is_platform_owner(auth.uid()))
  with check (public.is_platform_owner(auth.uid()));

drop policy if exists "Support cases owner all" on public.support_cases;
create policy "Support cases owner all" on public.support_cases
  for all to authenticated
  using (public.is_platform_owner(auth.uid()))
  with check (public.is_platform_owner(auth.uid()));

-- Audit: insert + select for platform owners; no update/delete policies
drop policy if exists "Platform audit select owner" on public.platform_audit_events;
create policy "Platform audit select owner" on public.platform_audit_events
  for select to authenticated
  using (public.is_platform_owner(auth.uid()));

drop policy if exists "Platform audit insert owner" on public.platform_audit_events;
create policy "Platform audit insert owner" on public.platform_audit_events
  for insert to authenticated
  with check (
    public.is_platform_owner(auth.uid())
    and (actor_user_id is null or actor_user_id = auth.uid())
  );

drop policy if exists "Platform settings owner all" on public.platform_settings;
create policy "Platform settings owner all" on public.platform_settings
  for all to authenticated
  using (public.is_platform_owner(auth.uid()))
  with check (public.is_platform_owner(auth.uid()));

-- Cross-tenant organisation/membership visibility for platform owners (metadata)
drop policy if exists "Organisations select platform owner" on public.organisations;
create policy "Organisations select platform owner" on public.organisations
  for select to authenticated
  using (public.is_platform_owner(auth.uid()));

drop policy if exists "Organisations update platform owner" on public.organisations;
create policy "Organisations update platform owner" on public.organisations
  for update to authenticated
  using (public.is_platform_owner(auth.uid()))
  with check (public.is_platform_owner(auth.uid()));

drop policy if exists "Memberships select platform owner" on public.organisation_memberships;
create policy "Memberships select platform owner" on public.organisation_memberships
  for select to authenticated
  using (public.is_platform_owner(auth.uid()));

drop policy if exists "Memberships update platform owner" on public.organisation_memberships;
create policy "Memberships update platform owner" on public.organisation_memberships
  for update to authenticated
  using (public.is_platform_owner(auth.uid()))
  with check (public.is_platform_owner(auth.uid()));

drop policy if exists "Invitations select platform owner" on public.organisation_invitations;
create policy "Invitations select platform owner" on public.organisation_invitations
  for select to authenticated
  using (public.is_platform_owner(auth.uid()));

drop policy if exists "Org audit select platform owner" on public.organisation_audit_log;
create policy "Org audit select platform owner" on public.organisation_audit_log
  for select to authenticated
  using (public.is_platform_owner(auth.uid()));

-- IMPORTANT: intentionally NO platform_owner policies on:
-- sessions content columns, client_items, development_updates narratives,
-- coaching_moments, intelligence evidence, private notes, reports body text.
-- Usage counts are available only via owner_* RPCs above.

comment on table public.platform_owners is
  'Platform-level Pridmora operators. Not an organisation membership role.';
comment on table public.platform_audit_events is
  'Owner Console audit trail. Safe operational metadata only — no coaching content.';
comment on function public.owner_organisation_usage_counts(uuid) is
  'Returns operational usage COUNTS only for platform owners. Never returns conversation or note content.';
