-- Organisation Guidance replacement chains must remain deterministic.
-- A guidance record may have at most one direct successor. This prevents
-- competing versions from both claiming to replace the same predecessor.
create unique index if not exists organisation_guidance_single_successor_idx
  on public.organisation_guidance(replaces_guidance_id)
  where replaces_guidance_id is not null;
