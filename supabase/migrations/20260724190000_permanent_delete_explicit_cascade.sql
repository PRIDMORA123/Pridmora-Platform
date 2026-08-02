-- ID-020 follow-up: make permanent delete reliable without depending on
-- PostgREST RPC visibility alone. Explicitly remove dependents, then the client.
-- Safe to re-run.

alter table public.clients
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

-- Ensure FK cascades exist for known child tables (idempotent where supported).
-- sessions
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'sessions'
  ) then
    begin
      alter table public.sessions
        drop constraint if exists sessions_client_id_fkey;
    exception when undefined_object then
      null;
    end;
    alter table public.sessions
      add constraint sessions_client_id_fkey
      foreign key (client_id) references public.clients(id) on delete cascade;
  end if;
end $$;

-- client_items
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'client_items'
  ) then
    begin
      alter table public.client_items
        drop constraint if exists client_items_client_id_fkey;
    exception when undefined_object then
      null;
    end;
    alter table public.client_items
      add constraint client_items_client_id_fkey
      foreign key (client_id) references public.clients(id) on delete cascade;
  end if;
end $$;

-- coaching_reports (create if missing, then enforce cascade)
create table if not exists public.coaching_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  report_type text not null check (report_type in ('progress', 'final')),
  selected_session_ids uuid[] not null default '{}',
  approved_content jsonb not null,
  approval_status text not null default 'approved' check (approval_status in ('draft', 'approved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

  -- Explicit child cleanup (works even when CASCADE was never applied).
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

revoke all on function public.permanently_delete_client(uuid) from public;
grant execute on function public.permanently_delete_client(uuid) to authenticated;

revoke all on function public.archive_client(uuid) from public;
grant execute on function public.archive_client(uuid) to authenticated;

revoke all on function public.restore_client(uuid) from public;
grant execute on function public.restore_client(uuid) to authenticated;

-- Reload PostgREST schema cache so RPCs become visible immediately.
notify pgrst, 'reload schema';
