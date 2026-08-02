-- Optional relationship-level metadata: agreement, initial conversation, supporting context.
-- Never required for manager-led coaching. Does not implement contracts or e-signature.

alter table public.clients
  add column if not exists relationship_agreement jsonb default null;

alter table public.clients
  add column if not exists initial_conversation jsonb default null;

alter table public.clients
  add column if not exists supporting_context jsonb default '[]'::jsonb;

comment on column public.clients.relationship_agreement is
  'Optional agreement and boundaries record (purpose, confidentiality, sponsor, expectations). Status: not_recorded | draft | agreed. Not a legal contract.';

comment on column public.clients.initial_conversation is
  'Optional initial or chemistry conversation. Does not count as Session 1 unless explicitly converted.';

comment on column public.clients.supporting_context is
  'Optional supporting context items. useForAiPreparation must be true before an item personalises AI preparation.';
