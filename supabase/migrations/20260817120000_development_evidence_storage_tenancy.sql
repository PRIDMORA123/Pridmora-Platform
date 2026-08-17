-- SEC-1: Development Evidence storage tenancy hardening.
-- Replace bucket-wide authenticated policies with path-scoped access that
-- requires user_can_access_client_content for the client_id embedded in the path.
-- Path format: {organisation_id|personal}/{client_id}/{object_name}

create or replace function public.user_can_access_development_evidence_object(
  object_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_parts text[];
  v_org_segment text;
  v_client_raw text;
  v_client_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  if object_name is null or btrim(object_name) = '' then
    return false;
  end if;

  -- Reject traversal / absolute paths.
  if position('..' in object_name) > 0
     or position('\\' in object_name) > 0
     or left(object_name, 1) = '/' then
    return false;
  end if;

  v_parts := string_to_array(object_name, '/');
  if array_length(v_parts, 1) is distinct from 3 then
    return false;
  end if;

  v_org_segment := nullif(btrim(v_parts[1]), '');
  v_client_raw := nullif(btrim(v_parts[2]), '');
  if v_org_segment is null or v_client_raw is null or nullif(btrim(v_parts[3]), '') is null then
    return false;
  end if;

  begin
    v_client_id := v_client_raw::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  if not public.user_can_access_client_content(v_client_id, auth.uid()) then
    return false;
  end if;

  if v_org_segment = 'personal' then
    return exists (
      select 1
      from public.clients c
      where c.id = v_client_id
        and c.organisation_id is null
    );
  end if;

  begin
    return public.client_belongs_to_organisation(
      v_client_id,
      v_org_segment::uuid
    );
  exception
    when invalid_text_representation then
      return false;
  end;
end;
$$;

revoke all on function public.user_can_access_development_evidence_object(text)
  from public;
grant execute on function public.user_can_access_development_evidence_object(text)
  to authenticated;

comment on function public.user_can_access_development_evidence_object(text) is
  'SEC-1: True when the authenticated user may access a development-evidence storage object whose path embeds an authorised client_id (and matching organisation segment).';

-- Replace permissive bucket-wide policies.
drop policy if exists development_evidence_storage_select on storage.objects;
create policy development_evidence_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'development-evidence'
    and public.user_can_access_development_evidence_object(name)
  );

drop policy if exists development_evidence_storage_insert on storage.objects;
create policy development_evidence_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'development-evidence'
    and public.user_can_access_development_evidence_object(name)
  );

drop policy if exists development_evidence_storage_update on storage.objects;
create policy development_evidence_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'development-evidence'
    and public.user_can_access_development_evidence_object(name)
  )
  with check (
    bucket_id = 'development-evidence'
    and public.user_can_access_development_evidence_object(name)
  );

drop policy if exists development_evidence_storage_delete on storage.objects;
create policy development_evidence_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'development-evidence'
    and public.user_can_access_development_evidence_object(name)
  );
