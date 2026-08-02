-- ID-020: Archive, restore, and permanently delete clients.
-- Soft-archive via archived_at / archived_by; hard delete is atomic via CASCADE + RPC.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.clients
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

comment on column public.clients.archived_at is
  'When set, the client is archived (soft). Coaching records are retained.';
comment on column public.clients.archived_by is
  'auth.users id of the coach who archived the client.';

-- Keep status in sync for existing rows that may already use status = Archived.
update public.clients
set status = 'Archived'
where archived_at is not null
  and status is distinct from 'Archived';

create index if not exists clients_coach_id_archived_at_idx
  on public.clients (coach_id, archived_at);

-- ---------------------------------------------------------------------------
-- Helpers: ownership + active (non-archived) checks
-- ---------------------------------------------------------------------------
create or replace function public.client_belongs_to_coach(p_client_id uuid, p_coach_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.clients c
    where c.id = p_client_id and c.coach_id = p_coach_id
  );
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
      and c.coach_id = p_coach_id
      and c.archived_at is null
  );
$$;

revoke all on function public.client_belongs_to_coach(uuid, uuid) from public;
grant execute on function public.client_belongs_to_coach(uuid, uuid) to authenticated;

revoke all on function public.client_is_active_for_coach(uuid, uuid) from public;
grant execute on function public.client_is_active_for_coach(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Archive / restore (security definer; ownership from auth.uid())
-- ---------------------------------------------------------------------------
create or replace function public.archive_client(p_client_id uuid)
returns public.clients
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := auth.uid();
  v_row public.clients;
begin
  if v_coach_id is null then
    raise exception 'Authentication required.';
  end if;

  update public.clients
  set
    archived_at = coalesce(archived_at, now()),
    archived_by = coalesce(archived_by, v_coach_id),
    status = 'Archived',
    updated_at = now()
  where id = p_client_id
    and coach_id = v_coach_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'not found';
  end if;

  return v_row;
end;
$$;

create or replace function public.restore_client(p_client_id uuid)
returns public.clients
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := auth.uid();
  v_row public.clients;
begin
  if v_coach_id is null then
    raise exception 'Authentication required.';
  end if;

  update public.clients
  set
    archived_at = null,
    archived_by = null,
    status = 'Active',
    updated_at = now()
  where id = p_client_id
    and coach_id = v_coach_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'not found';
  end if;

  return v_row;
end;
$$;

-- Atomic permanent deletion. Explicitly removes dependents, then the client.
-- Only deletes rows owned by auth.uid(); never touches another coach's data.
create or replace function public.permanently_delete_client(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := auth.uid();
  v_deleted integer;
begin
  if v_coach_id is null then
    raise exception 'Authentication required.';
  end if;

  if to_regclass('public.coaching_reports') is not null then
    delete from public.coaching_reports
    where client_id = p_client_id
      and coach_id = v_coach_id;
  end if;

  if to_regclass('public.sessions') is not null then
    delete from public.sessions
    where client_id = p_client_id
      and coach_id = v_coach_id;
  end if;

  if to_regclass('public.client_items') is not null then
    delete from public.client_items
    where client_id = p_client_id
      and coach_id = v_coach_id;
  end if;

  delete from public.clients
  where id = p_client_id
    and coach_id = v_coach_id;

  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'not found';
  end if;
end;
$$;

revoke all on function public.archive_client(uuid) from public;
grant execute on function public.archive_client(uuid) to authenticated;

revoke all on function public.restore_client(uuid) from public;
grant execute on function public.restore_client(uuid) to authenticated;

revoke all on function public.permanently_delete_client(uuid) from public;
grant execute on function public.permanently_delete_client(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: block new coaching activity on archived clients
-- SELECT / DELETE of own rows remain allowed (read-only workspace + cleanup).
-- ---------------------------------------------------------------------------
drop policy if exists "Sessions insert own" on public.sessions;
create policy "Sessions insert own" on public.sessions
  for insert to authenticated
  with check (
    coach_id = auth.uid()
    and public.client_is_active_for_coach(client_id, coach_id)
  );

drop policy if exists "Sessions update own" on public.sessions;
create policy "Sessions update own" on public.sessions
  for update to authenticated
  using (coach_id = auth.uid())
  with check (
    coach_id = auth.uid()
    and public.client_is_active_for_coach(client_id, coach_id)
  );

drop policy if exists "Client items insert own" on public.client_items;
create policy "Client items insert own" on public.client_items
  for insert to authenticated
  with check (
    coach_id = auth.uid()
    and public.client_is_active_for_coach(client_id, coach_id)
  );

drop policy if exists "Client items update own" on public.client_items;
create policy "Client items update own" on public.client_items
  for update to authenticated
  using (coach_id = auth.uid())
  with check (
    coach_id = auth.uid()
    and public.client_is_active_for_coach(client_id, coach_id)
  );

-- coaching_reports is optional until 20260724190000 creates it if missing.
do $$
begin
  if to_regclass('public.coaching_reports') is null then
    return;
  end if;

  execute 'drop policy if exists "Coaching reports insert own" on public.coaching_reports';
  execute $policy$
    create policy "Coaching reports insert own" on public.coaching_reports
      for insert to authenticated
      with check (
        coach_id = auth.uid()
        and public.client_is_active_for_coach(client_id, coach_id)
      )
  $policy$;

  execute 'drop policy if exists "Coaching reports update own" on public.coaching_reports';
  execute $policy$
    create policy "Coaching reports update own" on public.coaching_reports
      for update to authenticated
      using (coach_id = auth.uid())
      with check (
        coach_id = auth.uid()
        and public.client_is_active_for_coach(client_id, coach_id)
      )
  $policy$;
end $$;

-- Clients UPDATE / DELETE policies already require coach_id = auth.uid().
-- No change needed for archive/restore/delete ownership.
