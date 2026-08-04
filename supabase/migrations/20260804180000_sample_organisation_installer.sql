-- Sample Organisation Installer
-- Additive only. Does not rewrite existing customer data.
-- Creates tracking tables, mapping table, permission extension and
-- SECURITY DEFINER helpers for safe sample organisation create/cleanup.
--
-- Product model: Northbridge Healthcare Trust is installed as a separate
-- fictional organisation owned by the installing user. The caller's current
-- organisation is never modified.

-- ---------------------------------------------------------------------------
-- 1. Permission: sample_organisation.manage (owner / administrator only)
-- ---------------------------------------------------------------------------
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
        or (p_permission = 'intelligence.organisation.read' and m.role in ('owner', 'administrator', 'oversight'))
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
        or (p_permission = 'sample_organisation.manage' and m.role in ('owner', 'administrator'))
      )
  );
$$;

revoke all on function public.has_organisation_permission(uuid, uuid, text) from public;
grant execute on function public.has_organisation_permission(uuid, uuid, text) to authenticated;
grant execute on function public.has_organisation_permission(uuid, uuid, text) to service_role;

comment on function public.has_organisation_permission(uuid, uuid, text) is
  'Organisation role permission matrix. sample_organisation.manage is owner/administrator only and never grants coaching content or private identity.';

-- ---------------------------------------------------------------------------
-- 2. Installation tracking
-- ---------------------------------------------------------------------------
create table if not exists public.sample_organisation_installations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  source_organisation_id uuid null references public.organisations(id) on delete set null,
  pack_key text not null,
  pack_version text not null,
  status text not null
    check (status in (
      'installing',
      'ready',
      'failed',
      'resetting',
      'removing',
      'removed',
      'intelligence_pending'
    )),
  stage text not null default 'validating'
    check (stage in (
      'validating',
      'creating_organisation',
      'creating_relationships',
      'creating_assignments',
      'creating_conversations',
      'creating_actions',
      'creating_development_updates',
      'creating_intelligence',
      'generating_organisation_intelligence',
      'completing_checks',
      'ready',
      'failed',
      'removed'
    )),
  installed_by uuid not null references auth.users(id),
  installed_at timestamptz null,
  updated_at timestamptz not null default now(),
  relationship_count integer not null default 0 check (relationship_count >= 0),
  session_count integer not null default 0 check (session_count >= 0),
  action_count integer not null default 0 check (action_count >= 0),
  development_update_count integer not null default 0 check (development_update_count >= 0),
  intelligence_item_count integer not null default 0 check (intelligence_item_count >= 0),
  error_summary text null,
  failure_category text null,
  idempotency_key text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint sample_organisation_installations_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.sample_organisation_installations is
  'Tracks Sample Organisation pack installations. Metadata must never store notes, identity values or secrets.';

comment on column public.sample_organisation_installations.organisation_id is
  'The sample organisation created by the installer (not the caller''s source organisation).';

comment on column public.sample_organisation_installations.source_organisation_id is
  'Organisation context from which install was requested. Used to return the user after removal.';

create index if not exists sample_organisation_installations_org_idx
  on public.sample_organisation_installations (organisation_id);

create index if not exists sample_organisation_installations_pack_idx
  on public.sample_organisation_installations (pack_key, status);

create index if not exists sample_organisation_installations_installed_by_idx
  on public.sample_organisation_installations (installed_by, pack_key);

-- One active installation per installer + pack (blocks duplicates / concurrent installs).
create unique index if not exists sample_organisation_installations_active_pack_uidx
  on public.sample_organisation_installations (installed_by, pack_key)
  where status in ('installing', 'ready', 'resetting', 'removing', 'intelligence_pending');

-- Idempotency: same key returns the same installation while active.
create unique index if not exists sample_organisation_installations_idempotency_uidx
  on public.sample_organisation_installations (installed_by, pack_key, idempotency_key)
  where idempotency_key is not null
    and status in ('installing', 'ready', 'resetting', 'removing', 'intelligence_pending');

-- ---------------------------------------------------------------------------
-- 3. Record mapping for safe cleanup (never delete by name/email/date pattern)
-- ---------------------------------------------------------------------------
create table if not exists public.sample_organisation_records (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null
    references public.sample_organisation_installations(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  record_type text not null
    check (record_type in (
      'organisation',
      'membership',
      'relationship',
      'assignment',
      'session',
      'action',
      'development_profile',
      'development_update',
      'intelligence_item',
      'intelligence_snapshot',
      'private_identity'
    )),
  record_id uuid not null,
  pack_entity_key text null,
  created_at timestamptz not null default now(),
  unique (installation_id, record_type, record_id)
);

create index if not exists sample_organisation_records_installation_idx
  on public.sample_organisation_records (installation_id, record_type);

create index if not exists sample_organisation_records_org_idx
  on public.sample_organisation_records (organisation_id);

comment on table public.sample_organisation_records is
  'Maps installer-created records for reset/remove. Deletion must use this mapping only.';

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
alter table public.sample_organisation_installations enable row level security;
alter table public.sample_organisation_records enable row level security;

revoke all on public.sample_organisation_installations from anon;
revoke all on public.sample_organisation_installations from authenticated;
revoke all on public.sample_organisation_records from anon;
revoke all on public.sample_organisation_records from authenticated;

grant select, insert, update on public.sample_organisation_installations to authenticated;
grant select, insert, delete on public.sample_organisation_records to authenticated;
grant all on public.sample_organisation_installations to service_role;
grant all on public.sample_organisation_records to service_role;

drop policy if exists "Sample installations select manage"
  on public.sample_organisation_installations;
create policy "Sample installations select manage"
  on public.sample_organisation_installations
  for select to authenticated
  using (
    installed_by = auth.uid()
    or public.has_organisation_permission(
      organisation_id, auth.uid(), 'sample_organisation.manage'
    )
    or (
      source_organisation_id is not null
      and public.has_organisation_permission(
        source_organisation_id, auth.uid(), 'sample_organisation.manage'
      )
    )
  );

drop policy if exists "Sample installations insert manage"
  on public.sample_organisation_installations;
create policy "Sample installations insert manage"
  on public.sample_organisation_installations
  for insert to authenticated
  with check (
    installed_by = auth.uid()
    and (
      public.has_organisation_permission(
        organisation_id, auth.uid(), 'sample_organisation.manage'
      )
      or (
        source_organisation_id is not null
        and public.has_organisation_permission(
          source_organisation_id, auth.uid(), 'sample_organisation.manage'
        )
      )
    )
  );

drop policy if exists "Sample installations update manage"
  on public.sample_organisation_installations;
create policy "Sample installations update manage"
  on public.sample_organisation_installations
  for update to authenticated
  using (
    installed_by = auth.uid()
    or public.has_organisation_permission(
      organisation_id, auth.uid(), 'sample_organisation.manage'
    )
    or (
      source_organisation_id is not null
      and public.has_organisation_permission(
        source_organisation_id, auth.uid(), 'sample_organisation.manage'
      )
    )
  )
  with check (
    installed_by = auth.uid()
    or public.has_organisation_permission(
      organisation_id, auth.uid(), 'sample_organisation.manage'
    )
    or (
      source_organisation_id is not null
      and public.has_organisation_permission(
        source_organisation_id, auth.uid(), 'sample_organisation.manage'
      )
    )
  );

drop policy if exists "Sample records select manage"
  on public.sample_organisation_records;
create policy "Sample records select manage"
  on public.sample_organisation_records
  for select to authenticated
  using (
    exists (
      select 1
      from public.sample_organisation_installations i
      where i.id = installation_id
        and (
          i.installed_by = auth.uid()
          or public.has_organisation_permission(
            i.organisation_id, auth.uid(), 'sample_organisation.manage'
          )
          or (
            i.source_organisation_id is not null
            and public.has_organisation_permission(
              i.source_organisation_id, auth.uid(), 'sample_organisation.manage'
            )
          )
        )
    )
  );

drop policy if exists "Sample records insert manage"
  on public.sample_organisation_records;
create policy "Sample records insert manage"
  on public.sample_organisation_records
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.sample_organisation_installations i
      where i.id = installation_id
        and i.organisation_id = organisation_id
        and (
          i.installed_by = auth.uid()
          or public.has_organisation_permission(
            i.organisation_id, auth.uid(), 'sample_organisation.manage'
          )
        )
    )
  );

drop policy if exists "Sample records delete manage"
  on public.sample_organisation_records;
create policy "Sample records delete manage"
  on public.sample_organisation_records
  for delete to authenticated
  using (
    exists (
      select 1
      from public.sample_organisation_installations i
      where i.id = installation_id
        and (
          i.installed_by = auth.uid()
          or public.has_organisation_permission(
            i.organisation_id, auth.uid(), 'sample_organisation.manage'
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Begin installation: create sample org + membership + installation row
-- ---------------------------------------------------------------------------
create or replace function public.begin_sample_organisation_installation(
  p_source_organisation_id uuid,
  p_pack_key text,
  p_pack_version text,
  p_organisation_name text,
  p_organisation_type text default 'public_sector',
  p_slug text default null,
  p_idempotency_key text default null,
  p_seats_purchased integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_existing public.sample_organisation_installations%rowtype;
  v_org_id uuid;
  v_membership_id uuid;
  v_installation_id uuid;
  v_slug text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  end if;

  if p_source_organisation_id is null or nullif(trim(p_pack_key), '') is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  end if;

  if not public.has_organisation_permission(
    p_source_organisation_id, v_user, 'sample_organisation.manage'
  ) then
    return jsonb_build_object('ok', false, 'code', 'PERMISSION_DENIED');
  end if;

  -- Idempotency / duplicate active install
  if p_idempotency_key is not null then
    select * into v_existing
    from public.sample_organisation_installations
    where installed_by = v_user
      and pack_key = p_pack_key
      and idempotency_key = p_idempotency_key
      and status in ('installing', 'ready', 'resetting', 'removing', 'intelligence_pending')
    limit 1;

    if found then
      return jsonb_build_object(
        'ok', true,
        'resumed', true,
        'installationId', v_existing.id,
        'organisationId', v_existing.organisation_id,
        'status', v_existing.status,
        'stage', v_existing.stage
      );
    end if;
  end if;

  select * into v_existing
  from public.sample_organisation_installations
  where installed_by = v_user
    and pack_key = p_pack_key
    and status in ('installing', 'ready', 'resetting', 'removing', 'intelligence_pending')
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'resumed', true,
      'installationId', v_existing.id,
      'organisationId', v_existing.organisation_id,
      'status', v_existing.status,
      'stage', v_existing.stage,
      'code', case
        when v_existing.status = 'ready' then 'ALREADY_INSTALLED'
        else 'IN_PROGRESS'
      end
    );
  end if;

  v_slug := coalesce(
    nullif(trim(p_slug), ''),
    'sample-' || replace(p_pack_key, '_', '-') || '-' || substr(replace(v_user::text, '-', ''), 1, 12)
  );

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
    licence_plan_name,
    practitioner_seats_purchased,
    licence_status
  )
  values (
    nullif(trim(p_organisation_name), ''),
    v_slug,
    coalesce(nullif(trim(p_organisation_type), ''), 'public_sector'),
    'active',
    v_user,
    'guided',
    true,
    'standard',
    'none',
    'Sample',
    greatest(coalesce(p_seats_purchased, 5), 1),
    'active'
  )
  returning id into v_org_id;

  insert into public.organisation_memberships (
    organisation_id,
    user_id,
    role,
    professional_role,
    status,
    joined_at,
    last_active_at
  )
  values (
    v_org_id,
    v_user,
    'owner',
    'coach',
    'active',
    now(),
    now()
  )
  returning id into v_membership_id;

  insert into public.sample_organisation_installations (
    organisation_id,
    source_organisation_id,
    pack_key,
    pack_version,
    status,
    stage,
    installed_by,
    idempotency_key,
    metadata
  )
  values (
    v_org_id,
    p_source_organisation_id,
    p_pack_key,
    p_pack_version,
    'installing',
    'creating_organisation',
    v_user,
    nullif(trim(p_idempotency_key), ''),
    jsonb_build_object(
      'packKey', p_pack_key,
      'packVersion', p_pack_version
    )
  )
  returning id into v_installation_id;

  insert into public.sample_organisation_records (
    installation_id, organisation_id, record_type, record_id, pack_entity_key
  ) values
    (v_installation_id, v_org_id, 'organisation', v_org_id, p_pack_key),
    (v_installation_id, v_org_id, 'membership', v_membership_id, 'owner');

  return jsonb_build_object(
    'ok', true,
    'resumed', false,
    'installationId', v_installation_id,
    'organisationId', v_org_id,
    'membershipId', v_membership_id,
    'status', 'installing',
    'stage', 'creating_organisation'
  );
exception
  when unique_violation then
    select * into v_existing
    from public.sample_organisation_installations
    where installed_by = v_user
      and pack_key = p_pack_key
      and status in ('installing', 'ready', 'resetting', 'removing', 'intelligence_pending')
    order by created_at desc
    limit 1;

    if found then
      return jsonb_build_object(
        'ok', true,
        'resumed', true,
        'installationId', v_existing.id,
        'organisationId', v_existing.organisation_id,
        'status', v_existing.status,
        'stage', v_existing.stage,
        'code', 'CONCURRENT_BLOCKED'
      );
    end if;

    return jsonb_build_object('ok', false, 'code', 'CONCURRENT_BLOCKED');
end;
$$;

revoke all on function public.begin_sample_organisation_installation(
  uuid, text, text, text, text, text, text, integer
) from public;
grant execute on function public.begin_sample_organisation_installation(
  uuid, text, text, text, text, text, text, integer
) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Map a created record
-- ---------------------------------------------------------------------------
create or replace function public.map_sample_organisation_record(
  p_installation_id uuid,
  p_record_type text,
  p_record_id uuid,
  p_pack_entity_key text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org_id uuid;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select organisation_id into v_org_id
  from public.sample_organisation_installations
  where id = p_installation_id
    and (
      installed_by = v_user
      or public.has_organisation_permission(
        organisation_id, v_user, 'sample_organisation.manage'
      )
    );

  if v_org_id is null then
    raise exception 'Installation not found';
  end if;

  insert into public.sample_organisation_records (
    installation_id, organisation_id, record_type, record_id, pack_entity_key
  )
  values (
    p_installation_id, v_org_id, p_record_type, p_record_id, p_pack_entity_key
  )
  on conflict (installation_id, record_type, record_id) do nothing;
end;
$$;

revoke all on function public.map_sample_organisation_record(uuid, text, uuid, text) from public;
grant execute on function public.map_sample_organisation_record(uuid, text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Cleanup mapped sample records (reset/remove/rollback)
-- Deletes only records listed in sample_organisation_records.
-- Order respects foreign keys. Never deletes by name/email/date pattern.
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_sample_organisation_installation(
  p_installation_id uuid,
  p_delete_organisation boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_install public.sample_organisation_installations%rowtype;
  v_org_id uuid;
  v_deleted integer := 0;
  r record;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  end if;

  select * into v_install
  from public.sample_organisation_installations
  where id = p_installation_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if not (
    v_install.installed_by = v_user
    or public.has_organisation_permission(
      v_install.organisation_id, v_user, 'sample_organisation.manage'
    )
    or (
      v_install.source_organisation_id is not null
      and public.has_organisation_permission(
        v_install.source_organisation_id, v_user, 'sample_organisation.manage'
      )
    )
  ) then
    return jsonb_build_object('ok', false, 'code', 'PERMISSION_DENIED');
  end if;

  v_org_id := v_install.organisation_id;

  -- Snapshots first (metrics/themes cascade from snapshot)
  for r in
    select record_id
    from public.sample_organisation_records
    where installation_id = p_installation_id
      and record_type = 'intelligence_snapshot'
  loop
    delete from public.organisation_intelligence_generation_locks
    where organisation_id = v_org_id;
    delete from public.organisation_intelligence_snapshots
    where id = r.record_id
      and organisation_id = v_org_id;
    v_deleted := v_deleted + 1;
  end loop;

  -- Intelligence items (evidence cascades)
  for r in
    select record_id
    from public.sample_organisation_records
    where installation_id = p_installation_id
      and record_type = 'intelligence_item'
  loop
    delete from public.intelligence_items
    where id = r.record_id
      and client_id in (
        select c.id from public.clients c where c.organisation_id = v_org_id
      );
    v_deleted := v_deleted + 1;
  end loop;

  -- Development updates
  for r in
    select record_id
    from public.sample_organisation_records
    where installation_id = p_installation_id
      and record_type = 'development_update'
  loop
    delete from public.development_updates
    where id = r.record_id
      and client_id in (
        select c.id from public.clients c where c.organisation_id = v_org_id
      );
    v_deleted := v_deleted + 1;
  end loop;

  -- Development profiles
  for r in
    select record_id
    from public.sample_organisation_records
    where installation_id = p_installation_id
      and record_type = 'development_profile'
  loop
    delete from public.development_profiles
    where id = r.record_id
      and client_id in (
        select c.id from public.clients c where c.organisation_id = v_org_id
      );
    v_deleted := v_deleted + 1;
  end loop;

  -- Actions
  for r in
    select record_id
    from public.sample_organisation_records
    where installation_id = p_installation_id
      and record_type = 'action'
  loop
    delete from public.client_items
    where id = r.record_id
      and client_id in (
        select c.id from public.clients c where c.organisation_id = v_org_id
      );
    v_deleted := v_deleted + 1;
  end loop;

  -- Sessions
  for r in
    select record_id
    from public.sample_organisation_records
    where installation_id = p_installation_id
      and record_type = 'session'
  loop
    delete from public.sessions
    where id = r.record_id
      and organisation_id = v_org_id;
    v_deleted := v_deleted + 1;
  end loop;

  -- Private identities (also cascade from client delete)
  for r in
    select record_id
    from public.sample_organisation_records
    where installation_id = p_installation_id
      and record_type = 'private_identity'
  loop
    delete from public.client_private_identities
    where id = r.record_id
      and organisation_id = v_org_id;
    v_deleted := v_deleted + 1;
  end loop;

  -- Assignments
  for r in
    select record_id
    from public.sample_organisation_records
    where installation_id = p_installation_id
      and record_type = 'assignment'
  loop
    delete from public.relationship_assignments
    where id = r.record_id
      and organisation_id = v_org_id;
    v_deleted := v_deleted + 1;
  end loop;

  -- Relationships (clients) — cascades remaining child rows
  for r in
    select record_id
    from public.sample_organisation_records
    where installation_id = p_installation_id
      and record_type = 'relationship'
  loop
    delete from public.clients
    where id = r.record_id
      and organisation_id = v_org_id;
    v_deleted := v_deleted + 1;
  end loop;

  -- Clear non-container mappings after content removal
  delete from public.sample_organisation_records
  where installation_id = p_installation_id
    and record_type not in ('organisation', 'membership');

  if p_delete_organisation then
    -- Clear preference if pointing at sample org
    update public.profiles
    set current_organisation_id = v_install.source_organisation_id,
        updated_at = now()
    where id = v_user
      and current_organisation_id = v_org_id;

    delete from public.sample_organisation_records
    where installation_id = p_installation_id;

    delete from public.organisation_intelligence_generation_locks
    where organisation_id = v_org_id;

    delete from public.organisation_intelligence_snapshots
    where organisation_id = v_org_id;

    delete from public.clients
    where organisation_id = v_org_id;

    delete from public.organisations
    where id = v_org_id
      and created_by = v_install.installed_by;

    update public.sample_organisation_installations
    set status = 'removed',
        stage = 'removed',
        updated_at = now(),
        error_summary = null
    where id = p_installation_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'deletedMappedOperations', v_deleted,
    'organisationDeleted', p_delete_organisation
  );
end;
$$;

revoke all on function public.cleanup_sample_organisation_installation(uuid, boolean) from public;
grant execute on function public.cleanup_sample_organisation_installation(uuid, boolean) to authenticated;

comment on function public.cleanup_sample_organisation_installation(uuid, boolean) is
  'Removes only installer-mapped sample records. Never matches by name, email or date pattern.';
