-- Organisation Guidance least-privilege hardening.
--
-- Organisation Context source material is managed by authorised organisation
-- roles. Ordinary organisation members must not be able to query the complete
-- approved repository, including extracted source text, directly.
--
-- Manager Aurelia retrieves narrowly scoped approved context server-side only
-- after normal application authentication and authorisation.

drop policy if exists organisation_guidance_select
  on public.organisation_guidance;

create policy organisation_guidance_select
  on public.organisation_guidance
  for select
  to authenticated
  using (
    public.has_organisation_permission(
      organisation_id,
      auth.uid(),
      'organisation_guidance.manage'
    )
  );

comment on table public.organisation_guidance is
  'Organisation-scoped policies, values and manager guidance. Direct authenticated access is restricted to authorised Organisation Guidance managers; approved context for Aurelia is retrieved through authorised server-side application paths.';
