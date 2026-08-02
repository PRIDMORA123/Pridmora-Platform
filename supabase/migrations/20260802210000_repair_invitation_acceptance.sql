-- Repair: organisation invitation acceptance must create membership atomically.
--
-- Root cause (Pilot CEV):
--   Invitees can SELECT/UPDATE organisation_invitations by matching email, but
--   organisation_memberships INSERT requires members.manage OR creating an org as
--   owner. Accept therefore claimed the invitation then failed on membership insert.
--
-- Security boundary:
--   Direct client INSERT into organisation_memberships remains restricted.
--   Acceptance runs only through SECURITY DEFINER RPC accept_organisation_invitation,
--   which copies role / professional_role from the invitation row and never trusts
--   client-supplied organisation_id, user_id, or role.
--
-- search_path is pinned to prevent search_path injection.

-- pgcrypto provides digest(); already enabled on Supabase projects.
create extension if not exists pgcrypto;

create or replace function public.accept_organisation_invitation(
  invitation_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_email_confirmed_at timestamptz;
  v_token_hash text;
  v_invite public.organisation_invitations%rowtype;
  v_membership_id uuid;
  v_seats_purchased integer;
  v_licence_status text;
  v_seats_in_use integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'INVITATION_INVALID');
  end if;

  if invitation_token is null or length(btrim(invitation_token)) = 0 then
    return jsonb_build_object('ok', false, 'code', 'INVITATION_INVALID');
  end if;

  select u.email, u.email_confirmed_at
  into v_email, v_email_confirmed_at
  from auth.users u
  where u.id = v_uid;

  if v_email is null or v_email_confirmed_at is null then
    return jsonb_build_object('ok', false, 'code', 'INVITATION_EMAIL_MISMATCH');
  end if;

  -- Must match Node crypto.createHash('sha256').update(token).digest('hex').
  v_token_hash := encode(
    digest(convert_to(invitation_token, 'UTF8'), 'sha256'),
    'hex'
  );

  -- Lock matching invitation row for the duration of this transaction.
  select *
  into v_invite
  from public.organisation_invitations
  where token_hash = v_token_hash
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'INVITATION_INVALID');
  end if;

  if v_invite.status is distinct from 'pending' then
    return jsonb_build_object('ok', false, 'code', 'INVITATION_ALREADY_USED');
  end if;

  if v_invite.expires_at <= now() then
    update public.organisation_invitations
    set status = 'expired'
    where id = v_invite.id
      and status = 'pending';
    return jsonb_build_object('ok', false, 'code', 'INVITATION_EXPIRED');
  end if;

  if lower(btrim(v_invite.email)) is distinct from lower(btrim(v_email)) then
    return jsonb_build_object('ok', false, 'code', 'INVITATION_EMAIL_MISMATCH');
  end if;

  if exists (
    select 1
    from public.organisation_memberships m
    where m.organisation_id = v_invite.organisation_id
      and m.user_id = v_uid
      and m.status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'code', 'INVITATION_MEMBERSHIP_EXISTS');
  end if;

  -- Practitioner invites consume a seat; block when licence unusable or full.
  if v_invite.role = 'practitioner' then
    select
      coalesce(o.practitioner_seats_purchased, 0),
      coalesce(o.licence_status, 'active')
    into v_seats_purchased, v_licence_status
    from public.organisations o
    where o.id = v_invite.organisation_id;

    if v_licence_status is distinct from 'active'
       and v_licence_status is distinct from 'trial' then
      return jsonb_build_object('ok', false, 'code', 'INVITATION_INVALID');
    end if;

    select count(*)::integer
    into v_seats_in_use
    from public.organisation_memberships m
    where m.organisation_id = v_invite.organisation_id
      and m.status = 'active'
      and m.role = 'practitioner';

    if v_seats_in_use >= v_seats_purchased then
      return jsonb_build_object('ok', false, 'code', 'INVITATION_INVALID');
    end if;
  end if;

  -- Consume invitation first under row lock (pending → accepted).
  update public.organisation_invitations
  set
    status = 'accepted',
    accepted_at = now(),
    accepted_by = v_uid
  where id = v_invite.id
    and status = 'pending';

  if not found then
    return jsonb_build_object('ok', false, 'code', 'INVITATION_ALREADY_USED');
  end if;

  insert into public.organisation_memberships (
    organisation_id,
    user_id,
    role,
    professional_role,
    status,
    invited_by,
    invited_at,
    joined_at,
    created_at,
    updated_at
  )
  values (
    v_invite.organisation_id,
    v_uid,
    v_invite.role,
    v_invite.professional_role,
    'active',
    v_invite.invited_by,
    v_invite.created_at,
    now(),
    now(),
    now()
  )
  on conflict (organisation_id, user_id) do update
    set
      role = excluded.role,
      professional_role = excluded.professional_role,
      status = 'active',
      invited_by = coalesce(organisation_memberships.invited_by, excluded.invited_by),
      invited_at = coalesce(organisation_memberships.invited_at, excluded.invited_at),
      joined_at = coalesce(organisation_memberships.joined_at, excluded.joined_at),
      deactivated_at = null,
      updated_at = now()
  returning id into v_membership_id;

  update public.profiles
  set
    current_organisation_id = v_invite.organisation_id,
    updated_at = now()
  where id = v_uid;

  insert into public.organisation_audit_log (
    organisation_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_invite.organisation_id,
    v_uid,
    'member_joined',
    'organisation_membership',
    v_membership_id,
    jsonb_build_object(
      'role', v_invite.role,
      'invitationId', v_invite.id,
      'via', 'accept_organisation_invitation'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'organisation_id', v_invite.organisation_id,
    'membership_id', v_membership_id,
    'role', v_invite.role,
    'professional_role', v_invite.professional_role
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'INVITATION_MEMBERSHIP_EXISTS');
end;
$$;

comment on function public.accept_organisation_invitation(text) is
  'Atomically accept a pending organisation invitation for auth.uid(). '
  'Copies role values from the invitation; does not trust client-supplied org/role. '
  'Direct membership INSERT policies remain unchanged.';

revoke all on function public.accept_organisation_invitation(text) from public;
revoke all on function public.accept_organisation_invitation(text) from anon;
grant execute on function public.accept_organisation_invitation(text) to authenticated;
grant execute on function public.accept_organisation_invitation(text) to service_role;
