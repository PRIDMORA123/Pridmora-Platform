-- Organisation and Multi-User Foundation
-- Phase 1: organisations, memberships, invitations, assignments,
-- organisation_id backfill, personal organisations, RLS helpers.
--
-- Idempotent. Retains coach_id / user_id columns during transition.
-- Confidential coaching content remains assignment-scoped.

-- ---------------------------------------------------------------------------
-- 0. Affected tables (documentation for operators)
-- ---------------------------------------------------------------------------
-- New: organisations, organisation_memberships, organisation_invitations,
--      relationship_assignments, organisation_audit_log, organisation_migration_review
-- Altered with organisation_id:
--   clients, sessions, client_items, coaching_reports, development_reports,
--   development_profiles, development_updates, coaching_moments,
--   intelligence_items, intelligence_evidence, session_intelligence_reviews,
--   question_insights, person_progress_signals, intelligence_audit_log
-- Altered preferences: profiles.current_organisation_id

-- ---------------------------------------------------------------------------
-- 1. Organisations
-- ---------------------------------------------------------------------------
create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  organisation_type text not null default 'personal'
    check (organisation_type in (
      'personal', 'practice', 'business', 'public_sector', 'education', 'other'
    )),
  status text not null default 'active'
    check (status in ('active', 'archived', 'pending_closure')),
  created_by uuid not null references auth.users(id),
  default_preparation_style text
    check (
      default_preparation_style is null
      or default_preparation_style in ('minimal', 'guided', 'enhanced')
    ),
  ai_enabled boolean not null default true,
  data_retention_policy_label text not null default 'standard',
  branding_status text not null default 'none'
    check (branding_status in ('none', 'placeholder', 'configured')),
  logo_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null
);

create index if not exists organisations_created_by_idx
  on public.organisations (created_by);
create index if not exists organisations_status_idx
  on public.organisations (status);

-- ---------------------------------------------------------------------------
-- 2. Memberships
-- ---------------------------------------------------------------------------
create table if not exists public.organisation_memberships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null
    check (role in ('owner', 'administrator', 'oversight', 'practitioner', 'viewer')),
  professional_role text null
    check (
      professional_role is null
      or professional_role in (
        'coach', 'manager', 'mentor', 'facilitator', 'supervisor', 'other'
      )
    ),
  status text not null default 'active'
    check (status in ('active', 'invited', 'deactivated')),
  invited_by uuid null references auth.users(id),
  invited_at timestamptz null,
  joined_at timestamptz null,
  deactivated_at timestamptz null,
  last_active_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, user_id)
);

create index if not exists organisation_memberships_user_id_idx
  on public.organisation_memberships (user_id);
create index if not exists organisation_memberships_org_status_idx
  on public.organisation_memberships (organisation_id, status);

-- ---------------------------------------------------------------------------
-- 3. Invitations (hashed tokens only)
-- ---------------------------------------------------------------------------
create table if not exists public.organisation_invitations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  email text not null,
  role text not null
    check (role in ('owner', 'administrator', 'oversight', 'practitioner', 'viewer')),
  professional_role text null
    check (
      professional_role is null
      or professional_role in (
        'coach', 'manager', 'mentor', 'facilitator', 'supervisor', 'other'
      )
    ),
  token_hash text not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz null,
  accepted_by uuid null references auth.users(id),
  created_at timestamptz not null default now()
);

create unique index if not exists organisation_invitations_pending_email_idx
  on public.organisation_invitations (organisation_id, lower(email))
  where status = 'pending';

create index if not exists organisation_invitations_token_hash_idx
  on public.organisation_invitations (token_hash);

-- ---------------------------------------------------------------------------
-- 4. Relationship assignments
-- ---------------------------------------------------------------------------
create table if not exists public.relationship_assignments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assignment_role text not null default 'primary'
    check (assignment_role in ('primary', 'co_practitioner', 'cover', 'supervisor')),
  status text not null default 'active'
    check (status in ('active', 'ended')),
  assigned_by uuid null references auth.users(id),
  assigned_at timestamptz not null default now(),
  ended_at timestamptz null,
  end_reason text null,
  created_at timestamptz not null default now()
);

create index if not exists relationship_assignments_client_idx
  on public.relationship_assignments (client_id, status);
create index if not exists relationship_assignments_user_idx
  on public.relationship_assignments (user_id, status);
create index if not exists relationship_assignments_org_idx
  on public.relationship_assignments (organisation_id, status);

-- One active primary assignment per client
create unique index if not exists relationship_assignments_one_active_primary_idx
  on public.relationship_assignments (client_id)
  where status = 'active' and assignment_role = 'primary';

-- One active assignment per user/client/role
create unique index if not exists relationship_assignments_active_unique_idx
  on public.relationship_assignments (client_id, user_id, assignment_role)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- 5. Organisation audit log (safe metadata only)
-- ---------------------------------------------------------------------------
create table if not exists public.organisation_audit_log (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  actor_user_id uuid null references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists organisation_audit_log_org_created_idx
  on public.organisation_audit_log (organisation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 6. Ambiguous ownership review queue
-- ---------------------------------------------------------------------------
create table if not exists public.organisation_migration_review (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  reason text not null,
  details jsonb not null default '{}'::jsonb,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (table_name, record_id, reason)
);

-- ---------------------------------------------------------------------------
-- 7. Profile preference for current organisation
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists current_organisation_id uuid
    references public.organisations(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 8. Add organisation_id columns (nullable during backfill)
-- ---------------------------------------------------------------------------
alter table public.clients
  add column if not exists organisation_id uuid references public.organisations(id);

alter table public.sessions
  add column if not exists organisation_id uuid references public.organisations(id);

alter table public.client_items
  add column if not exists organisation_id uuid references public.organisations(id);

alter table public.coaching_reports
  add column if not exists organisation_id uuid references public.organisations(id);

do $$
begin
  if to_regclass('public.development_reports') is not null then
    alter table public.development_reports
      add column if not exists organisation_id uuid references public.organisations(id);
  end if;
  if to_regclass('public.development_profiles') is not null then
    alter table public.development_profiles
      add column if not exists organisation_id uuid references public.organisations(id);
  end if;
  if to_regclass('public.development_updates') is not null then
    alter table public.development_updates
      add column if not exists organisation_id uuid references public.organisations(id);
  end if;
  if to_regclass('public.coaching_moments') is not null then
    alter table public.coaching_moments
      add column if not exists organisation_id uuid references public.organisations(id);
  end if;
  if to_regclass('public.intelligence_items') is not null then
    alter table public.intelligence_items
      add column if not exists organisation_id uuid references public.organisations(id);
  end if;
  if to_regclass('public.intelligence_evidence') is not null then
    alter table public.intelligence_evidence
      add column if not exists organisation_id uuid references public.organisations(id);
  end if;
  if to_regclass('public.session_intelligence_reviews') is not null then
    alter table public.session_intelligence_reviews
      add column if not exists organisation_id uuid references public.organisations(id);
  end if;
  if to_regclass('public.question_insights') is not null then
    alter table public.question_insights
      add column if not exists organisation_id uuid references public.organisations(id);
  end if;
  if to_regclass('public.person_progress_signals') is not null then
    alter table public.person_progress_signals
      add column if not exists organisation_id uuid references public.organisations(id);
  end if;
  if to_regclass('public.intelligence_audit_log') is not null then
    alter table public.intelligence_audit_log
      add column if not exists organisation_id uuid references public.organisations(id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Helper: slugify personal workspace
-- ---------------------------------------------------------------------------
create or replace function public.organisation_personal_slug(p_user_id uuid)
returns text
language sql
immutable
as $$
  select 'personal-' || replace(p_user_id::text, '-', '');
$$;

-- ---------------------------------------------------------------------------
-- 10. Ensure personal organisation for a user (idempotent)
-- ---------------------------------------------------------------------------
create or replace function public.ensure_personal_organisation(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_name text;
  v_slug text;
begin
  if p_user_id is null then
    raise exception 'user id required';
  end if;

  -- Prefer existing personal org via membership
  select o.id into v_org_id
  from public.organisations o
  join public.organisation_memberships m
    on m.organisation_id = o.id
  where m.user_id = p_user_id
    and m.role = 'owner'
    and m.status = 'active'
    and o.organisation_type = 'personal'
    and o.status = 'active'
  order by o.created_at asc
  limit 1;

  if v_org_id is not null then
    return v_org_id;
  end if;

  v_slug := public.organisation_personal_slug(p_user_id);

  select id into v_org_id
  from public.organisations
  where slug = v_slug
  limit 1;

  if v_org_id is null then
    select coalesce(nullif(trim(p.full_name), ''), 'Personal') || ' Personal workspace'
      into v_name
    from public.profiles p
    where p.id = p_user_id;

    if v_name is null then
      v_name := 'Personal workspace';
    end if;

    insert into public.organisations (
      name, slug, organisation_type, status, created_by
    ) values (
      v_name, v_slug, 'personal', 'active', p_user_id
    )
    returning id into v_org_id;
  end if;

  insert into public.organisation_memberships (
    organisation_id, user_id, role, professional_role, status, joined_at
  ) values (
    v_org_id, p_user_id, 'owner', 'coach', 'active', now()
  )
  on conflict (organisation_id, user_id) do update
    set status = 'active',
        role = case
          when organisation_memberships.role = 'owner' then organisation_memberships.role
          else organisation_memberships.role
        end,
        updated_at = now(),
        joined_at = coalesce(organisation_memberships.joined_at, now());

  update public.profiles
  set current_organisation_id = coalesce(current_organisation_id, v_org_id),
      updated_at = now()
  where id = p_user_id
    and (current_organisation_id is null or current_organisation_id = v_org_id);

  return v_org_id;
end;
$$;

revoke all on function public.ensure_personal_organisation(uuid) from public;
grant execute on function public.ensure_personal_organisation(uuid) to authenticated;
grant execute on function public.ensure_personal_organisation(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 11. Backfill personal organisations for users who own records or have profiles
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select distinct owner_id
    from (
      select id as owner_id from public.profiles
      union
      select coach_id from public.clients
      union
      select coach_id from public.sessions
      union
      select coach_id from public.client_items
    ) owners
    where owner_id is not null
  loop
    perform public.ensure_personal_organisation(r.owner_id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 12. Backfill organisation_id on clients from coach personal org
-- ---------------------------------------------------------------------------
update public.clients c
set organisation_id = subquery.org_id,
    updated_at = coalesce(c.updated_at, now())
from (
  select
    m.user_id as coach_id,
    o.id as org_id
  from public.organisations o
  join public.organisation_memberships m
    on m.organisation_id = o.id
  where m.role = 'owner'
    and m.status = 'active'
    and o.organisation_type = 'personal'
    and o.status = 'active'
) subquery
where c.coach_id = subquery.coach_id
  and c.organisation_id is null;

-- Ambiguous / missing client ownership
insert into public.organisation_migration_review (table_name, record_id, reason, details)
select
  'clients',
  c.id,
  'missing_organisation_after_backfill',
  jsonb_build_object('coach_id', c.coach_id, 'name', c.name)
from public.clients c
where c.organisation_id is null
on conflict (table_name, record_id, reason) do nothing;

-- ---------------------------------------------------------------------------
-- 13. Create primary assignments from existing coach_id ownership
-- ---------------------------------------------------------------------------
insert into public.relationship_assignments (
  organisation_id, client_id, user_id, assignment_role, status, assigned_by, assigned_at
)
select
  c.organisation_id,
  c.id,
  c.coach_id,
  'primary',
  'active',
  c.coach_id,
  coalesce(c.created_at, now())
from public.clients c
where c.organisation_id is not null
  and not exists (
    select 1
    from public.relationship_assignments ra
    where ra.client_id = c.id
      and ra.assignment_role = 'primary'
      and ra.status = 'active'
  )
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 14. Backfill organisation_id on dependent tables via client
-- ---------------------------------------------------------------------------
update public.sessions s
set organisation_id = c.organisation_id
from public.clients c
where s.client_id = c.id
  and s.organisation_id is null
  and c.organisation_id is not null;

update public.client_items ci
set organisation_id = c.organisation_id
from public.clients c
where ci.client_id = c.id
  and ci.organisation_id is null
  and c.organisation_id is not null;

update public.coaching_reports cr
set organisation_id = c.organisation_id
from public.clients c
where cr.client_id = c.id
  and cr.organisation_id is null
  and c.organisation_id is not null;

do $$
begin
  if to_regclass('public.development_reports') is not null then
    -- Temporarily allow organisation_id backfill on approved snapshots.
    -- No report content fields are modified. Re-enable even if update fails.
    begin
      execute 'alter table public.development_reports disable trigger development_reports_prevent_approved_mutation';
    exception
      when undefined_object then null;
    end;

    begin
      execute $q$
        update public.development_reports dr
        set organisation_id = c.organisation_id
        from public.clients c
        where dr.client_id = c.id
          and dr.organisation_id is null
          and c.organisation_id is not null
      $q$;
    exception
      when others then
        begin
          execute 'alter table public.development_reports enable trigger development_reports_prevent_approved_mutation';
        exception
          when undefined_object then null;
        end;
        raise;
    end;

    begin
      execute 'alter table public.development_reports enable trigger development_reports_prevent_approved_mutation';
    exception
      when undefined_object then null;
    end;
  end if;

  if to_regclass('public.development_profiles') is not null then
    execute $q$
      update public.development_profiles dp
      set organisation_id = c.organisation_id
      from public.clients c
      where dp.client_id = c.id
        and dp.organisation_id is null
        and c.organisation_id is not null
    $q$;
  end if;

  if to_regclass('public.development_updates') is not null then
    execute $q$
      update public.development_updates du
      set organisation_id = c.organisation_id
      from public.clients c
      where du.client_id = c.id
        and du.organisation_id is null
        and c.organisation_id is not null
    $q$;
  end if;

  if to_regclass('public.coaching_moments') is not null then
    execute $q$
      update public.coaching_moments cm
      set organisation_id = c.organisation_id
      from public.clients c
      where cm.client_id = c.id
        and cm.organisation_id is null
        and c.organisation_id is not null
    $q$;
  end if;

  if to_regclass('public.intelligence_items') is not null then
    execute $q$
      update public.intelligence_items ii
      set organisation_id = c.organisation_id
      from public.clients c
      where ii.client_id = c.id
        and ii.organisation_id is null
        and c.organisation_id is not null
    $q$;
  end if;

  if to_regclass('public.session_intelligence_reviews') is not null then
    execute $q$
      update public.session_intelligence_reviews sir
      set organisation_id = c.organisation_id
      from public.clients c
      where sir.client_id = c.id
        and sir.organisation_id is null
        and c.organisation_id is not null
    $q$;
  end if;

  if to_regclass('public.question_insights') is not null then
    execute $q$
      update public.question_insights qi
      set organisation_id = c.organisation_id
      from public.clients c
      where qi.client_id = c.id
        and qi.organisation_id is null
        and c.organisation_id is not null
    $q$;
  end if;

  if to_regclass('public.person_progress_signals') is not null then
    execute $q$
      update public.person_progress_signals pps
      set organisation_id = c.organisation_id
      from public.clients c
      where pps.client_id = c.id
        and pps.organisation_id is null
        and c.organisation_id is not null
    $q$;
  end if;

  if to_regclass('public.intelligence_evidence') is not null then
    execute $q$
      update public.intelligence_evidence ie
      set organisation_id = ii.organisation_id
      from public.intelligence_items ii
      where ie.intelligence_item_id = ii.id
        and ie.organisation_id is null
        and ii.organisation_id is not null
    $q$;
  end if;

  if to_regclass('public.intelligence_audit_log') is not null then
    execute $q$
      update public.intelligence_audit_log ial
      set organisation_id = subquery.org_id
      from (
        select
          m.user_id as owner_id,
          m.organisation_id as org_id
        from public.organisation_memberships m
        join public.organisations o on o.id = m.organisation_id
        where m.status = 'active'
          and o.organisation_type = 'personal'
      ) subquery
      where ial.user_id = subquery.owner_id
        and ial.organisation_id is null
    $q$;
  end if;
end $$;

-- Report dependents still missing organisation_id
insert into public.organisation_migration_review (table_name, record_id, reason, details)
select 'sessions', s.id, 'missing_organisation_after_backfill',
       jsonb_build_object('client_id', s.client_id, 'coach_id', s.coach_id)
from public.sessions s
where s.organisation_id is null
on conflict (table_name, record_id, reason) do nothing;

-- ---------------------------------------------------------------------------
-- 15. Apply NOT NULL where safe (clients with organisation_id)
-- ---------------------------------------------------------------------------
-- Only enforce NOT NULL when every row is populated. Skip otherwise and leave review queue.
do $$
begin
  if not exists (select 1 from public.clients where organisation_id is null) then
    alter table public.clients alter column organisation_id set not null;
  end if;

  if not exists (select 1 from public.sessions where organisation_id is null) then
    alter table public.sessions alter column organisation_id set not null;
  end if;

  if not exists (select 1 from public.client_items where organisation_id is null) then
    alter table public.client_items alter column organisation_id set not null;
  end if;

  if not exists (select 1 from public.coaching_reports where organisation_id is null) then
    alter table public.coaching_reports alter column organisation_id set not null;
  end if;
end $$;

create index if not exists clients_organisation_id_idx on public.clients (organisation_id);
create index if not exists sessions_organisation_id_idx on public.sessions (organisation_id);
create index if not exists client_items_organisation_id_idx on public.client_items (organisation_id);

-- ---------------------------------------------------------------------------
-- 16. RLS helper functions
-- ---------------------------------------------------------------------------
create or replace function public.is_active_organisation_member(
  p_organisation_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_memberships m
    join public.organisations o on o.id = m.organisation_id
    where m.organisation_id = p_organisation_id
      and m.user_id = p_user_id
      and m.status = 'active'
      and o.status = 'active'
  );
$$;

create or replace function public.organisation_member_role(
  p_organisation_id uuid,
  p_user_id uuid default auth.uid()
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.organisation_memberships m
  where m.organisation_id = p_organisation_id
    and m.user_id = p_user_id
    and m.status = 'active'
  limit 1;
$$;

create or replace function public.has_organisation_permission(
  p_organisation_id uuid,
  p_user_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_memberships m
    where m.organisation_id = p_organisation_id
      and m.user_id = p_user_id
      and m.status = 'active'
      and (
        (p_permission = 'organisation.manage' and m.role in ('owner', 'administrator'))
        or (p_permission = 'organisation.view_usage' and m.role in ('owner', 'administrator', 'oversight'))
        or (p_permission = 'organisation.view_safe_oversight' and m.role in ('owner', 'administrator', 'oversight'))
        or (p_permission = 'members.invite' and m.role in ('owner', 'administrator'))
        or (p_permission = 'members.manage' and m.role in ('owner', 'administrator'))
        or (p_permission = 'members.deactivate' and m.role in ('owner', 'administrator'))
        or (p_permission = 'assignments.manage' and m.role in ('owner', 'administrator'))
        or (p_permission = 'relationships.create' and m.role in ('owner', 'administrator', 'practitioner'))
        or (p_permission = 'relationships.view_assigned' and m.role in ('owner', 'administrator', 'practitioner', 'oversight', 'viewer'))
        or (p_permission = 'relationships.transfer' and m.role in ('owner', 'administrator'))
        or (p_permission = 'coaching_content.view' and m.role in ('practitioner', 'owner', 'administrator'))
        or (p_permission = 'private_notes.view' and m.role in ('practitioner', 'owner', 'administrator'))
        or (p_permission = 'reports.generate' and m.role in ('practitioner', 'owner', 'administrator'))
        or (p_permission = 'reports.view_relationship' and m.role in ('practitioner', 'owner', 'administrator'))
        or (p_permission = 'billing.manage' and m.role = 'owner')
      )
  );
$$;

create or replace function public.user_is_assigned_to_client(
  p_client_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.relationship_assignments ra
    where ra.client_id = p_client_id
      and ra.user_id = p_user_id
      and ra.status = 'active'
      and ra.assignment_role in ('primary', 'co_practitioner', 'cover')
  );
$$;

create or replace function public.client_belongs_to_organisation(
  p_client_id uuid,
  p_organisation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.organisation_id = p_organisation_id
  );
$$;

-- Confidential content access: active assignment (preferred) OR legacy coach ownership
-- when no assignments exist yet for that client (transition safety).
create or replace function public.user_can_access_client_content(
  p_client_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.user_is_assigned_to_client(p_client_id, p_user_id)
    or (
      exists (
        select 1 from public.clients c
        where c.id = p_client_id and c.coach_id = p_user_id
      )
      and not exists (
        select 1 from public.relationship_assignments ra
        where ra.client_id = p_client_id and ra.status = 'active'
      )
    );
$$;

-- Safe operational metadata (no confidential notes): org admin/oversight members
create or replace function public.user_can_view_client_metadata(
  p_client_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.organisation_id is not null
      and (
        public.user_can_access_client_content(p_client_id, p_user_id)
        or public.has_organisation_permission(
          c.organisation_id, p_user_id, 'organisation.view_safe_oversight'
        )
        or public.has_organisation_permission(
          c.organisation_id, p_user_id, 'assignments.manage'
        )
      )
  );
$$;

revoke all on function public.is_active_organisation_member(uuid, uuid) from public;
revoke all on function public.organisation_member_role(uuid, uuid) from public;
revoke all on function public.has_organisation_permission(uuid, uuid, text) from public;
revoke all on function public.user_is_assigned_to_client(uuid, uuid) from public;
revoke all on function public.client_belongs_to_organisation(uuid, uuid) from public;
revoke all on function public.user_can_access_client_content(uuid, uuid) from public;
revoke all on function public.user_can_view_client_metadata(uuid, uuid) from public;

grant execute on function public.is_active_organisation_member(uuid, uuid) to authenticated;
grant execute on function public.organisation_member_role(uuid, uuid) to authenticated;
grant execute on function public.has_organisation_permission(uuid, uuid, text) to authenticated;
grant execute on function public.user_is_assigned_to_client(uuid, uuid) to authenticated;
grant execute on function public.client_belongs_to_organisation(uuid, uuid) to authenticated;
grant execute on function public.user_can_access_client_content(uuid, uuid) to authenticated;
grant execute on function public.user_can_view_client_metadata(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 17. Preserve legacy client_belongs_to_coach; extend with assignment awareness
-- ---------------------------------------------------------------------------
create or replace function public.client_belongs_to_coach(p_client_id uuid, p_coach_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_can_access_client_content(p_client_id, p_coach_id);
$$;

create or replace function public.client_is_active_for_coach(p_client_id uuid, p_coach_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.clients c
    where c.id = p_client_id
      and c.archived_at is null
      and public.user_can_access_client_content(p_client_id, p_coach_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- 18. RLS policies for organisation tables
-- ---------------------------------------------------------------------------
alter table public.organisations enable row level security;
alter table public.organisation_memberships enable row level security;
alter table public.organisation_invitations enable row level security;
alter table public.relationship_assignments enable row level security;
alter table public.organisation_audit_log enable row level security;
alter table public.organisation_migration_review enable row level security;

drop policy if exists "Organisations select member" on public.organisations;
create policy "Organisations select member" on public.organisations
  for select to authenticated
  using (public.is_active_organisation_member(id, auth.uid()));

drop policy if exists "Organisations insert owner" on public.organisations;
create policy "Organisations insert owner" on public.organisations
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "Organisations update manage" on public.organisations;
create policy "Organisations update manage" on public.organisations
  for update to authenticated
  using (public.has_organisation_permission(id, auth.uid(), 'organisation.manage'))
  with check (public.has_organisation_permission(id, auth.uid(), 'organisation.manage'));

drop policy if exists "Memberships select member" on public.organisation_memberships;
create policy "Memberships select member" on public.organisation_memberships
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_active_organisation_member(organisation_id, auth.uid())
  );

drop policy if exists "Memberships insert manage" on public.organisation_memberships;
create policy "Memberships insert manage" on public.organisation_memberships
  for insert to authenticated
  with check (
    public.has_organisation_permission(organisation_id, auth.uid(), 'members.manage')
    or (
      user_id = auth.uid()
      and role = 'owner'
      and exists (
        select 1 from public.organisations o
        where o.id = organisation_id and o.created_by = auth.uid()
      )
    )
  );

drop policy if exists "Memberships update manage" on public.organisation_memberships;
create policy "Memberships update manage" on public.organisation_memberships
  for update to authenticated
  using (
    public.has_organisation_permission(organisation_id, auth.uid(), 'members.manage')
    or user_id = auth.uid()
  )
  with check (
    public.has_organisation_permission(organisation_id, auth.uid(), 'members.manage')
    or user_id = auth.uid()
  );

drop policy if exists "Invitations select manage" on public.organisation_invitations;
create policy "Invitations select manage" on public.organisation_invitations
  for select to authenticated
  using (
    public.has_organisation_permission(organisation_id, auth.uid(), 'members.invite')
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "Invitations insert manage" on public.organisation_invitations;
create policy "Invitations insert manage" on public.organisation_invitations
  for insert to authenticated
  with check (
    invited_by = auth.uid()
    and public.has_organisation_permission(organisation_id, auth.uid(), 'members.invite')
  );

drop policy if exists "Invitations update manage" on public.organisation_invitations;
create policy "Invitations update manage" on public.organisation_invitations
  for update to authenticated
  using (
    public.has_organisation_permission(organisation_id, auth.uid(), 'members.invite')
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  with check (
    public.has_organisation_permission(organisation_id, auth.uid(), 'members.invite')
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "Assignments select scoped" on public.relationship_assignments;
create policy "Assignments select scoped" on public.relationship_assignments
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_organisation_permission(organisation_id, auth.uid(), 'assignments.manage')
    or public.is_active_organisation_member(organisation_id, auth.uid())
  );

drop policy if exists "Assignments insert manage" on public.relationship_assignments;
create policy "Assignments insert manage" on public.relationship_assignments
  for insert to authenticated
  with check (
    public.has_organisation_permission(organisation_id, auth.uid(), 'assignments.manage')
    or (
      user_id = auth.uid()
      and assignment_role = 'primary'
      and public.has_organisation_permission(organisation_id, auth.uid(), 'relationships.create')
    )
  );

drop policy if exists "Assignments update manage" on public.relationship_assignments;
create policy "Assignments update manage" on public.relationship_assignments
  for update to authenticated
  using (public.has_organisation_permission(organisation_id, auth.uid(), 'assignments.manage'))
  with check (public.has_organisation_permission(organisation_id, auth.uid(), 'assignments.manage'));

drop policy if exists "Org audit select oversight" on public.organisation_audit_log;
create policy "Org audit select oversight" on public.organisation_audit_log
  for select to authenticated
  using (
    public.has_organisation_permission(organisation_id, auth.uid(), 'organisation.view_safe_oversight')
  );

drop policy if exists "Org audit insert member" on public.organisation_audit_log;
create policy "Org audit insert member" on public.organisation_audit_log
  for insert to authenticated
  with check (
    actor_user_id = auth.uid()
    and public.is_active_organisation_member(organisation_id, auth.uid())
  );

-- Migration review: service role only (no authenticated policies)

-- ---------------------------------------------------------------------------
-- 19. Extend clients RLS — metadata for admins; content for assignees
-- ---------------------------------------------------------------------------
drop policy if exists "Clients select own" on public.clients;
create policy "Clients select own" on public.clients
  for select to authenticated
  using (
    public.user_can_view_client_metadata(id, auth.uid())
    or (coach_id = auth.uid())
  );

drop policy if exists "Clients insert own" on public.clients;
create policy "Clients insert own" on public.clients
  for insert to authenticated
  with check (
    coach_id = auth.uid()
    and (
      organisation_id is null
      or public.has_organisation_permission(organisation_id, auth.uid(), 'relationships.create')
    )
  );

drop policy if exists "Clients update own" on public.clients;
create policy "Clients update own" on public.clients
  for update to authenticated
  using (
    public.user_can_access_client_content(id, auth.uid())
    or public.has_organisation_permission(organisation_id, auth.uid(), 'assignments.manage')
    or coach_id = auth.uid()
  )
  with check (
    public.user_can_access_client_content(id, auth.uid())
    or public.has_organisation_permission(organisation_id, auth.uid(), 'assignments.manage')
    or coach_id = auth.uid()
  );

drop policy if exists "Clients delete own" on public.clients;
create policy "Clients delete own" on public.clients
  for delete to authenticated
  using (
    public.user_can_access_client_content(id, auth.uid())
    or coach_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 20. Sessions / confidential tables — assignment required (not admin-by-default)
-- ---------------------------------------------------------------------------
drop policy if exists "Sessions select own" on public.sessions;
create policy "Sessions select own" on public.sessions
  for select to authenticated
  using (
    public.user_can_access_client_content(client_id, auth.uid())
  );

drop policy if exists "Sessions insert own" on public.sessions;
create policy "Sessions insert own" on public.sessions
  for insert to authenticated
  with check (
    public.user_can_access_client_content(client_id, auth.uid())
    and public.client_is_active_for_coach(client_id, auth.uid())
  );

drop policy if exists "Sessions update own" on public.sessions;
create policy "Sessions update own" on public.sessions
  for update to authenticated
  using (public.user_can_access_client_content(client_id, auth.uid()))
  with check (
    public.user_can_access_client_content(client_id, auth.uid())
    and public.client_is_active_for_coach(client_id, auth.uid())
  );

drop policy if exists "Sessions delete own" on public.sessions;
create policy "Sessions delete own" on public.sessions
  for delete to authenticated
  using (public.user_can_access_client_content(client_id, auth.uid()));

drop policy if exists "Client items select own" on public.client_items;
create policy "Client items select own" on public.client_items
  for select to authenticated
  using (public.user_can_access_client_content(client_id, auth.uid()));

drop policy if exists "Client items insert own" on public.client_items;
create policy "Client items insert own" on public.client_items
  for insert to authenticated
  with check (
    public.user_can_access_client_content(client_id, auth.uid())
    and public.client_is_active_for_coach(client_id, auth.uid())
  );

drop policy if exists "Client items update own" on public.client_items;
create policy "Client items update own" on public.client_items
  for update to authenticated
  using (public.user_can_access_client_content(client_id, auth.uid()))
  with check (
    public.user_can_access_client_content(client_id, auth.uid())
    and public.client_is_active_for_coach(client_id, auth.uid())
  );

drop policy if exists "Client items delete own" on public.client_items;
create policy "Client items delete own" on public.client_items
  for delete to authenticated
  using (public.user_can_access_client_content(client_id, auth.uid()));

drop policy if exists "Coaching reports select own" on public.coaching_reports;
create policy "Coaching reports select own" on public.coaching_reports
  for select to authenticated
  using (public.user_can_access_client_content(client_id, auth.uid()));

drop policy if exists "Coaching reports insert own" on public.coaching_reports;
create policy "Coaching reports insert own" on public.coaching_reports
  for insert to authenticated
  with check (
    public.user_can_access_client_content(client_id, auth.uid())
    and public.client_is_active_for_coach(client_id, auth.uid())
  );

drop policy if exists "Coaching reports update own" on public.coaching_reports;
create policy "Coaching reports update own" on public.coaching_reports
  for update to authenticated
  using (public.user_can_access_client_content(client_id, auth.uid()))
  with check (
    public.user_can_access_client_content(client_id, auth.uid())
    and public.client_is_active_for_coach(client_id, auth.uid())
  );

drop policy if exists "Coaching reports delete own" on public.coaching_reports;
create policy "Coaching reports delete own" on public.coaching_reports
  for delete to authenticated
  using (public.user_can_access_client_content(client_id, auth.uid()));

-- Development / moments / intelligence tables (when present)
do $$
begin
  if to_regclass('public.development_profiles') is not null then
    execute $q$
      drop policy if exists "Development profiles select own" on public.development_profiles;
      create policy "Development profiles select own" on public.development_profiles
        for select to authenticated
        using (public.user_can_access_client_content(client_id, auth.uid()));
      drop policy if exists "Development profiles insert own" on public.development_profiles;
      create policy "Development profiles insert own" on public.development_profiles
        for insert to authenticated
        with check (public.user_can_access_client_content(client_id, auth.uid()));
      drop policy if exists "Development profiles update own" on public.development_profiles;
      create policy "Development profiles update own" on public.development_profiles
        for update to authenticated
        using (public.user_can_access_client_content(client_id, auth.uid()))
        with check (public.user_can_access_client_content(client_id, auth.uid()));
      drop policy if exists "Development profiles delete own" on public.development_profiles;
      create policy "Development profiles delete own" on public.development_profiles
        for delete to authenticated
        using (public.user_can_access_client_content(client_id, auth.uid()));
    $q$;
  end if;

  if to_regclass('public.development_updates') is not null then
    execute $q$
      drop policy if exists "Development updates select own" on public.development_updates;
      create policy "Development updates select own" on public.development_updates
        for select to authenticated
        using (public.user_can_access_client_content(client_id, auth.uid()));
      drop policy if exists "Development updates insert own" on public.development_updates;
      create policy "Development updates insert own" on public.development_updates
        for insert to authenticated
        with check (public.user_can_access_client_content(client_id, auth.uid()));
      drop policy if exists "Development updates update own" on public.development_updates;
      create policy "Development updates update own" on public.development_updates
        for update to authenticated
        using (public.user_can_access_client_content(client_id, auth.uid()))
        with check (public.user_can_access_client_content(client_id, auth.uid()));
      drop policy if exists "Development updates delete own" on public.development_updates;
      create policy "Development updates delete own" on public.development_updates
        for delete to authenticated
        using (public.user_can_access_client_content(client_id, auth.uid()));
    $q$;
  end if;

  if to_regclass('public.development_reports') is not null then
    execute $q$
      drop policy if exists "Development reports select own" on public.development_reports;
      create policy "Development reports select own" on public.development_reports
        for select to authenticated
        using (public.user_can_access_client_content(client_id, auth.uid()));
      drop policy if exists "Development reports insert own" on public.development_reports;
      create policy "Development reports insert own" on public.development_reports
        for insert to authenticated
        with check (public.user_can_access_client_content(client_id, auth.uid()));
      drop policy if exists "Development reports update own" on public.development_reports;
      create policy "Development reports update own" on public.development_reports
        for update to authenticated
        using (public.user_can_access_client_content(client_id, auth.uid()))
        with check (public.user_can_access_client_content(client_id, auth.uid()));
      drop policy if exists "Development reports delete own" on public.development_reports;
      create policy "Development reports delete own" on public.development_reports
        for delete to authenticated
        using (public.user_can_access_client_content(client_id, auth.uid()) and status = 'draft');
    $q$;
  end if;

  if to_regclass('public.coaching_moments') is not null then
    execute $q$
      drop policy if exists "Coaching moments select own" on public.coaching_moments;
      create policy "Coaching moments select own" on public.coaching_moments
        for select to authenticated
        using (public.user_can_access_client_content(client_id, auth.uid()));
      drop policy if exists "Coaching moments insert own" on public.coaching_moments;
      create policy "Coaching moments insert own" on public.coaching_moments
        for insert to authenticated
        with check (
          created_by = auth.uid()
          and public.user_can_access_client_content(client_id, auth.uid())
          and public.client_is_active_for_coach(client_id, auth.uid())
        );
      drop policy if exists "Coaching moments update own" on public.coaching_moments;
      create policy "Coaching moments update own" on public.coaching_moments
        for update to authenticated
        using (public.user_can_access_client_content(client_id, auth.uid()))
        with check (public.user_can_access_client_content(client_id, auth.uid()));
      drop policy if exists "Coaching moments delete own" on public.coaching_moments;
      create policy "Coaching moments delete own" on public.coaching_moments
        for delete to authenticated
        using (public.user_can_access_client_content(client_id, auth.uid()));
    $q$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 21. Auto-ensure personal org on new profile (extend handle_new_user if present)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user_organisation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_personal_organisation(new.id);
  return new;
end;
$$;

drop trigger if exists on_profile_ensure_organisation on public.profiles;
create trigger on_profile_ensure_organisation
  after insert on public.profiles
  for each row
  execute function public.handle_new_user_organisation();
