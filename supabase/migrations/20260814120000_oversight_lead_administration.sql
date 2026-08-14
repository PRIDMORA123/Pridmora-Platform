-- Organisation Lead (oversight) customer administration.
-- Extends oversight with membership + assignment admin permissions only.
-- Does NOT grant coaching_content.view, private_notes.view, organisation.manage,
-- billing.manage, or sample_organisation.manage.
-- Idempotent: CREATE OR REPLACE of has_organisation_permission.

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
  'Organisation role permission matrix. Oversight (Organisation Lead) may administer members/assignments/seats and read safe org intelligence; never coaching content or private identity.';
