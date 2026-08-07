-- Development Evidence & Trusted Intelligence
-- Additive only. Extends Manager Development & Intelligence Platform.
-- Evidence before certainty. Uploaded external evidence requires human review
-- before contributing to Development Intelligence.
--
-- Privacy:
-- - Organisation isolation via organisation_id
-- - Person access via user_can_access_client_content
-- - Original documents never publicly addressable
-- - Confidential private identity never stored on evidence rows

-- ---------------------------------------------------------------------------
-- 1. development_evidence (canonical evidence record)
-- ---------------------------------------------------------------------------
create table if not exists public.development_evidence (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  evidence_type text not null,
  source_type text not null,
  source_record_id uuid,
  title text not null,
  evidence_date date,
  captured_at timestamptz not null default now(),
  captured_by uuid references auth.users(id) on delete set null,
  original_document_id uuid,
  processing_status text not null default 'ready',
  review_status text not null default 'pending_review',
  include_in_intelligence boolean not null default false,
  structured_evidence jsonb not null default '{}'::jsonb,
  source_summary text,
  freshness_class text not null default 'current',
  restricted boolean not null default false,
  content_hash text,
  extraction_version text,
  purpose text,
  source_label text,
  capability_keys text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint development_evidence_type_check check (evidence_type in (
    'development_conversation',
    'summary_insights',
    'reflection',
    'development_update',
    'action',
    'manager_observation',
    'feedback_360',
    'disc',
    'insights_discovery',
    'clifton_strengths',
    'hogan',
    'lumina',
    'mbti',
    'emotional_intelligence',
    'leadership_assessment',
    'pdp',
    'appraisal_review',
    'learning_record',
    'qualification',
    'competency_assessment',
    'organisation_framework',
    'personal_reflection',
    'stakeholder_feedback',
    'other_document'
  )),
  constraint development_evidence_source_type_check check (source_type in (
    'internal_reference',
    'uploaded_document',
    'manual_entry',
    'sample_seed'
  )),
  constraint development_evidence_processing_status_check check (processing_status in (
    'pending_upload',
    'uploaded',
    'extracting',
    'extracted',
    'analysing',
    'ready',
    'failed'
  )),
  constraint development_evidence_review_status_check check (review_status in (
    'pending_review',
    'in_review',
    'approved',
    'edited',
    'rejected',
    'excluded'
  )),
  constraint development_evidence_freshness_check check (freshness_class in (
    'current',
    'ageing',
    'historic'
  ))
);

create index if not exists development_evidence_organisation_id_idx
  on public.development_evidence (organisation_id);
create index if not exists development_evidence_client_id_idx
  on public.development_evidence (client_id);
create index if not exists development_evidence_type_idx
  on public.development_evidence (evidence_type);
create index if not exists development_evidence_date_idx
  on public.development_evidence (evidence_date);
create index if not exists development_evidence_review_status_idx
  on public.development_evidence (review_status);
create index if not exists development_evidence_include_idx
  on public.development_evidence (include_in_intelligence)
  where include_in_intelligence = true and deleted_at is null;
create index if not exists development_evidence_client_active_idx
  on public.development_evidence (client_id, created_at desc)
  where deleted_at is null;
create unique index if not exists development_evidence_source_ref_unique_idx
  on public.development_evidence (client_id, source_type, source_record_id)
  where source_record_id is not null and deleted_at is null;

drop trigger if exists development_evidence_set_updated_at on public.development_evidence;
create trigger development_evidence_set_updated_at
  before update on public.development_evidence
  for each row execute function public.set_updated_at();

comment on table public.development_evidence is
  'Canonical development evidence. Uploaded external evidence requires human review before intelligence contribution.';
comment on column public.development_evidence.include_in_intelligence is
  'Only true after human approval (or for trusted internal references explicitly included).';
comment on column public.development_evidence.restricted is
  'When true, evidence must not contribute to organisation-level intelligence.';

-- ---------------------------------------------------------------------------
-- 2. development_evidence_documents (original upload + extraction provenance)
-- ---------------------------------------------------------------------------
create table if not exists public.development_evidence_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  evidence_id uuid references public.development_evidence(id) on delete cascade,
  file_name text not null,
  mime_type text not null,
  byte_size integer not null default 0 check (byte_size >= 0),
  content_hash text not null,
  storage_path text,
  extracted_text text,
  extraction_method text,
  extraction_version text not null default 'v1',
  extraction_status text not null default 'pending',
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint development_evidence_documents_extraction_status_check check (
    extraction_status in ('pending', 'extracted', 'failed', 'unsupported')
  )
);

create index if not exists development_evidence_documents_evidence_id_idx
  on public.development_evidence_documents (evidence_id);
create index if not exists development_evidence_documents_client_id_idx
  on public.development_evidence_documents (client_id);
create index if not exists development_evidence_documents_hash_idx
  on public.development_evidence_documents (client_id, content_hash);

drop trigger if exists development_evidence_documents_set_updated_at
  on public.development_evidence_documents;
create trigger development_evidence_documents_set_updated_at
  before update on public.development_evidence_documents
  for each row execute function public.set_updated_at();

alter table public.development_evidence
  drop constraint if exists development_evidence_original_document_id_fkey;
alter table public.development_evidence
  add constraint development_evidence_original_document_id_fkey
  foreign key (original_document_id)
  references public.development_evidence_documents(id)
  on delete set null;

comment on table public.development_evidence_documents is
  'Original uploaded evidence documents and extraction provenance. Never publicly addressable.';

-- ---------------------------------------------------------------------------
-- 3. development_evidence_observations (reviewed structured observations)
-- ---------------------------------------------------------------------------
create table if not exists public.development_evidence_observations (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null
    references public.development_evidence(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  description text not null default '',
  category text,
  behavioural_evidence text,
  development_implication text,
  source_confidence text not null default 'medium',
  assessment_context text,
  limitations text,
  capability_key text,
  include_in_intelligence boolean not null default false,
  review_status text not null default 'proposed',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint development_evidence_observations_confidence_check check (
    source_confidence in ('low', 'medium', 'high')
  ),
  constraint development_evidence_observations_review_status_check check (
    review_status in ('proposed', 'approved', 'edited', 'rejected', 'excluded')
  )
);

create index if not exists development_evidence_observations_evidence_id_idx
  on public.development_evidence_observations (evidence_id);
create index if not exists development_evidence_observations_client_id_idx
  on public.development_evidence_observations (client_id);
create index if not exists development_evidence_observations_include_idx
  on public.development_evidence_observations (client_id, include_in_intelligence)
  where include_in_intelligence = true;

drop trigger if exists development_evidence_observations_set_updated_at
  on public.development_evidence_observations;
create trigger development_evidence_observations_set_updated_at
  before update on public.development_evidence_observations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. development_evidence_links (navigable evidence graph relationships)
-- ---------------------------------------------------------------------------
create table if not exists public.development_evidence_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  from_evidence_id uuid not null
    references public.development_evidence(id) on delete cascade,
  to_evidence_id uuid
    references public.development_evidence(id) on delete cascade,
  capability_key text,
  link_type text not null default 'supports',
  label text,
  created_at timestamptz not null default now(),
  constraint development_evidence_links_type_check check (link_type in (
    'supports',
    'contradicts',
    'related_capability',
    'derived_from',
    'references'
  )),
  constraint development_evidence_links_target_check check (
    to_evidence_id is not null or capability_key is not null
  )
);

create index if not exists development_evidence_links_client_id_idx
  on public.development_evidence_links (client_id);
create index if not exists development_evidence_links_from_idx
  on public.development_evidence_links (from_evidence_id);
create index if not exists development_evidence_links_capability_idx
  on public.development_evidence_links (client_id, capability_key);

-- ---------------------------------------------------------------------------
-- 5. organisation frameworks (org-defined capability expectations)
-- ---------------------------------------------------------------------------
create table if not exists public.organisation_frameworks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_frameworks_status_check check (status in (
    'draft',
    'active',
    'archived'
  ))
);

create index if not exists organisation_frameworks_org_id_idx
  on public.organisation_frameworks (organisation_id);

drop trigger if exists organisation_frameworks_set_updated_at on public.organisation_frameworks;
create trigger organisation_frameworks_set_updated_at
  before update on public.organisation_frameworks
  for each row execute function public.set_updated_at();

create table if not exists public.organisation_framework_capabilities (
  id uuid primary key default gen_random_uuid(),
  framework_id uuid not null
    references public.organisation_frameworks(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  label text not null,
  description text,
  pridmora_capability_key text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organisation_framework_capabilities_framework_idx
  on public.organisation_framework_capabilities (framework_id);
create index if not exists organisation_framework_capabilities_org_idx
  on public.organisation_framework_capabilities (organisation_id);

drop trigger if exists organisation_framework_capabilities_set_updated_at
  on public.organisation_framework_capabilities;
create trigger organisation_framework_capabilities_set_updated_at
  before update on public.organisation_framework_capabilities
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Evidence audit (metadata only — never raw evidence content)
-- ---------------------------------------------------------------------------
create table if not exists public.development_evidence_audit_log (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  evidence_id uuid references public.development_evidence(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint development_evidence_audit_action_check check (action in (
    'evidence_uploaded',
    'evidence_processed',
    'evidence_reviewed',
    'evidence_included',
    'evidence_excluded',
    'evidence_viewed',
    'intelligence_evidence_opened',
    'evidence_deleted',
    'framework_created',
    'framework_updated'
  ))
);

create index if not exists development_evidence_audit_org_idx
  on public.development_evidence_audit_log (organisation_id, created_at desc);
create index if not exists development_evidence_audit_client_idx
  on public.development_evidence_audit_log (client_id, created_at desc);
create index if not exists development_evidence_audit_evidence_idx
  on public.development_evidence_audit_log (evidence_id, created_at desc);

comment on table public.development_evidence_audit_log is
  'Evidence lifecycle audit. Metadata must not contain raw evidence content.';

-- ---------------------------------------------------------------------------
-- 7. AI usage tracking for evidence / intelligence cost control
-- ---------------------------------------------------------------------------
create table if not exists public.development_evidence_ai_usage (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  evidence_id uuid references public.development_evidence(id) on delete set null,
  usage_kind text not null,
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  content_hash text,
  created_at timestamptz not null default now(),
  constraint development_evidence_ai_usage_kind_check check (usage_kind in (
    'evidence_processing',
    'development_generation',
    'organisation_intelligence',
    'team_intelligence'
  ))
);

create index if not exists development_evidence_ai_usage_org_idx
  on public.development_evidence_ai_usage (organisation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 8. RLS
-- ---------------------------------------------------------------------------
alter table public.development_evidence enable row level security;
alter table public.development_evidence_documents enable row level security;
alter table public.development_evidence_observations enable row level security;
alter table public.development_evidence_links enable row level security;
alter table public.organisation_frameworks enable row level security;
alter table public.organisation_framework_capabilities enable row level security;
alter table public.development_evidence_audit_log enable row level security;
alter table public.development_evidence_ai_usage enable row level security;

-- Evidence: assigned practitioner / coach only (content access)
drop policy if exists development_evidence_select on public.development_evidence;
create policy development_evidence_select on public.development_evidence
  for select to authenticated
  using (public.user_can_access_client_content(client_id, auth.uid()));

drop policy if exists development_evidence_insert on public.development_evidence;
create policy development_evidence_insert on public.development_evidence
  for insert to authenticated
  with check (
    public.user_can_access_client_content(client_id, auth.uid())
    and (
      organisation_id is null
      or public.client_belongs_to_organisation(client_id, organisation_id)
    )
  );

drop policy if exists development_evidence_update on public.development_evidence;
create policy development_evidence_update on public.development_evidence
  for update to authenticated
  using (public.user_can_access_client_content(client_id, auth.uid()))
  with check (public.user_can_access_client_content(client_id, auth.uid()));

drop policy if exists development_evidence_delete on public.development_evidence;
create policy development_evidence_delete on public.development_evidence
  for delete to authenticated
  using (public.user_can_access_client_content(client_id, auth.uid()));

-- Documents
drop policy if exists development_evidence_documents_select
  on public.development_evidence_documents;
create policy development_evidence_documents_select
  on public.development_evidence_documents
  for select to authenticated
  using (public.user_can_access_client_content(client_id, auth.uid()));

drop policy if exists development_evidence_documents_insert
  on public.development_evidence_documents;
create policy development_evidence_documents_insert
  on public.development_evidence_documents
  for insert to authenticated
  with check (public.user_can_access_client_content(client_id, auth.uid()));

drop policy if exists development_evidence_documents_update
  on public.development_evidence_documents;
create policy development_evidence_documents_update
  on public.development_evidence_documents
  for update to authenticated
  using (public.user_can_access_client_content(client_id, auth.uid()))
  with check (public.user_can_access_client_content(client_id, auth.uid()));

drop policy if exists development_evidence_documents_delete
  on public.development_evidence_documents;
create policy development_evidence_documents_delete
  on public.development_evidence_documents
  for delete to authenticated
  using (public.user_can_access_client_content(client_id, auth.uid()));

-- Observations
drop policy if exists development_evidence_observations_select
  on public.development_evidence_observations;
create policy development_evidence_observations_select
  on public.development_evidence_observations
  for select to authenticated
  using (public.user_can_access_client_content(client_id, auth.uid()));

drop policy if exists development_evidence_observations_insert
  on public.development_evidence_observations;
create policy development_evidence_observations_insert
  on public.development_evidence_observations
  for insert to authenticated
  with check (public.user_can_access_client_content(client_id, auth.uid()));

drop policy if exists development_evidence_observations_update
  on public.development_evidence_observations;
create policy development_evidence_observations_update
  on public.development_evidence_observations
  for update to authenticated
  using (public.user_can_access_client_content(client_id, auth.uid()))
  with check (public.user_can_access_client_content(client_id, auth.uid()));

drop policy if exists development_evidence_observations_delete
  on public.development_evidence_observations;
create policy development_evidence_observations_delete
  on public.development_evidence_observations
  for delete to authenticated
  using (public.user_can_access_client_content(client_id, auth.uid()));

-- Links
drop policy if exists development_evidence_links_select
  on public.development_evidence_links;
create policy development_evidence_links_select
  on public.development_evidence_links
  for select to authenticated
  using (public.user_can_access_client_content(client_id, auth.uid()));

drop policy if exists development_evidence_links_write
  on public.development_evidence_links;
create policy development_evidence_links_write
  on public.development_evidence_links
  for all to authenticated
  using (public.user_can_access_client_content(client_id, auth.uid()))
  with check (public.user_can_access_client_content(client_id, auth.uid()));

-- Organisation frameworks: manage for admins, read for active members
drop policy if exists organisation_frameworks_select on public.organisation_frameworks;
create policy organisation_frameworks_select on public.organisation_frameworks
  for select to authenticated
  using (public.is_active_organisation_member(organisation_id, auth.uid()));

drop policy if exists organisation_frameworks_manage on public.organisation_frameworks;
create policy organisation_frameworks_manage on public.organisation_frameworks
  for all to authenticated
  using (
    public.has_organisation_permission(
      organisation_id, auth.uid(), 'organisation.manage'
    )
  )
  with check (
    public.has_organisation_permission(
      organisation_id, auth.uid(), 'organisation.manage'
    )
  );

drop policy if exists organisation_framework_capabilities_select
  on public.organisation_framework_capabilities;
create policy organisation_framework_capabilities_select
  on public.organisation_framework_capabilities
  for select to authenticated
  using (public.is_active_organisation_member(organisation_id, auth.uid()));

drop policy if exists organisation_framework_capabilities_manage
  on public.organisation_framework_capabilities;
create policy organisation_framework_capabilities_manage
  on public.organisation_framework_capabilities
  for all to authenticated
  using (
    public.has_organisation_permission(
      organisation_id, auth.uid(), 'organisation.manage'
    )
  )
  with check (
    public.has_organisation_permission(
      organisation_id, auth.uid(), 'organisation.manage'
    )
  );

-- Audit: actors can insert for accessible clients; select own org/client access
drop policy if exists development_evidence_audit_select
  on public.development_evidence_audit_log;
create policy development_evidence_audit_select
  on public.development_evidence_audit_log
  for select to authenticated
  using (
    (
      client_id is not null
      and public.user_can_access_client_content(client_id, auth.uid())
    )
    or (
      organisation_id is not null
      and public.has_organisation_permission(
        organisation_id, auth.uid(), 'organisation.view_safe_oversight'
      )
    )
    or actor_user_id = auth.uid()
  );

drop policy if exists development_evidence_audit_insert
  on public.development_evidence_audit_log;
create policy development_evidence_audit_insert
  on public.development_evidence_audit_log
  for insert to authenticated
  with check (
    actor_user_id = auth.uid()
    and (
      client_id is null
      or public.user_can_access_client_content(client_id, auth.uid())
    )
  );

drop policy if exists development_evidence_ai_usage_select
  on public.development_evidence_ai_usage;
create policy development_evidence_ai_usage_select
  on public.development_evidence_ai_usage
  for select to authenticated
  using (
    organisation_id is not null
    and public.has_organisation_permission(
      organisation_id, auth.uid(), 'organisation.view_usage'
    )
  );

drop policy if exists development_evidence_ai_usage_insert
  on public.development_evidence_ai_usage;
create policy development_evidence_ai_usage_insert
  on public.development_evidence_ai_usage
  for insert to authenticated
  with check (
    client_id is null
    or public.user_can_access_client_content(client_id, auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 9. Private storage bucket for original documents (not public)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'development-evidence',
  'development-evidence',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage object path convention: {organisation_id|personal}/{client_id}/{evidence_id}/{filename}
-- Access is mediated by application routes; storage policies require auth and path ownership pattern.
drop policy if exists development_evidence_storage_select on storage.objects;
create policy development_evidence_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'development-evidence'
    and auth.role() = 'authenticated'
  );

drop policy if exists development_evidence_storage_insert on storage.objects;
create policy development_evidence_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'development-evidence'
    and auth.role() = 'authenticated'
  );

drop policy if exists development_evidence_storage_update on storage.objects;
create policy development_evidence_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'development-evidence'
    and auth.role() = 'authenticated'
  )
  with check (
    bucket_id = 'development-evidence'
    and auth.role() = 'authenticated'
  );

drop policy if exists development_evidence_storage_delete on storage.objects;
create policy development_evidence_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'development-evidence'
    and auth.role() = 'authenticated'
  );

-- Application routes must still enforce user_can_access_client_content before
-- issuing signed URLs or streaming document content.
