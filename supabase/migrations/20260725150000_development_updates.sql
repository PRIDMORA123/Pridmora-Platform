-- Development Updates: one session-level update replacing individual insight approval.
-- Additive only — does not delete intelligence_items or remove legacy columns.

-- ---------------------------------------------------------------------------
-- Helpers (idempotent)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.client_belongs_to_coach(p_client_id uuid, p_coach_id uuid)
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
      and c.coach_id = p_coach_id
  );
$$;

revoke all on function public.client_belongs_to_coach(uuid, uuid) from public;
grant execute on function public.client_belongs_to_coach(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Living development profile (one per person)
-- ---------------------------------------------------------------------------
create table if not exists public.development_profiles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  current_focus text,
  strengths jsonb not null default '[]'::jsonb,
  "values" jsonb not null default '[]'::jsonb,
  motivators jsonb not null default '[]'::jsonb,
  emerging_themes jsonb not null default '[]'::jsonb,
  growth_areas jsonb not null default '[]'::jsonb,
  coaching_preferences jsonb not null default '[]'::jsonb,
  beliefs jsonb not null default '[]'::jsonb,
  patterns jsonb not null default '[]'::jsonb,
  commitments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint development_profiles_client_unique unique (client_id)
);

create index if not exists development_profiles_coach_id_idx
  on public.development_profiles (coach_id);

drop trigger if exists development_profiles_set_updated_at on public.development_profiles;
create trigger development_profiles_set_updated_at
  before update on public.development_profiles
  for each row execute function public.set_updated_at();

alter table public.development_profiles enable row level security;

drop policy if exists "Development profiles select own" on public.development_profiles;
create policy "Development profiles select own" on public.development_profiles
  for select to authenticated
  using (public.client_belongs_to_coach(client_id, auth.uid()));

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
  using (public.client_belongs_to_coach(client_id, auth.uid()))
  with check (
    coach_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );

drop policy if exists "Development profiles delete own" on public.development_profiles;
create policy "Development profiles delete own" on public.development_profiles
  for delete to authenticated
  using (public.client_belongs_to_coach(client_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- Development updates (one per session)
-- ---------------------------------------------------------------------------
create table if not exists public.development_updates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'draft',
  conversation_summary text,
  proposed_changes jsonb not null default '{}'::jsonb,
  edited_changes jsonb,
  applied_changes jsonb,
  evidence_summary jsonb not null default '[]'::jsonb,
  has_meaningful_changes boolean not null default true,
  coach_note text,
  generated_at timestamptz,
  reviewed_at timestamptz,
  applied_at timestamptz,
  discarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint development_updates_status_check check (
    status in (
      'draft',
      'ready_for_review',
      'applied',
      'discarded',
      'failed'
    )
  ),
  constraint development_updates_session_unique unique (session_id)
);

create index if not exists development_updates_client_id_idx
  on public.development_updates (client_id);
create index if not exists development_updates_coach_id_idx
  on public.development_updates (coach_id);
create index if not exists development_updates_status_idx
  on public.development_updates (status);

drop trigger if exists development_updates_set_updated_at on public.development_updates;
create trigger development_updates_set_updated_at
  before update on public.development_updates
  for each row execute function public.set_updated_at();

alter table public.development_updates enable row level security;

drop policy if exists "Development updates select own" on public.development_updates;
create policy "Development updates select own" on public.development_updates
  for select to authenticated
  using (public.client_belongs_to_coach(client_id, auth.uid()));

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
  using (public.client_belongs_to_coach(client_id, auth.uid()))
  with check (
    coach_id = auth.uid()
    and public.client_belongs_to_coach(client_id, auth.uid())
  );

drop policy if exists "Development updates delete own" on public.development_updates;
create policy "Development updates delete own" on public.development_updates
  for delete to authenticated
  using (public.client_belongs_to_coach(client_id, auth.uid()));

-- Table privileges (RLS still enforces row ownership).
grant select, insert, update, delete on public.development_profiles to authenticated;
grant select, insert, update, delete on public.development_updates to authenticated;
grant all on public.development_profiles to service_role;
grant all on public.development_updates to service_role;

-- ---------------------------------------------------------------------------
-- Profile merge helpers
-- ---------------------------------------------------------------------------
create or replace function public.normalise_profile_value(p_value text)
returns text
language sql
immutable
as $$
  select lower(trim(coalesce(p_value, '')));
$$;

revoke all on function public.normalise_profile_value(text) from public;

create or replace function public.merge_profile_entries(
  p_existing jsonb,
  p_changes jsonb
)
returns jsonb
language plpgsql
volatile
as $$
declare
  v_result jsonb := coalesce(p_existing, '[]'::jsonb);
  v_add jsonb;
  v_update jsonb;
  v_remove jsonb;
  v_item jsonb;
  v_id text;
  v_value text;
  v_norm text;
  v_exists boolean;
  v_idx int;
  v_new jsonb;
begin
  if p_changes is null or p_changes = 'null'::jsonb then
    return v_result;
  end if;

  v_remove := coalesce(p_changes->'remove', '[]'::jsonb);
  if jsonb_typeof(v_remove) = 'array' then
    for v_item in select * from jsonb_array_elements(v_remove)
    loop
      v_id := coalesce(v_item->>'id', '');
      v_value := coalesce(v_item->>'value', v_item #>> '{}');
      v_norm := public.normalise_profile_value(v_value);
      select coalesce(jsonb_agg(elem), '[]'::jsonb)
        into v_result
      from jsonb_array_elements(v_result) elem
      where not (
        (v_id <> '' and elem->>'id' = v_id)
        or (v_norm <> '' and public.normalise_profile_value(elem->>'value') = v_norm)
      );
      v_result := coalesce(v_result, '[]'::jsonb);
    end loop;
  end if;

  v_update := coalesce(p_changes->'update', '[]'::jsonb);
  if jsonb_typeof(v_update) = 'array' then
    for v_item in select * from jsonb_array_elements(v_update)
    loop
      v_id := coalesce(v_item->>'id', '');
      v_value := trim(coalesce(v_item->>'value', ''));
      if v_value = '' then
        continue;
      end if;
      v_idx := null;
      for i in 0 .. greatest(jsonb_array_length(v_result) - 1, -1)
      loop
        if (v_id <> '' and v_result->i->>'id' = v_id)
          or public.normalise_profile_value(v_result->i->>'value')
             = public.normalise_profile_value(v_value)
        then
          v_idx := i;
          exit;
        end if;
      end loop;
      if v_idx is not null then
        v_new := v_result->v_idx;
        v_new := jsonb_set(v_new, '{value}', to_jsonb(v_value), true);
        if v_item ? 'status' then
          v_new := jsonb_set(v_new, '{status}', to_jsonb(coalesce(v_item->>'status', 'emerging')), true);
        end if;
        if v_item ? 'reason' then
          v_new := jsonb_set(v_new, '{reason}', to_jsonb(coalesce(v_item->>'reason', '')), true);
        end if;
        v_result := jsonb_set(v_result, array[v_idx::text], v_new, false);
      end if;
    end loop;
  end if;

  v_add := coalesce(p_changes->'add', '[]'::jsonb);
  if jsonb_typeof(v_add) = 'array' then
    for v_item in select * from jsonb_array_elements(v_add)
    loop
      v_value := trim(coalesce(v_item->>'value', ''));
      if v_value = '' then
        continue;
      end if;
      v_norm := public.normalise_profile_value(v_value);
      v_exists := exists (
        select 1
        from jsonb_array_elements(v_result) elem
        where public.normalise_profile_value(elem->>'value') = v_norm
      );
      if v_exists then
        -- Strengthen status on duplicate rather than inserting again.
        select coalesce(jsonb_agg(
          case
            when public.normalise_profile_value(elem->>'value') = v_norm then
              jsonb_set(
                jsonb_set(
                  elem,
                  '{status}',
                  to_jsonb(coalesce(nullif(v_item->>'status', ''), elem->>'status', 'supported')),
                  true
                ),
                '{reason}',
                to_jsonb(coalesce(nullif(v_item->>'reason', ''), elem->>'reason', '')),
                true
              )
            else elem
          end
        ), '[]'::jsonb)
          into v_result
        from jsonb_array_elements(v_result) elem;
      else
        v_result := v_result || jsonb_build_array(
          jsonb_build_object(
            'id', coalesce(nullif(v_item->>'id', ''), gen_random_uuid()::text),
            'value', v_value,
            'status', coalesce(nullif(v_item->>'status', ''), 'emerging'),
            'reason', coalesce(v_item->>'reason', '')
          )
        );
      end if;
    end loop;
  end if;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke all on function public.merge_profile_entries(jsonb, jsonb) from public;

create or replace function public.merge_commitment_entries(
  p_existing jsonb,
  p_changes jsonb
)
returns jsonb
language plpgsql
volatile
as $$
declare
  v_result jsonb := coalesce(p_existing, '[]'::jsonb);
  v_add jsonb;
  v_complete jsonb;
  v_remove jsonb;
  v_item jsonb;
  v_id text;
  v_value text;
  v_norm text;
  v_exists boolean;
begin
  if p_changes is null or p_changes = 'null'::jsonb then
    return v_result;
  end if;

  v_remove := coalesce(p_changes->'remove', '[]'::jsonb);
  if jsonb_typeof(v_remove) = 'array' then
    for v_item in select * from jsonb_array_elements(v_remove)
    loop
      v_id := coalesce(v_item->>'id', '');
      v_value := coalesce(v_item->>'value', v_item #>> '{}');
      v_norm := public.normalise_profile_value(v_value);
      select coalesce(jsonb_agg(elem), '[]'::jsonb)
        into v_result
      from jsonb_array_elements(v_result) elem
      where not (
        (v_id <> '' and elem->>'id' = v_id)
        or (v_norm <> '' and public.normalise_profile_value(elem->>'value') = v_norm)
      );
      v_result := coalesce(v_result, '[]'::jsonb);
    end loop;
  end if;

  v_complete := coalesce(p_changes->'complete', '[]'::jsonb);
  if jsonb_typeof(v_complete) = 'array' then
    for v_item in select * from jsonb_array_elements(v_complete)
    loop
      v_id := coalesce(v_item->>'id', '');
      v_value := coalesce(v_item->>'value', '');
      v_norm := public.normalise_profile_value(v_value);
      select coalesce(jsonb_agg(
        case
          when (v_id <> '' and elem->>'id' = v_id)
            or (v_norm <> '' and public.normalise_profile_value(elem->>'value') = v_norm)
          then jsonb_set(elem, '{status}', '"complete"'::jsonb, true)
          else elem
        end
      ), '[]'::jsonb)
        into v_result
      from jsonb_array_elements(v_result) elem;
    end loop;
  end if;

  v_add := coalesce(p_changes->'add', '[]'::jsonb);
  if jsonb_typeof(v_add) = 'array' then
    for v_item in select * from jsonb_array_elements(v_add)
    loop
      v_value := trim(coalesce(v_item->>'value', ''));
      if v_value = '' then
        continue;
      end if;
      v_norm := public.normalise_profile_value(v_value);
      v_exists := exists (
        select 1
        from jsonb_array_elements(v_result) elem
        where public.normalise_profile_value(elem->>'value') = v_norm
          and coalesce(elem->>'status', 'open') <> 'complete'
      );
      if not v_exists then
        v_result := v_result || jsonb_build_array(
          jsonb_build_object(
            'id', coalesce(nullif(v_item->>'id', ''), gen_random_uuid()::text),
            'value', v_value,
            'dueDate', v_item->'dueDate',
            'status', 'open'
          )
        );
      end if;
    end loop;
  end if;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke all on function public.merge_commitment_entries(jsonb, jsonb) from public;

-- ---------------------------------------------------------------------------
-- Apply development update (atomic, idempotent)
-- ---------------------------------------------------------------------------
create or replace function public.apply_development_update(p_update_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := auth.uid();
  v_update public.development_updates%rowtype;
  v_profile public.development_profiles%rowtype;
  v_changes jsonb;
  v_before jsonb;
  v_after jsonb;
begin
  if v_coach_id is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_update
  from public.development_updates
  where id = p_update_id
  for update;

  if not found then
    raise exception 'Development update not found.';
  end if;

  if not public.client_belongs_to_coach(v_update.client_id, v_coach_id) then
    raise exception 'Not authorised.';
  end if;

  if v_update.status = 'applied' then
    return jsonb_build_object(
      'ok', true,
      'alreadyApplied', true,
      'updateId', v_update.id,
      'status', v_update.status
    );
  end if;

  if v_update.status = 'discarded' then
    raise exception 'This development update has been discarded.';
  end if;

  if v_update.status not in ('ready_for_review', 'draft') then
    raise exception 'This development update cannot be applied.';
  end if;

  v_changes := coalesce(v_update.edited_changes, v_update.proposed_changes, '{}'::jsonb);

  insert into public.development_profiles (
    client_id,
    coach_id,
    current_focus
  )
  values (
    v_update.client_id,
    v_coach_id,
    null
  )
  on conflict (client_id) do nothing;

  select * into v_profile
  from public.development_profiles
  where client_id = v_update.client_id
  for update;

  v_before := to_jsonb(v_profile);

  update public.development_profiles
  set
    current_focus = case
      when v_changes ? 'currentFocus'
        and coalesce(v_changes->'currentFocus'->>'action', 'replace') = 'replace'
        and nullif(trim(coalesce(v_changes->'currentFocus'->>'value', '')), '') is not null
      then trim(v_changes->'currentFocus'->>'value')
      else current_focus
    end,
    strengths = public.merge_profile_entries(strengths, v_changes->'strengths'),
    "values" = public.merge_profile_entries("values", v_changes->'values'),
    motivators = public.merge_profile_entries(motivators, v_changes->'motivators'),
    emerging_themes = public.merge_profile_entries(emerging_themes, v_changes->'emergingThemes'),
    growth_areas = public.merge_profile_entries(growth_areas, v_changes->'growthAreas'),
    coaching_preferences = public.merge_profile_entries(
      coaching_preferences,
      v_changes->'coachingPreferences'
    ),
    beliefs = public.merge_profile_entries(beliefs, v_changes->'beliefs'),
    patterns = public.merge_profile_entries(patterns, v_changes->'patterns'),
    commitments = public.merge_commitment_entries(commitments, v_changes->'commitments'),
    updated_at = now()
  where id = v_profile.id
  returning * into v_profile;

  -- Keep clients.current_focus aligned when focus changes.
  if v_changes ? 'currentFocus'
    and nullif(trim(coalesce(v_changes->'currentFocus'->>'value', '')), '') is not null
  then
    update public.clients
    set
      current_focus = trim(v_changes->'currentFocus'->>'value'),
      updated_at = now()
    where id = v_update.client_id
      and coach_id = v_coach_id;
  end if;

  update public.development_updates
  set
    status = 'applied',
    applied_changes = v_changes,
    reviewed_at = coalesce(reviewed_at, now()),
    applied_at = now(),
    updated_at = now()
  where id = v_update.id
  returning * into v_update;

  v_after := to_jsonb(v_profile);

  if to_regclass('public.intelligence_audit_log') is not null then
    insert into public.intelligence_audit_log (
      user_id,
      entity_type,
      entity_id,
      action,
      previous_value,
      new_value
    )
    values (
      v_coach_id,
      'development_update',
      v_update.id,
      'development_update_applied',
      jsonb_build_object(
        'update', jsonb_build_object(
          'id', v_update.id,
          'sessionId', v_update.session_id,
          'clientId', v_update.client_id,
          'status', 'ready_for_review'
        ),
        'profile', v_before
      ),
      jsonb_build_object(
        'update', jsonb_build_object(
          'id', v_update.id,
          'sessionId', v_update.session_id,
          'clientId', v_update.client_id,
          'status', 'applied',
          'appliedChanges', v_changes
        ),
        'profile', v_after
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'alreadyApplied', false,
    'updateId', v_update.id,
    'status', v_update.status,
    'profileId', v_profile.id
  );
end;
$$;

revoke all on function public.apply_development_update(uuid) from public;
grant execute on function public.apply_development_update(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Discard development update
-- ---------------------------------------------------------------------------
create or replace function public.discard_development_update(p_update_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := auth.uid();
  v_update public.development_updates%rowtype;
begin
  if v_coach_id is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_update
  from public.development_updates
  where id = p_update_id
  for update;

  if not found then
    raise exception 'Development update not found.';
  end if;

  if not public.client_belongs_to_coach(v_update.client_id, v_coach_id) then
    raise exception 'Not authorised.';
  end if;

  if v_update.status = 'applied' then
    raise exception 'This development update has already been applied.';
  end if;

  if v_update.status = 'discarded' then
    return jsonb_build_object(
      'ok', true,
      'alreadyDiscarded', true,
      'updateId', v_update.id,
      'status', v_update.status
    );
  end if;

  update public.development_updates
  set
    status = 'discarded',
    discarded_at = now(),
    reviewed_at = coalesce(reviewed_at, now()),
    updated_at = now()
  where id = v_update.id
  returning * into v_update;

  if to_regclass('public.intelligence_audit_log') is not null then
    insert into public.intelligence_audit_log (
      user_id,
      entity_type,
      entity_id,
      action,
      previous_value,
      new_value
    )
    values (
      v_coach_id,
      'development_update',
      v_update.id,
      'development_update_discarded',
      jsonb_build_object(
        'id', v_update.id,
        'sessionId', v_update.session_id,
        'clientId', v_update.client_id
      ),
      jsonb_build_object(
        'id', v_update.id,
        'status', 'discarded',
        'discardedAt', v_update.discarded_at
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'alreadyDiscarded', false,
    'updateId', v_update.id,
    'status', v_update.status
  );
end;
$$;

revoke all on function public.discard_development_update(uuid) from public;
grant execute on function public.discard_development_update(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- One-time seed: build living profiles from approved intelligence only.
-- Non-destructive:
--   - never deletes or updates intelligence_items / evidence / audit
--   - never imports rejected or unapproved items
--   - only fills empty profile arrays (safe if migration is re-run)
--   - skips clients that already have an applied development update
-- ---------------------------------------------------------------------------
insert into public.development_profiles (client_id, coach_id, current_focus)
select
  c.id,
  c.coach_id,
  nullif(trim(coalesce(c.current_focus, '')), '')
from public.clients c
where not exists (
  select 1 from public.development_profiles dp where dp.client_id = c.id
)
on conflict (client_id) do nothing;

update public.development_profiles dp
set
  strengths = case
    when coalesce(jsonb_array_length(dp.strengths), 0) = 0 then coalesce((
      select jsonb_agg(distinct_entry order by distinct_entry->>'value')
      from (
        select distinct on (public.normalise_profile_value(ii.title))
          jsonb_build_object(
            'id', ii.id::text,
            'value', ii.title,
            'status', case
              when ii.confidence_label in ('supported', 'strongly supported') then 'supported'
              else 'emerging'
            end,
            'reason', coalesce(ii.description, '')
          ) as distinct_entry
        from public.intelligence_items ii
        where ii.client_id = dp.client_id
          and ii.user_id = dp.coach_id
          and ii.status = 'approved'
          and ii.archived_at is null
          and ii.category = 'strength'
        order by public.normalise_profile_value(ii.title), ii.approved_at desc nulls last
      ) seeded
    ), '[]'::jsonb)
    else dp.strengths
  end,
  "values" = case
    when coalesce(jsonb_array_length(dp."values"), 0) = 0 then coalesce((
      select jsonb_agg(distinct_entry order by distinct_entry->>'value')
      from (
        select distinct on (public.normalise_profile_value(ii.title))
          jsonb_build_object(
            'id', ii.id::text,
            'value', ii.title,
            'status', case
              when ii.confidence_label in ('supported', 'strongly supported') then 'supported'
              else 'emerging'
            end,
            'reason', coalesce(ii.description, '')
          ) as distinct_entry
        from public.intelligence_items ii
        where ii.client_id = dp.client_id
          and ii.user_id = dp.coach_id
          and ii.status = 'approved'
          and ii.archived_at is null
          and ii.category = 'value'
        order by public.normalise_profile_value(ii.title), ii.approved_at desc nulls last
      ) seeded
    ), '[]'::jsonb)
    else dp."values"
  end,
  motivators = case
    when coalesce(jsonb_array_length(dp.motivators), 0) = 0 then coalesce((
      select jsonb_agg(distinct_entry order by distinct_entry->>'value')
      from (
        select distinct on (public.normalise_profile_value(ii.title))
          jsonb_build_object(
            'id', ii.id::text,
            'value', ii.title,
            'status', case
              when ii.confidence_label in ('supported', 'strongly supported') then 'supported'
              else 'emerging'
            end,
            'reason', coalesce(ii.description, '')
          ) as distinct_entry
        from public.intelligence_items ii
        where ii.client_id = dp.client_id
          and ii.user_id = dp.coach_id
          and ii.status = 'approved'
          and ii.archived_at is null
          and ii.category = 'motivator'
        order by public.normalise_profile_value(ii.title), ii.approved_at desc nulls last
      ) seeded
    ), '[]'::jsonb)
    else dp.motivators
  end,
  emerging_themes = case
    when coalesce(jsonb_array_length(dp.emerging_themes), 0) = 0 then coalesce((
      select jsonb_agg(distinct_entry order by distinct_entry->>'value')
      from (
        select distinct on (public.normalise_profile_value(ii.title))
          jsonb_build_object(
            'id', ii.id::text,
            'value', ii.title,
            'status', case
              when ii.confidence_label in ('supported', 'strongly supported') then 'supported'
              else 'emerging'
            end,
            'reason', coalesce(ii.description, '')
          ) as distinct_entry
        from public.intelligence_items ii
        where ii.client_id = dp.client_id
          and ii.user_id = dp.coach_id
          and ii.status = 'approved'
          and ii.archived_at is null
          and ii.category = 'recurring_theme'
        order by public.normalise_profile_value(ii.title), ii.approved_at desc nulls last
      ) seeded
    ), '[]'::jsonb)
    else dp.emerging_themes
  end,
  growth_areas = case
    when coalesce(jsonb_array_length(dp.growth_areas), 0) = 0 then coalesce((
      select jsonb_agg(distinct_entry order by distinct_entry->>'value')
      from (
        select distinct on (public.normalise_profile_value(ii.title))
          jsonb_build_object(
            'id', ii.id::text,
            'value', ii.title,
            'status', case
              when ii.confidence_label in ('supported', 'strongly supported') then 'supported'
              else 'emerging'
            end,
            'reason', coalesce(ii.description, '')
          ) as distinct_entry
        from public.intelligence_items ii
        where ii.client_id = dp.client_id
          and ii.user_id = dp.coach_id
          and ii.status = 'approved'
          and ii.archived_at is null
          and ii.category in ('development_opportunity', 'goal', 'purpose')
        order by public.normalise_profile_value(ii.title), ii.approved_at desc nulls last
      ) seeded
    ), '[]'::jsonb)
    else dp.growth_areas
  end,
  coaching_preferences = case
    when coalesce(jsonb_array_length(dp.coaching_preferences), 0) = 0 then coalesce((
      select jsonb_agg(distinct_entry order by distinct_entry->>'value')
      from (
        select distinct on (public.normalise_profile_value(ii.title))
          jsonb_build_object(
            'id', ii.id::text,
            'value', ii.title,
            'status', case
              when ii.confidence_label in ('supported', 'strongly supported') then 'supported'
              else 'emerging'
            end,
            'reason', coalesce(ii.description, '')
          ) as distinct_entry
        from public.intelligence_items ii
        where ii.client_id = dp.client_id
          and ii.user_id = dp.coach_id
          and ii.status = 'approved'
          and ii.archived_at is null
          and ii.category in ('learning_preference', 'communication_style')
        order by public.normalise_profile_value(ii.title), ii.approved_at desc nulls last
      ) seeded
    ), '[]'::jsonb)
    else dp.coaching_preferences
  end,
  beliefs = case
    when coalesce(jsonb_array_length(dp.beliefs), 0) = 0 then coalesce((
      select jsonb_agg(distinct_entry order by distinct_entry->>'value')
      from (
        select distinct on (public.normalise_profile_value(ii.title))
          jsonb_build_object(
            'id', ii.id::text,
            'value', ii.title,
            'status', case
              when ii.confidence_label in ('supported', 'strongly supported') then 'supported'
              else 'emerging'
            end,
            'reason', coalesce(ii.description, '')
          ) as distinct_entry
        from public.intelligence_items ii
        where ii.client_id = dp.client_id
          and ii.user_id = dp.coach_id
          and ii.status = 'approved'
          and ii.archived_at is null
          and ii.category in ('limiting_belief', 'empowering_belief')
        order by public.normalise_profile_value(ii.title), ii.approved_at desc nulls last
      ) seeded
    ), '[]'::jsonb)
    else dp.beliefs
  end,
  patterns = case
    when coalesce(jsonb_array_length(dp.patterns), 0) = 0 then coalesce((
      select jsonb_agg(distinct_entry order by distinct_entry->>'value')
      from (
        select distinct on (public.normalise_profile_value(ii.title))
          jsonb_build_object(
            'id', ii.id::text,
            'value', ii.title,
            'status', case
              when ii.confidence_label in ('supported', 'strongly supported') then 'supported'
              else 'emerging'
            end,
            'reason', coalesce(ii.description, '')
          ) as distinct_entry
        from public.intelligence_items ii
        where ii.client_id = dp.client_id
          and ii.user_id = dp.coach_id
          and ii.status = 'approved'
          and ii.archived_at is null
          and ii.category in ('behaviour_pattern', 'emotional_pattern', 'decision_style')
        order by public.normalise_profile_value(ii.title), ii.approved_at desc nulls last
      ) seeded
    ), '[]'::jsonb)
    else dp.patterns
  end,
  current_focus = coalesce(
    nullif(trim(dp.current_focus), ''),
    (
      select ii.title
      from public.intelligence_items ii
      where ii.client_id = dp.client_id
        and ii.user_id = dp.coach_id
        and ii.status = 'approved'
        and ii.archived_at is null
        and ii.category in ('development_opportunity', 'goal')
      order by ii.confidence_score desc nulls last, ii.approved_at desc nulls last
      limit 1
    )
  ),
  updated_at = now()
where
  -- Only seed profiles that have not yet been refined by an applied update.
  not exists (
    select 1
    from public.development_updates du
    where du.client_id = dp.client_id
      and du.status = 'applied'
  )
  and exists (
    select 1
    from public.intelligence_items ii
    where ii.client_id = dp.client_id
      and ii.user_id = dp.coach_id
      and ii.status = 'approved'
      and ii.archived_at is null
  );

-- ---------------------------------------------------------------------------
-- Extend permanent delete
-- ---------------------------------------------------------------------------
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

  if to_regclass('public.intelligence_audit_log') is not null then
    delete from public.intelligence_audit_log
    where user_id = v_coach_id
      and (
        entity_id = p_client_id
        or entity_id in (
          select id from public.intelligence_items
          where client_id = p_client_id and user_id = v_coach_id
        )
        or entity_id in (
          select id from public.development_updates
          where client_id = p_client_id and coach_id = v_coach_id
        )
      );
  end if;

  if to_regclass('public.development_updates') is not null then
    delete from public.development_updates
    where client_id = p_client_id and coach_id = v_coach_id;
  end if;

  if to_regclass('public.development_profiles') is not null then
    delete from public.development_profiles
    where client_id = p_client_id and coach_id = v_coach_id;
  end if;

  if to_regclass('public.intelligence_evidence') is not null then
    delete from public.intelligence_evidence
    where user_id = v_coach_id
      and intelligence_item_id in (
        select id from public.intelligence_items
        where client_id = p_client_id and user_id = v_coach_id
      );
  end if;

  if to_regclass('public.session_intelligence_reviews') is not null then
    delete from public.session_intelligence_reviews
    where client_id = p_client_id and user_id = v_coach_id;
  end if;

  if to_regclass('public.question_insights') is not null then
    delete from public.question_insights
    where client_id = p_client_id and user_id = v_coach_id;
  end if;

  if to_regclass('public.person_progress_signals') is not null then
    delete from public.person_progress_signals
    where client_id = p_client_id and user_id = v_coach_id;
  end if;

  if to_regclass('public.intelligence_items') is not null then
    delete from public.intelligence_items
    where client_id = p_client_id and user_id = v_coach_id;
  end if;

  if to_regclass('public.coaching_reports') is not null then
    delete from public.coaching_reports
    where client_id = p_client_id and coach_id = v_coach_id;
  end if;

  if to_regclass('public.sessions') is not null then
    delete from public.sessions
    where client_id = p_client_id and coach_id = v_coach_id;
  end if;

  if to_regclass('public.client_items') is not null then
    delete from public.client_items
    where client_id = p_client_id and coach_id = v_coach_id;
  end if;

  delete from public.clients
  where id = p_client_id and coach_id = v_coach_id;

  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'not found';
  end if;
end;
$$;

revoke all on function public.permanently_delete_client(uuid) from public;
grant execute on function public.permanently_delete_client(uuid) to authenticated;

notify pgrst, 'reload schema';
