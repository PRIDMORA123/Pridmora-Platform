-- Strengthen RLS so relationship-owned tables require both coach ownership
-- and a matching coaching relationship (clients row).

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

revoke all on function public.client_belongs_to_coach(uuid, uuid) from public;
grant execute on function public.client_belongs_to_coach(uuid, uuid) to authenticated;

-- Sessions (conversations): coach_id + relationship ownership
drop policy if exists "Sessions select own" on public.sessions;
create policy "Sessions select own" on public.sessions
  for select to authenticated
  using (
    coach_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );

drop policy if exists "Sessions insert own" on public.sessions;
create policy "Sessions insert own" on public.sessions
  for insert to authenticated
  with check (
    coach_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
    and public.client_is_active_for_coach(client_id, coach_id)
  );

drop policy if exists "Sessions update own" on public.sessions;
create policy "Sessions update own" on public.sessions
  for update to authenticated
  using (
    coach_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  )
  with check (
    coach_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
    and public.client_is_active_for_coach(client_id, coach_id)
  );

drop policy if exists "Sessions delete own" on public.sessions;
create policy "Sessions delete own" on public.sessions
  for delete to authenticated
  using (
    coach_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );

-- Development profiles
do $$
begin
  if to_regclass('public.development_profiles') is not null then
    drop policy if exists "Development profiles select own" on public.development_profiles;
    create policy "Development profiles select own" on public.development_profiles
      for select to authenticated
      using (
        coach_id = auth.uid()
        and public.client_belongs_to_coach(client_id, auth.uid())
      );

    drop policy if exists "Development profiles insert own" on public.development_profiles;
    create policy "Development profiles insert own" on public.development_profiles
      for insert to authenticated
      with check (
        coach_id = auth.uid()
        and public.client_belongs_to_coach(client_id, auth.uid())
      );

    drop policy if exists "Development profiles update own" on public.development_profiles;
    create policy "Development profiles update own" on public.development_profiles
      for update to authenticated
      using (
        coach_id = auth.uid()
        and public.client_belongs_to_coach(client_id, auth.uid())
      )
      with check (
        coach_id = auth.uid()
        and public.client_belongs_to_coach(client_id, auth.uid())
      );

    drop policy if exists "Development profiles delete own" on public.development_profiles;
    create policy "Development profiles delete own" on public.development_profiles
      for delete to authenticated
      using (
        coach_id = auth.uid()
        and public.client_belongs_to_coach(client_id, auth.uid())
      );
  end if;
end $$;

-- Development updates
do $$
begin
  if to_regclass('public.development_updates') is not null then
    drop policy if exists "Development updates select own" on public.development_updates;
    create policy "Development updates select own" on public.development_updates
      for select to authenticated
      using (
        coach_id = auth.uid()
        and public.client_belongs_to_coach(client_id, auth.uid())
      );

    drop policy if exists "Development updates insert own" on public.development_updates;
    create policy "Development updates insert own" on public.development_updates
      for insert to authenticated
      with check (
        coach_id = auth.uid()
        and public.client_belongs_to_coach(client_id, auth.uid())
      );

    drop policy if exists "Development updates update own" on public.development_updates;
    create policy "Development updates update own" on public.development_updates
      for update to authenticated
      using (
        coach_id = auth.uid()
        and public.client_belongs_to_coach(client_id, auth.uid())
      )
      with check (
        coach_id = auth.uid()
        and public.client_belongs_to_coach(client_id, auth.uid())
      );

    drop policy if exists "Development updates delete own" on public.development_updates;
    create policy "Development updates delete own" on public.development_updates
      for delete to authenticated
      using (
        coach_id = auth.uid()
        and public.client_belongs_to_coach(client_id, auth.uid())
      );
  end if;
end $$;

-- Development reports
do $$
begin
  if to_regclass('public.development_reports') is not null then
    drop policy if exists "Development reports select own" on public.development_reports;
    create policy "Development reports select own" on public.development_reports
      for select to authenticated
      using (
        coach_id = auth.uid()
        and public.client_belongs_to_coach(client_id, auth.uid())
      );

    drop policy if exists "Development reports insert own" on public.development_reports;
    create policy "Development reports insert own" on public.development_reports
      for insert to authenticated
      with check (
        coach_id = auth.uid()
        and public.client_belongs_to_coach(client_id, auth.uid())
      );

    drop policy if exists "Development reports update own" on public.development_reports;
    create policy "Development reports update own" on public.development_reports
      for update to authenticated
      using (
        coach_id = auth.uid()
        and public.client_belongs_to_coach(client_id, auth.uid())
      )
      with check (
        coach_id = auth.uid()
        and public.client_belongs_to_coach(client_id, auth.uid())
      );

    drop policy if exists "Development reports delete own" on public.development_reports;
    create policy "Development reports delete own" on public.development_reports
      for delete to authenticated
      using (
        coach_id = auth.uid()
        and public.client_belongs_to_coach(client_id, auth.uid())
      );
  end if;
end $$;

-- Coaching reports (legacy)
do $$
begin
  if to_regclass('public.coaching_reports') is not null then
    drop policy if exists "Coaching reports select own" on public.coaching_reports;
    create policy "Coaching reports select own" on public.coaching_reports
      for select to authenticated
      using (
        coach_id = auth.uid()
        and public.client_belongs_to_coach(client_id, auth.uid())
      );

    drop policy if exists "Coaching reports insert own" on public.coaching_reports;
    create policy "Coaching reports insert own" on public.coaching_reports
      for insert to authenticated
      with check (
        coach_id = auth.uid()
        and public.client_belongs_to_coach(client_id, auth.uid())
        and public.client_is_active_for_coach(client_id, coach_id)
      );

    drop policy if exists "Coaching reports update own" on public.coaching_reports;
    create policy "Coaching reports update own" on public.coaching_reports
      for update to authenticated
      using (
        coach_id = auth.uid()
        and public.client_belongs_to_coach(client_id, auth.uid())
      )
      with check (
        coach_id = auth.uid()
        and public.client_belongs_to_coach(client_id, auth.uid())
        and public.client_is_active_for_coach(client_id, coach_id)
      );

    drop policy if exists "Coaching reports delete own" on public.coaching_reports;
    create policy "Coaching reports delete own" on public.coaching_reports
      for delete to authenticated
      using (
        coach_id = auth.uid()
        and public.client_belongs_to_coach(client_id, auth.uid())
      );
  end if;
end $$;
