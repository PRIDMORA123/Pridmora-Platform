import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OrganisationGuidanceRecord,
  OrganisationGuidanceStatus,
  OrganisationGuidanceType,
} from "@/lib/organisation-guidance/types";

type OrganisationGuidanceRow = {
  id: string;
  organisation_id: string;
  guidance_type: string;
  title: string;
  version_label: string | null;
  effective_from: string | null;
  review_date: string | null;
  status: string;
  original_file_name: string;
  mime_type: string;
  file_size_bytes: number;
  content_hash: string;
  storage_path: string;
  extracted_text: string | null;
  extraction_method: string | null;
  uploaded_by: string;
  approved_by: string | null;
  approved_at: string | null;
  withdrawn_by: string | null;
  withdrawn_at: string | null;
  replaces_guidance_id: string | null;
  created_at: string;
  updated_at: string;
};

const GUIDANCE_SELECT =
  "id, organisation_id, guidance_type, title, version_label, effective_from, review_date, status, original_file_name, mime_type, file_size_bytes, content_hash, storage_path, extracted_text, extraction_method, uploaded_by, approved_by, approved_at, withdrawn_by, withdrawn_at, replaces_guidance_id, created_at, updated_at";

function mapGuidance(row: OrganisationGuidanceRow): OrganisationGuidanceRecord {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    guidanceType: row.guidance_type as OrganisationGuidanceType,
    title: row.title,
    versionLabel: row.version_label,
    effectiveFrom: row.effective_from,
    reviewDate: row.review_date,
    status: row.status as OrganisationGuidanceStatus,
    originalFileName: row.original_file_name,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    contentHash: row.content_hash,
    storagePath: row.storage_path,
    extractionMethod: row.extraction_method,
    uploadedBy: row.uploaded_by,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    withdrawnBy: row.withdrawn_by,
    withdrawnAt: row.withdrawn_at,
    replacesGuidanceId: row.replaces_guidance_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listOrganisationGuidance(input: {
  supabase: SupabaseClient;
  organisationId: string;
}): Promise<OrganisationGuidanceRecord[]> {
  const { data, error } = await input.supabase
    .from("organisation_guidance")
    .select(GUIDANCE_SELECT)
    .eq("organisation_id", input.organisationId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return ((data ?? []) as OrganisationGuidanceRow[]).map(mapGuidance);
}

export async function createOrganisationGuidanceDraft(input: {
  supabase: SupabaseClient;
  id: string;
  organisationId: string;
  userId: string;
  guidanceType: OrganisationGuidanceType;
  title: string;
  versionLabel: string | null;
  effectiveFrom: string | null;
  reviewDate: string | null;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  contentHash: string;
  storagePath: string;
  replacesGuidanceId?: string | null;
}): Promise<OrganisationGuidanceRecord> {
  const now = new Date().toISOString();

  const { data, error } = await input.supabase
    .from("organisation_guidance")
    .insert({
      id: input.id,
      organisation_id: input.organisationId,
      guidance_type: input.guidanceType,
      title: input.title,
      version_label: input.versionLabel,
      effective_from: input.effectiveFrom,
      review_date: input.reviewDate,
      status: "draft",
      original_file_name: input.originalFileName,
      mime_type: input.mimeType,
      file_size_bytes: input.fileSizeBytes,
      content_hash: input.contentHash,
      storage_path: input.storagePath,
      extracted_text: null,
      extraction_method: null,
      uploaded_by: input.userId,
      approved_by: null,
      approved_at: null,
      withdrawn_by: null,
      withdrawn_at: null,
      replaces_guidance_id: input.replacesGuidanceId ?? null,
      updated_at: now,
    })
    .select(GUIDANCE_SELECT)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to create organisation guidance.");
  }

  return mapGuidance(data as OrganisationGuidanceRow);
}

export async function updateOrganisationGuidanceExtraction(input: {
  supabase: SupabaseClient;
  organisationId: string;
  guidanceId: string;
  extractedText: string;
  extractionMethod: string;
}): Promise<void> {
  const { data, error } = await input.supabase
    .from("organisation_guidance")
    .update({
      extracted_text: input.extractedText,
      extraction_method: input.extractionMethod,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.guidanceId)
    .eq("organisation_id", input.organisationId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Organisation guidance was not found.");
}

export async function approveOrganisationGuidance(input: {
  supabase: SupabaseClient;
  organisationId: string;
  guidanceId: string;
  userId: string;
}): Promise<void> {
  const now = new Date().toISOString();

  const { data, error } = await input.supabase
    .from("organisation_guidance")
    .update({
      status: "approved",
      approved_by: input.userId,
      approved_at: now,
      withdrawn_by: null,
      withdrawn_at: null,
      updated_at: now,
    })
    .eq("id", input.guidanceId)
    .eq("organisation_id", input.organisationId)
    .eq("status", "draft")
    .not("extracted_text", "is", null)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error(
      "Only a readable draft can be approved for Aurelia."
    );
  }
}

export async function withdrawOrganisationGuidance(input: {
  supabase: SupabaseClient;
  organisationId: string;
  guidanceId: string;
  userId: string;
}): Promise<void> {
  const now = new Date().toISOString();

  const { data, error } = await input.supabase
    .from("organisation_guidance")
    .update({
      status: "withdrawn",
      withdrawn_by: input.userId,
      withdrawn_at: now,
      updated_at: now,
    })
    .eq("id", input.guidanceId)
    .eq("organisation_id", input.organisationId)
    .eq("status", "approved")
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error("Only approved organisation guidance can be withdrawn.");
  }
}
