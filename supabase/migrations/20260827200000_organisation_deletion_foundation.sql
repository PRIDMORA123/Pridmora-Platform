-- DATA-LIFECYCLE DL-03: organisation deletion foundation only.
-- Creates job/certificate/retained-commercial tables, Platform Owner RLS,
-- undeletable_organisation_ids, and pending_closure fail-closed access.
--
-- DOES NOT implement organisation purge, storage deletion, commercial copy
-- execution, support minimisation, verification RPCs, or Owner Console delete.
-- No execute grant for any deletion/purge function: none exist in this slice.
--
-- Future live-data deletion (later slices) must target authoritative
-- organisation_id / descendant client_id / session_id keys.
-- Arbitrary text/JSON UUID matching on organisation_migration_review.details
-- (or similar denormalised fields) must never become a cross-tenant delete.

-- ---------------------------------------------------------------------------
-- 1. pending_closure access freeze helpers
-- ---------------------------------------------------------------------------
create or replace function public.organisation_status_allows_member_access(
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
    from public.organisations o
    where o.id = p_organisation_id
      and o.status is distinct from 'pending_closure'
  );
$$;

comment on function public.organisation_status_allows_member_access(uuid) is
  'True when the organisation exists and is not pending_closure. '
  'pending_closure denies ordinary member/coaching/development access. '
  'Does not change archived behaviour. Platform Owner policies do not use this helper.';

create or replace function public.client_organisation_allows_member_access(
  p_client_id uuid
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
      and (
        c.organisation_id is null
        or public.organisation_status_allows_member_access(c.organisation_id)
      )
  );
$$;

comment on function public.client_organisation_allows_member_access(uuid) is
  'True when the client exists and its organisation is not pending_closure. '
  'Legacy clients with null organisation_id remain allowed (personal/pre-migration).';

revoke all on function public.organisation_status_allows_member_access(uuid) from public;
revoke all on function public.client_organisation_allows_member_access(uuid) from public;
grant execute on function public.organisation_status_allows_member_access(uuid) to authenticated;
grant execute on function public.organisation_status_allows_member_access(uuid) to service_role;
grant execute on function public.client_organisation_allows_member_access(uuid) to authenticated;
grant execute on function public.client_organisation_allows_member_access(uuid) to service_role;

-- Permission matrix unchanged except pending_closure fail-closed.
-- Latest role grants (oversight Lead administration, sample_organisation.manage owner-only) preserved.
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
      and public.organisation_status_allows_member_access(m.organisation_id)
      and (
        (p_permission = 'organisation.manage' and m.role in ('owner', 'administrator'))
        or (p_permission = 'organisation.view_usage' and m.role in ('owner', 'administrator', 'oversight'))
        or (p_permission = 'organisation.view_safe_oversight' and m.role in ('owner', 'administrator', 'oversight'))
        or (p_permission = 'intelligence.organisation.read' and m.role in ('owner', 'administrator', 'oversight'))
        or (p_permission = 'members.invite' and m.role in ('owner', 'administrator', 'oversight'))
        or (p_permission = 'members.manage' and m.role in ('owner', 'administrator', 'oversight'))
        or (p_permission = 'members.deactivate' and m.role in ('owner', 'administrator', 'oversight'))
        or (p_permission = 'assignments.manage' and m.role in ('owner', 'administrator', 'oversight'))
        or (p_permission = 'relationships.create' and m.role in ('owner', 'administrator', 'practitioner'))
        or (p_permission = 'relationships.view_assigned' and m.role in ('owner', 'administrator', 'practitioner', 'oversight', 'viewer'))
        or (p_permission = 'relationships.transfer' and m.role in ('owner', 'administrator'))
        or (p_permission = 'coaching_content.view' and m.role in ('practitioner', 'owner', 'administrator'))
        or (p_permission = 'private_notes.view' and m.role in ('practitioner', 'owner', 'administrator'))
        or (p_permission = 'reports.generate' and m.role in ('practitioner', 'owner', 'administrator'))
        or (p_permission = 'reports.view_relationship' and m.role in ('practitioner', 'owner', 'administrator'))
        or (p_permission = 'billing.manage' and m.role = 'owner')
        or (p_permission = 'sample_organisation.manage' and m.role = 'owner')
      )
  );
$$;

revoke all on function public.has_organisation_permission(uuid, uuid, text) from public;
grant execute on function public.has_organisation_permission(uuid, uuid, text) to authenticated;
grant execute on function public.has_organisation_permission(uuid, uuid, text) to service_role;

comment on function public.has_organisation_permission(uuid, uuid, text) is
  'Organisation role permission matrix. pending_closure denies all member permissions. '
  'sample_organisation.manage is owner only. Does not grant coaching content or private identity. '
  'Platform Owner access uses platform_owners, not this helper.';

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
    and public.organisation_status_allows_member_access(m.organisation_id)
  limit 1;
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
    join public.clients c on c.id = ra.client_id
    where ra.client_id = p_client_id
      and ra.user_id = p_user_id
      and ra.status = 'active'
      and ra.assignment_role in ('primary', 'co_practitioner', 'cover')
      and public.client_organisation_allows_member_access(c.id)
  );
$$;

-- Confidential content: assignment or legacy coach_id, never when pending_closure.
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
    public.client_organisation_allows_member_access(p_client_id)
    and (
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
      )
    );
$$;

comment on function public.user_can_access_client_content(uuid, uuid) is
  'Confidential coaching/development content access. pending_closure organisations fail closed, '
  'including the legacy coach_id fallback. is_active_organisation_member already requires organisations.status = active.';

-- Invitation accept is SECURITY DEFINER and must not create memberships into a frozen tenant.
create or replace function public.accept_organisation_invitation(
  invitation_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_email_confirmed_at timestamptz;
  v_token_hash text;
  v_invite public.organisation_invitations%rowtype;
  v_membership_id uuid;
  v_seats_purchased integer;
  v_licence_status text;
  v_seats_in_use integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'INVITATION_INVALID');
  end if;

  if invitation_token is null or length(btrim(invitation_token)) = 0 then
    return jsonb_build_object('ok', false, 'code', 'INVITATION_INVALID');
  end if;

  select u.email, u.email_confirmed_at
  into v_email, v_email_confirmed_at
  from auth.users u
  where u.id = v_uid;

  if v_email is null or v_email_confirmed_at is null then
    return jsonb_build_object('ok', false, 'code', 'INVITATION_EMAIL_MISMATCH');
  end if;

  v_token_hash := encode(
    digest(convert_to(invitation_token, 'UTF8'), 'sha256'),
    'hex'
  );

  select *
  into v_invite
  from public.organisation_invitations
  where token_hash = v_token_hash
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'INVITATION_INVALID');
  end if;

  if v_invite.status is distinct from 'pending' then
    return jsonb_build_object('ok', false, 'code', 'INVITATION_ALREADY_USED');
  end if;

  if v_invite.expires_at <= now() then
    update public.organisation_invitations
    set status = 'expired'
    where id = v_invite.id
      and status = 'pending';
    return jsonb_build_object('ok', false, 'code', 'INVITATION_EXPIRED');
  end if;

  if lower(btrim(v_invite.email)) is distinct from lower(btrim(v_email)) then
    return jsonb_build_object('ok', false, 'code', 'INVITATION_EMAIL_MISMATCH');
  end if;

  if not public.organisation_status_allows_member_access(v_invite.organisation_id) then
    return jsonb_build_object('ok', false, 'code', 'INVITATION_INVALID');
  end if;

  if exists (
    select 1
    from public.organisation_memberships m
    where m.organisation_id = v_invite.organisation_id
      and m.user_id = v_uid
      and m.status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'code', 'INVITATION_MEMBERSHIP_EXISTS');
  end if;

  if v_invite.role = 'practitioner' then
    select
      coalesce(o.practitioner_seats_purchased, 0),
      coalesce(o.licence_status, 'active')
    into v_seats_purchased, v_licence_status
    from public.organisations o
    where o.id = v_invite.organisation_id;

    if v_licence_status is distinct from 'active'
       and v_licence_status is distinct from 'trial' then
      return jsonb_build_object('ok', false, 'code', 'INVITATION_INVALID');
    end if;

    select count(*)::integer
    into v_seats_in_use
    from public.organisation_memberships m
    where m.organisation_id = v_invite.organisation_id
      and m.status = 'active'
      and m.role = 'practitioner';

    if v_seats_in_use >= v_seats_purchased then
      return jsonb_build_object('ok', false, 'code', 'INVITATION_INVALID');
    end if;
  end if;

  update public.organisation_invitations
  set
    status = 'accepted',
    accepted_at = now(),
    accepted_by = v_uid
  where id = v_invite.id
    and status = 'pending';

  if not found then
    return jsonb_build_object('ok', false, 'code', 'INVITATION_ALREADY_USED');
  end if;

  insert into public.organisation_memberships (
    organisation_id,
    user_id,
    role,
    professional_role,
    status,
    invited_by,
    invited_at,
    joined_at,
    created_at,
    updated_at
  )
  values (
    v_invite.organisation_id,
    v_uid,
    v_invite.role,
    v_invite.professional_role,
    'active',
    v_invite.invited_by,
    v_invite.created_at,
    now(),
    now(),
    now()
  )
  on conflict (organisation_id, user_id) do update
    set
      role = excluded.role,
      professional_role = excluded.professional_role,
      status = 'active',
      invited_by = coalesce(organisation_memberships.invited_by, excluded.invited_by),
      invited_at = coalesce(organisation_memberships.invited_at, excluded.invited_at),
      joined_at = coalesce(organisation_memberships.joined_at, excluded.joined_at),
      deactivated_at = null,
      updated_at = now()
  returning id into v_membership_id;

  update public.profiles
  set
    current_organisation_id = v_invite.organisation_id,
    full_name = case
      when coalesce(nullif(btrim(full_name), ''), '') = ''
        and coalesce(nullif(btrim(v_invite.full_name), ''), '') <> ''
      then btrim(v_invite.full_name)
      else full_name
    end,
    professional_title = case
      when (
        coalesce(nullif(btrim(professional_title), ''), '') = ''
        or professional_title = 'Professional Coach'
      )
        and coalesce(nullif(btrim(v_invite.job_title), ''), '') <> ''
      then btrim(v_invite.job_title)
      else professional_title
    end,
    updated_at = now()
  where id = v_uid;

  insert into public.organisation_audit_log (
    organisation_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_invite.organisation_id,
    v_uid,
    'member_joined',
    'organisation_membership',
    v_membership_id,
    jsonb_build_object(
      'role', v_invite.role,
      'professional_role', v_invite.professional_role,
      'invitationId', v_invite.id,
      'via', 'accept_organisation_invitation'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'organisation_id', v_invite.organisation_id,
    'membership_id', v_membership_id,
    'role', v_invite.role,
    'professional_role', v_invite.professional_role
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'INVITATION_MEMBERSHIP_EXISTS');
end;
$$;

comment on function public.accept_organisation_invitation(text) is
  'Atomically accept a pending organisation invitation for auth.uid(). '
  'Rejects pending_closure organisations. Copies role values from the invitation; '
  'does not trust client-supplied org/role.';

revoke all on function public.accept_organisation_invitation(text) from public;
revoke all on function public.accept_organisation_invitation(text) from anon;
grant execute on function public.accept_organisation_invitation(text) to authenticated;
grant execute on function public.accept_organisation_invitation(text) to service_role;

comment on table public.organisation_migration_review is
  'Ambiguous ownership review queue. Future tenant deletion must delete rows by '
  'authoritative table_name + record_id belonging to the organisation or its descendant '
  'client/session identifiers. Do not delete by scanning details JSON/text for arbitrary UUIDs.';

-- ---------------------------------------------------------------------------
-- 2. Deletion job / certificate / retained commercial (no purge execution)
-- ---------------------------------------------------------------------------
create table if not exists public.organisation_deletion_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid null references public.organisations(id) on delete set null,
  former_organisation_id uuid not null,
  organisation_name_snapshot text not null,
  organisation_type_snapshot text not null,
  confirmation_name text not null default '',
  instruction_reference text null,
  status text not null default 'pending_freeze'
    check (status in (
      'pending_freeze',
      'frozen',
      'commercial_copied',
      'purging',
      'purged',
      'storage_cleaning',
      'verifying',
      'completed',
      'failed',
      'blocked'
    )),
  stage text not null default 'not_started',
  authorized_by uuid null references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  started_at timestamptz null,
  completed_at timestamptz null,
  last_error text null,
  inventory jsonb not null default '{}'::jsonb,
  storage_status text not null default 'not_started'
    check (storage_status in ('not_started', 'pending', 'passed', 'failed', 'not_applicable')),
  verification_status text not null default 'not_started'
    check (verification_status in ('not_started', 'pending', 'passed', 'failed')),
  external_follow_up_status text not null default 'not_started'
    check (external_follow_up_status in (
      'not_started', 'pending', 'unknown', 'not_applicable', 'passed'
    )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_deletion_runs_inventory_object
    check (jsonb_typeof(inventory) = 'object')
);

create index if not exists organisation_deletion_runs_former_org_idx
  on public.organisation_deletion_runs (former_organisation_id, requested_at desc);

create index if not exists organisation_deletion_runs_status_idx
  on public.organisation_deletion_runs (status);

create unique index if not exists organisation_deletion_runs_one_open_per_org_idx
  on public.organisation_deletion_runs (former_organisation_id)
  where status not in ('completed', 'blocked');

comment on table public.organisation_deletion_runs is
  'Idempotent organisation-deletion job state for later slices. DL-03 stores the '
  'state machine only — no RPC/API in this slice executes freeze, copy, purge, '
  'storage cleanup, or verification. former_organisation_id has no organisations FK. '
  'Personal organisations and sample installations remain outside this deletion path.';

comment on column public.organisation_deletion_runs.organisation_id is
  'Live organisations.id while the tenant row still exists. SET NULL when the org is deleted later.';

comment on column public.organisation_deletion_runs.former_organisation_id is
  'Stable tenant identifier with no FK. Survives organisation row deletion.';

create table if not exists public.organisation_deletion_certificates (
  deletion_run_id uuid primary key
    references public.organisation_deletion_runs(id) on delete restrict,
  former_organisation_id uuid not null,
  organisation_name text not null,
  organisation_type text not null,
  was_sample_installation boolean not null default false,
  instruction_reference text null,
  authority_verified boolean not null default false,
  authorised_by_user_id uuid null references auth.users(id) on delete set null,
  requested_at timestamptz not null,
  started_at timestamptz null,
  completed_at timestamptz not null default now(),
  verification_status text not null
    check (verification_status in ('passed')),
  storage_cleanup_status text not null
    check (storage_cleanup_status in ('passed', 'not_applicable')),
  external_follow_up_status text not null
    check (external_follow_up_status in ('not_applicable', 'pending', 'unknown')),
  backup_status text not null default 'unknown'
    check (backup_status in ('unknown', 'pending', 'not_applicable')),
  commercial_retained_count integer not null default 0
    check (commercial_retained_count >= 0),
  inventory_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint organisation_deletion_certificates_inventory_object
    check (jsonb_typeof(inventory_summary) = 'object')
);

create index if not exists organisation_deletion_certificates_former_org_idx
  on public.organisation_deletion_certificates (former_organisation_id);

comment on table public.organisation_deletion_certificates is
  'Minimised surviving proof that an authorised organisation deletion completed. '
  'No organisations FK (must survive tenant delete). No coaching/development payload. '
  'Insert-once: updates and deletes are blocked by trigger.';

create or replace function public.prevent_organisation_deletion_certificate_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'organisation_deletion_certificates are immutable';
end;
$$;

drop trigger if exists organisation_deletion_certificates_immutable_update
  on public.organisation_deletion_certificates;
create trigger organisation_deletion_certificates_immutable_update
  before update on public.organisation_deletion_certificates
  for each row
  execute function public.prevent_organisation_deletion_certificate_mutation();

drop trigger if exists organisation_deletion_certificates_immutable_delete
  on public.organisation_deletion_certificates;
create trigger organisation_deletion_certificates_immutable_delete
  before delete on public.organisation_deletion_certificates
  for each row
  execute function public.prevent_organisation_deletion_certificate_mutation();

revoke all on function public.prevent_organisation_deletion_certificate_mutation() from public;

create table if not exists public.retained_organisation_commercial_records (
  id uuid primary key default gen_random_uuid(),
  deletion_run_id uuid not null
    references public.organisation_deletion_runs(id) on delete restrict,
  former_organisation_id uuid not null,
  former_organisation_name text not null,
  record_type text not null
    check (record_type in (
      'subscription',
      'invoice',
      'purchase_order',
      'contract',
      'trial',
      'payment_method_masked',
      'licence_snapshot'
    )),
  source_id uuid null,
  snapshot jsonb not null default '{}'::jsonb,
  retained_at timestamptz not null default now(),
  constraint retained_organisation_commercial_snapshot_object
    check (jsonb_typeof(snapshot) = 'object'),
  constraint retained_organisation_commercial_no_coaching_payload
    check (
      not (snapshot ?| array[
        'private_notes',
        'privateNotes',
        'preparation',
        'reflection',
        'extracted_text',
        'extractedText',
        'approved_content',
        'approvedContent',
        'structured_evidence',
        'structuredEvidence',
        'conversation_text',
        'conversationText',
        'session_notes',
        'sessionNotes',
        'coach_insight',
        'coachInsight',
        'identity_summary',
        'identitySummary',
        'intelligence_items',
        'intelligenceItems'
      ])
    )
);

create index if not exists retained_organisation_commercial_former_org_idx
  on public.retained_organisation_commercial_records (former_organisation_id);

create index if not exists retained_organisation_commercial_run_idx
  on public.retained_organisation_commercial_records (deletion_run_id);

comment on table public.retained_organisation_commercial_records is
  'Commercial/financial snapshots retained independently of tenant deletion. '
  'No organisations FK. Must not contain coaching or development payloads. '
  'DL-03 creates the table only — copy execution is a later slice.';

insert into public.platform_settings (key, value, description)
values (
  'undeletable_organisation_ids',
  '{"ids":[]}'::jsonb,
  'Organisation UUIDs that must never be permanently deleted (empty default). Personal organisations and sample installations are also out of scope.'
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. RLS: Platform Owner read; authenticated cannot mutate; no purge RPCs
-- ---------------------------------------------------------------------------
alter table public.organisation_deletion_runs enable row level security;
alter table public.organisation_deletion_certificates enable row level security;
alter table public.retained_organisation_commercial_records enable row level security;

revoke all on table public.organisation_deletion_runs from public;
revoke all on table public.organisation_deletion_certificates from public;
revoke all on table public.retained_organisation_commercial_records from public;

grant select on table public.organisation_deletion_runs to authenticated;
grant select on table public.organisation_deletion_certificates to authenticated;
grant select on table public.retained_organisation_commercial_records to authenticated;

grant select, insert, update on table public.organisation_deletion_runs to service_role;
grant select, insert on table public.organisation_deletion_certificates to service_role;
grant select, insert, update, delete on table public.retained_organisation_commercial_records to service_role;

drop policy if exists "Deletion runs select platform owner"
  on public.organisation_deletion_runs;
create policy "Deletion runs select platform owner"
  on public.organisation_deletion_runs
  for select to authenticated
  using (public.is_platform_owner(auth.uid()));

drop policy if exists "Deletion certificates select platform owner"
  on public.organisation_deletion_certificates;
create policy "Deletion certificates select platform owner"
  on public.organisation_deletion_certificates
  for select to authenticated
  using (public.is_platform_owner(auth.uid()));

drop policy if exists "Retained commercial select platform owner"
  on public.retained_organisation_commercial_records;
create policy "Retained commercial select platform owner"
  on public.retained_organisation_commercial_records
  for select to authenticated
  using (public.is_platform_owner(auth.uid()));

-- Intentionally no INSERT/UPDATE/DELETE policies for authenticated on these tables.
-- Intentionally no organisation purge/delete RPC in this slice.
