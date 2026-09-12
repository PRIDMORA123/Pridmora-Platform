create or replace function public.owner_list_platform_users(
  p_search text default null,
  p_organisation_id uuid default null,
  p_role text default null,
  p_status text default null,
  p_limit integer default 100
)
returns table (
  membership_id uuid,
  user_id uuid,
  organisation_id uuid,
  organisation_name text,
  role text,
  professional_role text,
  status text,
  full_name text,
  email text,
  last_active_at timestamptz,
  joined_at timestamptz,
  invited_at timestamptz,
  created_at timestamptz,
  invitation_status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner(auth.uid()) then
    raise exception 'not authorised';
  end if;

  return query
  select
    m.id as membership_id,
    m.user_id,
    m.organisation_id,
    o.name as organisation_name,
    m.role,
    m.professional_role,
    m.status,
    coalesce(p.full_name, '') as full_name,
    coalesce(u.email, '')::text as email,
    m.last_active_at,
    m.joined_at,
    m.invited_at,
    m.created_at,
    case
      when m.status = 'invited' then 'pending'
      when m.status = 'active' and m.joined_at is not null then 'accepted'
      when m.status = 'deactivated' then 'deactivated'
      else m.status
    end as invitation_status
  from public.organisation_memberships m
  join public.organisations o on o.id = m.organisation_id
  left join public.profiles p on p.id = m.user_id
  left join auth.users u on u.id = m.user_id
  where o.organisation_type <> 'personal'
    and (p_organisation_id is null or m.organisation_id = p_organisation_id)
    and (p_role is null or m.role = p_role)
    and (p_status is null or m.status = p_status)
    and (
      p_search is null
      or p_search = ''
      or o.name ilike '%' || p_search || '%'
      or coalesce(p.full_name, '') ilike '%' || p_search || '%'
      or coalesce(u.email, '') ilike '%' || p_search || '%'
    )
  order by m.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

revoke all on function public.owner_list_platform_users(
  text,
  uuid,
  text,
  text,
  integer
) from public;

grant execute on function public.owner_list_platform_users(
  text,
  uuid,
  text,
  text,
  integer
) to authenticated;
