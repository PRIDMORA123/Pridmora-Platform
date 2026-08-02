-- Add optional client email for coach contact details.
-- Reuses existing clients.name, organisation, role, current_focus columns.

alter table public.clients
  add column if not exists email text;

comment on column public.clients.email is
  'Optional contact email for the coaching client.';
