-- Confidential Coaching — optional relationship identity mode.
--
-- Adds identity_mode fields on public.clients and a separate
-- public.client_private_identities table with strict practitioner-only RLS.
-- Existing rows remain identity_mode = 'standard'. No automatic data repair.

-- ---------------------------------------------------------------------------
-- 1. clients identity columns
-- ---------------------------------------------------------------------------
alter table public.clients
  add column if not exists identity_mode text not null default 'standard';

alter table public.clients
  add column if not exists confidential_reference text null;

alter table public.clients
  add column if not exists display_label text null;

alter table public.clients
  add column if not exists ai_name_allowed boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clients_identity_mode_check'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_identity_mode_check
      check (identity_mode in ('standard', 'confidential'));
  end if;
end $$;

-- Confidential reference unique within an organisation (NULLs allowed for standard).
create unique index if not exists clients_org_confidential_reference_uidx
  on public.clients (organisation_id, confidential_reference)
  where confidential_reference is not null
    and organisation_id is not null;

-- Safe backfill: display_label from existing name when unset. Does not change identity_mode.
update public.clients
set display_label = name
where display_label is null
  and name is not null
  and btrim(name) <> '';

comment on column public.clients.identity_mode is
  'standard | confidential — how relationship identity is managed';
comment on column public.clients.confidential_reference is
  'Short non-identifying reference (e.g. C-7K4M2P), unique per organisation';
comment on column public.clients.display_label is
  'Coach-facing public label; never the private real name in confidential mode';
comment on column public.clients.ai_name_allowed is
  'When true in standard mode, AI may use the preferred/display name';

-- ---------------------------------------------------------------------------
-- 2. private identity table
-- ---------------------------------------------------------------------------
create table if not exists public.client_private_identities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  real_name text null,
  email text null,
  phone text null,
  private_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_private_identities_org_idx
  on public.client_private_identities (organisation_id);

create index if not exists client_private_identities_coach_idx
  on public.client_private_identities (coach_id);

-- Case-insensitive private name search helper (authorised practitioners only via RLS).
create index if not exists client_private_identities_real_name_lower_idx
  on public.client_private_identities (organisation_id, lower(real_name))
  where real_name is not null;

comment on table public.client_private_identities is
  'Coach-only private identity for confidential relationships. Never exposed to AI, reports, or org-wide views.';

-- ---------------------------------------------------------------------------
-- 3. RLS — direct practitioner access only (no org admin/oversight by role)
-- ---------------------------------------------------------------------------
alter table public.client_private_identities enable row level security;

-- Deny by default; explicit policies below.
revoke all on public.client_private_identities from anon;
revoke all on public.client_private_identities from authenticated;
grant select, insert, update, delete on public.client_private_identities to authenticated;
grant all on public.client_private_identities to service_role;

drop policy if exists "Private identity select assigned" on public.client_private_identities;
create policy "Private identity select assigned" on public.client_private_identities
  for select to authenticated
  using (
    public.user_can_access_client_content(client_id, auth.uid())
    and public.client_belongs_to_organisation(client_id, organisation_id)
  );

drop policy if exists "Private identity insert assigned" on public.client_private_identities;
create policy "Private identity insert assigned" on public.client_private_identities
  for insert to authenticated
  with check (
    coach_id = auth.uid()
    and public.user_can_access_client_content(client_id, auth.uid())
    and public.client_belongs_to_organisation(client_id, organisation_id)
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organisation_id = organisation_id
    )
  );

drop policy if exists "Private identity update assigned" on public.client_private_identities;
create policy "Private identity update assigned" on public.client_private_identities
  for update to authenticated
  using (
    public.user_can_access_client_content(client_id, auth.uid())
    and public.client_belongs_to_organisation(client_id, organisation_id)
  )
  with check (
    public.user_can_access_client_content(client_id, auth.uid())
    and public.client_belongs_to_organisation(client_id, organisation_id)
  );

drop policy if exists "Private identity delete assigned" on public.client_private_identities;
create policy "Private identity delete assigned" on public.client_private_identities
  for delete to authenticated
  using (
    public.user_can_access_client_content(client_id, auth.uid())
    and public.client_belongs_to_organisation(client_id, organisation_id)
  );

-- ---------------------------------------------------------------------------
-- 4. Atomic relationship create (SECURITY DEFINER RPC)
-- ---------------------------------------------------------------------------
-- Browser must never supply coach_id or confidential_reference.
-- organisation_id is accepted only after membership + relationships.create checks.
-- Client + primary assignment + optional private identity succeed or fail together.
-- search_path is pinned to prevent search_path injection.

create extension if not exists pgcrypto;

create or replace function public.generate_confidential_reference()
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  bytes bytea;
  result text := 'C-';
  i integer;
begin
  bytes := gen_random_bytes(6);
  for i in 0..5 loop
    result := result || substr(
      alphabet,
      (get_byte(bytes, i) % length(alphabet)) + 1,
      1
    );
  end loop;
  return result;
end;
$$;

revoke all on function public.generate_confidential_reference() from public;
grant execute on function public.generate_confidential_reference() to authenticated;
grant execute on function public.generate_confidential_reference() to service_role;

create or replace function public.create_coaching_relationship(
  p_organisation_id uuid,
  p_identity_mode text,
  p_name text,
  p_display_label text,
  p_role text default null,
  p_organisation_label text default null,
  p_email text default null,
  p_current_focus text default null,
  p_ai_name_allowed boolean default false,
  p_initials text default null,
  p_private_real_name text default null,
  p_private_email text default null,
  p_private_phone text default null,
  p_private_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_mode text := lower(btrim(coalesce(p_identity_mode, 'standard')));
  v_client_id uuid := gen_random_uuid();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_display_label text := nullif(btrim(coalesce(p_display_label, '')), '');
  v_role text := nullif(btrim(coalesce(p_role, '')), '');
  v_org_label text := nullif(btrim(coalesce(p_organisation_label, '')), '');
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_focus text := nullif(btrim(coalesce(p_current_focus, '')), '');
  v_initials text := nullif(btrim(coalesce(p_initials, '')), '');
  v_ref text := null;
  v_ai_name_allowed boolean := coalesce(p_ai_name_allowed, false);
  v_private_real_name text := nullif(btrim(coalesce(p_private_real_name, '')), '');
  v_private_email text := nullif(btrim(coalesce(p_private_email, '')), '');
  v_private_phone text := nullif(btrim(coalesce(p_private_phone, '')), '');
  v_private_notes text := nullif(btrim(coalesce(p_private_notes, '')), '');
  v_has_private boolean := false;
  v_attempt integer := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  end if;

  if p_organisation_id is null then
    return jsonb_build_object('ok', false, 'code', 'ORGANISATION_REQUIRED');
  end if;

  if not public.has_organisation_permission(
    p_organisation_id,
    v_uid,
    'relationships.create'
  ) then
    return jsonb_build_object('ok', false, 'code', 'PERMISSION_DENIED');
  end if;

  if v_mode not in ('standard', 'confidential') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_IDENTITY_MODE');
  end if;

  if v_mode = 'standard' then
    if v_name is null then
      return jsonb_build_object('ok', false, 'code', 'NAME_REQUIRED');
    end if;
    v_display_label := coalesce(v_display_label, v_name);
  else
    -- Confidential: real name never stored on clients.name.
    if v_display_label is null and v_role is null then
      return jsonb_build_object('ok', false, 'code', 'DISPLAY_OR_ROLE_REQUIRED');
    end if;

    -- Generate non-sequential reference server-side; retry on rare collisions.
    loop
      v_attempt := v_attempt + 1;
      v_ref := public.generate_confidential_reference();
      exit when not exists (
        select 1
        from public.clients c
        where c.organisation_id = p_organisation_id
          and c.confidential_reference = v_ref
      );
      if v_attempt >= 8 then
        return jsonb_build_object('ok', false, 'code', 'REFERENCE_GENERATION_FAILED');
      end if;
    end loop;

    v_display_label := coalesce(v_display_label, v_role, 'Confidential relationship');
    v_name := v_display_label;
    if v_display_label = 'Confidential relationship' then
      v_name := v_ref;
    end if;
    v_email := null;
    v_ai_name_allowed := false;
  end if;

  if v_initials is null then
    v_initials := upper(left(coalesce(v_name, 'CR'), 2));
  end if;

  v_has_private :=
    v_private_real_name is not null
    or v_private_email is not null
    or v_private_phone is not null
    or v_private_notes is not null;

  insert into public.clients (
    id,
    coach_id,
    organisation_id,
    name,
    organisation,
    role,
    email,
    status,
    next_session_label,
    current_focus,
    identity_summary,
    coach_insight,
    initials,
    identity_mode,
    confidential_reference,
    display_label,
    ai_name_allowed
  ) values (
    v_client_id,
    v_uid,
    p_organisation_id,
    v_name,
    v_org_label,
    v_role,
    v_email,
    'Active',
    'Not scheduled',
    coalesce(v_focus, ''),
    '',
    '',
    v_initials,
    v_mode,
    v_ref,
    v_display_label,
    v_ai_name_allowed
  );

  insert into public.relationship_assignments (
    organisation_id,
    client_id,
    user_id,
    assignment_role,
    status,
    assigned_by,
    assigned_at
  ) values (
    p_organisation_id,
    v_client_id,
    v_uid,
    'primary',
    'active',
    v_uid,
    now()
  );

  if v_has_private then
    insert into public.client_private_identities (
      client_id,
      organisation_id,
      coach_id,
      real_name,
      email,
      phone,
      private_notes
    ) values (
      v_client_id,
      p_organisation_id,
      v_uid,
      v_private_real_name,
      v_private_email,
      v_private_phone,
      v_private_notes
    );

    insert into public.organisation_audit_log (
      organisation_id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      metadata
    ) values (
      p_organisation_id,
      v_uid,
      'private_identity_created',
      'client_private_identity',
      v_client_id,
      jsonb_build_object(
        'clientId', v_client_id,
        'hasRealName', v_private_real_name is not null,
        'hasEmail', v_private_email is not null,
        'hasPhone', v_private_phone is not null,
        'hasNotes', v_private_notes is not null
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'clientId', v_client_id,
    'organisationId', p_organisation_id,
    'identityMode', v_mode,
    'name', v_name,
    'displayLabel', v_display_label,
    'confidentialReference', v_ref,
    'aiNameAllowed', v_ai_name_allowed,
    'role', v_role,
    'organisation', v_org_label,
    'email', v_email,
    'currentFocus', coalesce(v_focus, ''),
    'initials', v_initials,
    'privateIdentityCreated', v_has_private
  );
exception
  when others then
    -- Entire function rolls back; never leave a partial confidential relationship.
    return jsonb_build_object(
      'ok', false,
      'code', 'CREATE_FAILED',
      'message', SQLERRM
    );
end;
$$;

revoke all on function public.create_coaching_relationship(
  uuid, text, text, text, text, text, text, text, boolean, text, text, text, text, text
) from public;
grant execute on function public.create_coaching_relationship(
  uuid, text, text, text, text, text, text, text, boolean, text, text, text, text, text
) to authenticated;
grant execute on function public.create_coaching_relationship(
  uuid, text, text, text, text, text, text, text, boolean, text, text, text, text, text
) to service_role;

comment on function public.create_coaching_relationship is
  'Atomically create client + primary assignment + optional private identity. coach_id and confidential_reference are never accepted from the browser.';
