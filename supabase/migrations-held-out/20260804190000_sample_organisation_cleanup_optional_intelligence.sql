-- Soften Sample Organisation cleanup so Organisation Intelligence tables are
-- optional. Production may receive the installer before Organisation Intelligence.

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
  if to_regclass('public.organisation_intelligence_snapshots') is not null then
    for r in
      select record_id
      from public.sample_organisation_records
      where installation_id = p_installation_id
        and record_type = 'intelligence_snapshot'
    loop
      if to_regclass('public.organisation_intelligence_generation_locks') is not null then
        delete from public.organisation_intelligence_generation_locks
        where organisation_id = v_org_id;
      end if;
      delete from public.organisation_intelligence_snapshots
      where id = r.record_id
        and organisation_id = v_org_id;
      v_deleted := v_deleted + 1;
    end loop;
  end if;

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
    update public.profiles
    set current_organisation_id = v_install.source_organisation_id,
        updated_at = now()
    where id = v_user
      and current_organisation_id = v_org_id;

    delete from public.sample_organisation_records
    where installation_id = p_installation_id;

    if to_regclass('public.organisation_intelligence_generation_locks') is not null then
      delete from public.organisation_intelligence_generation_locks
      where organisation_id = v_org_id;
    end if;

    if to_regclass('public.organisation_intelligence_snapshots') is not null then
      delete from public.organisation_intelligence_snapshots
      where organisation_id = v_org_id;
    end if;

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
