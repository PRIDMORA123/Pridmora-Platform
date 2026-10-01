-- Restore the intended authenticated execution privilege for organisation context
-- initialisation. The organisation foundation migration grants this privilege,
-- but Pilot database state was found without it during Organisation Guidance UAT.

revoke all on function public.ensure_personal_organisation(uuid) from public;

grant execute on function public.ensure_personal_organisation(uuid) to authenticated;
grant execute on function public.ensure_personal_organisation(uuid) to service_role;
