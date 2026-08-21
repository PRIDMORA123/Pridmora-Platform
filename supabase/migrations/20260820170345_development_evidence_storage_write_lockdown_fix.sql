-- SEC-1 corrective migration.
-- The tenancy migration already owns the development-evidence
-- SELECT and DELETE policies. This migration only locks down
-- authenticated INSERT and UPDATE.
--
-- service_role continues to bypass these authenticated-user
-- policies after application-level authorisation checks.

update storage.buckets
set public = false
where id = 'development-evidence';

drop policy if exists development_evidence_storage_insert on storage.objects;

create policy development_evidence_storage_insert
on storage.objects
for insert
to authenticated
with check (false);

drop policy if exists development_evidence_storage_update on storage.objects;

create policy development_evidence_storage_update
on storage.objects
for update
to authenticated
using (false)
with check (false);
