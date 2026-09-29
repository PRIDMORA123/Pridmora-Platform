-- Allow an abandoned replacement to be corrected while keeping the
-- active replacement chain deterministic.
--
-- A predecessor may have only one non-withdrawn direct successor at a time.
-- Withdrawn successors remain in the audit history but no longer occupy
-- the unique successor slot.
drop index if exists public.organisation_guidance_single_successor_idx;

create unique index organisation_guidance_single_successor_idx
  on public.organisation_guidance(replaces_guidance_id)
  where replaces_guidance_id is not null
    and status <> 'withdrawn';
