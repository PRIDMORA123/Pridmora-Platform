-- Organisation Guidance foundation.
-- Organisation-scoped approved context for Aurelia.
-- Uploading guidance does not make it available to Aurelia:
-- only records explicitly approved may later be retrieved.

-- Controlled rollout: existing organisations remain disabled by default.
alter table public.organisations
  add column if not exists organisation_guidance_enabled boolean not null default false;

-- Extend the existing organisation permission matrix.
-- Organisation Lead is stored technically as "oversight".
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
        or (p_permission = 'members.invite' and m.role in ('owner', 'administrator', 'oversight'))
        or (p_permission = 'members.manage' and m.role in ('owner', 'administrator', 'oversight'))
        or (p_permission = 'members.deactivate' and m.role in ('owner', 'administrator', 'oversight'))
        or (p_permission = 'assignments.manage' and m.role in ('owner', 'administrator', 'oversight'))
        or (p_permission = 'organisation_guidance.manage' and m.role in ('owner', 'administrator', 'oversight'))
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
  'Organisation role permission matrix. Organisation Guidance may be managed by owner, administrator and Organisation Lead (oversight) without granting confidential coaching-content access.';

create table if not exists public.organisation_guidance (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,

  guidance_type text not null
    check (guidance_type in ('policy', 'values', 'manager_guidance')),

  title text not null
    check (char_length(btrim(title)) between 1 and 200),

  version_label text null,
  effective_from date null,
  review_date date null,

  status text not null default 'draft'
    check (status in ('draft', 'approved', 'withdrawn')),

  original_file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  content_hash text not null,
  storage_path text not null,
  extracted_text text null,
  extraction_method text null,
  extraction_version text null,

  uploaded_by uuid not null references auth.users(id),
  approved_by uuid null references auth.users(id),
  approved_at timestamptz null,
  withdrawn_by uuid null references auth.users(id),
  withdrawn_at timestamptz null,

  replaces_guidance_id uuid null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint organisation_guidance_approval_state check (
    (status <> 'approved')
    or (approved_by is not null and approved_at is not null)
  ),

  constraint organisation_guidance_withdrawal_state check (
    (status <> 'withdrawn')
    or (withdrawn_by is not null and withdrawn_at is not null)
  )
);

-- Replacement history must never cross organisation boundaries.
create unique index if not exists organisation_guidance_org_id_id_idx
  on public.organisation_guidance(organisation_id, id);

alter table public.organisation_guidance
  add constraint organisation_guidance_replacement_same_org
  foreign key (organisation_id, replaces_guidance_id)
  references public.organisation_guidance(organisation_id, id);

create index if not exists organisation_guidance_organisation_idx
  on public.organisation_guidance(organisation_id);

create index if not exists organisation_guidance_retrieval_idx
  on public.organisation_guidance(organisation_id, status, guidance_type);

create unique index if not exists organisation_guidance_storage_path_idx
  on public.organisation_guidance(storage_path);

alter table public.organisation_guidance enable row level security;

drop policy if exists organisation_guidance_select on public.organisation_guidance;
create policy organisation_guidance_select
  on public.organisation_guidance
  for select
  to authenticated
  using (
    public.has_organisation_permission(
      organisation_id,
      auth.uid(),
      'organisation_guidance.manage'
    )
    or (
      status = 'approved'
      and public.is_active_organisation_member(organisation_id, auth.uid())
    )
  );

drop policy if exists organisation_guidance_insert on public.organisation_guidance;
create policy organisation_guidance_insert
  on public.organisation_guidance
  for insert
  to authenticated
  with check (
    public.has_organisation_permission(
      organisation_id,
      auth.uid(),
      'organisation_guidance.manage'
    )
    and uploaded_by = auth.uid()
  );

drop policy if exists organisation_guidance_update on public.organisation_guidance;
create policy organisation_guidance_update
  on public.organisation_guidance
  for update
  to authenticated
  using (
    public.has_organisation_permission(
      organisation_id,
      auth.uid(),
      'organisation_guidance.manage'
    )
  )
  with check (
    public.has_organisation_permission(
      organisation_id,
      auth.uid(),
      'organisation_guidance.manage'
    )
  );

drop policy if exists organisation_guidance_delete on public.organisation_guidance;
create policy organisation_guidance_delete
  on public.organisation_guidance
  for delete
  to authenticated
  using (
    public.has_organisation_permission(
      organisation_id,
      auth.uid(),
      'organisation_guidance.manage'
    )
  );

comment on table public.organisation_guidance is
  'Organisation-scoped policies, values and manager guidance. Only explicitly approved records may later be supplied to Aurelia.';

-- ---------------------------------------------------------------------------
-- Private storage for original Organisation Guidance documents.
-- Browser/authenticated clients cannot write directly to this bucket.
-- Application routes must authorise the Organisation Lead and use trusted
-- server-side storage access.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organisation-guidance',
  'organisation-guidance',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Direct authenticated writes are deliberately disabled.
drop policy if exists organisation_guidance_storage_insert on storage.objects;
create policy organisation_guidance_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (false);

drop policy if exists organisation_guidance_storage_update on storage.objects;
create policy organisation_guidance_storage_update
  on storage.objects
  for update
  to authenticated
  using (false)
  with check (false);

-- Original files are not exposed directly to ordinary organisation members.
-- Organisation Guidance management routes will authorise access before using
-- trusted server-side storage access.
drop policy if exists organisation_guidance_storage_select on storage.objects;
create policy organisation_guidance_storage_select
  on storage.objects
  for select
  to authenticated
  using (false);

drop policy if exists organisation_guidance_storage_delete on storage.objects;
create policy organisation_guidance_storage_delete
  on storage.objects
  for delete
  to authenticated
  using (false);
