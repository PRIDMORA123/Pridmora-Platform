-- RELEASE 1 DATABASE RECONCILIATION
--
-- Purpose:
-- Preserve the verified Production anti-impersonation hardening for
-- confidential client/development content access in source control.
--
-- This migration does NOT repair migration history, delete data, alter
-- organisations, change licences or perform any tenant lifecycle action.
--
-- It assumes the 27 August organisation deletion/access foundation has
-- already been applied by the normal migration sequence and fails closed
-- if those prerequisites are absent.

do $$
begin
  if to_regprocedure(
    'public.client_organisation_allows_member_access(uuid)'
  ) is null then
    raise exception
      'Release 1 reconciliation prerequisite missing: client_organisation_allows_member_access(uuid)';
  end if;

  if to_regprocedure(
    'public.user_is_assigned_to_client(uuid,uuid)'
  ) is null then
    raise exception
      'Release 1 reconciliation prerequisite missing: user_is_assigned_to_client(uuid,uuid)';
  end if;
end
$$;

create or replace function public.user_can_access_client_content(
  p_client_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and p_user_id = auth.uid()
    and public.client_organisation_allows_member_access(p_client_id)
    and (
      public.user_is_assigned_to_client(p_client_id, p_user_id)
      or (
        exists (
          select 1
          from public.clients c
          where c.id = p_client_id
            and c.coach_id = p_user_id
        )
        and not exists (
          select 1
          from public.relationship_assignments ra
          where ra.client_id = p_client_id
            and ra.status = 'active'
        )
      )
    );
$$;

comment on function public.user_can_access_client_content(uuid, uuid) is
  'Confidential coaching/development content access. Requires the requested '
  'user to equal auth.uid(), preventing caller-supplied user impersonation. '
  'pending_closure organisations fail closed, including the legacy coach_id fallback.';

revoke all on function public.user_can_access_client_content(uuid, uuid) from public;
revoke all on function public.user_can_access_client_content(uuid, uuid) from anon;
grant execute on function public.user_can_access_client_content(uuid, uuid) to authenticated;
grant execute on function public.user_can_access_client_content(uuid, uuid) to service_role;
