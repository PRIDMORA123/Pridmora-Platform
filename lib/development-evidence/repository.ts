import type { SupabaseClient } from "@supabase/supabase-js";
import { inferCapabilityKeysFromText } from "@/lib/development-evidence/capabilities";
import {
  EVIDENCE_TYPE_LABELS,
  EXTRACTION_VERSION,
  type DevelopmentEvidenceType,
  type EvidenceAuditAction,
  type EvidenceReviewStatus,
} from "@/lib/development-evidence/constants";
import { calculateEvidenceFreshness } from "@/lib/development-evidence/freshness";
import {
  mapDocumentRow,
  mapEvidenceRow,
  mapLinkRow,
  mapObservationRow,
} from "@/lib/development-evidence/map";
import { validateStructuredPsychometricEvidence } from "@/lib/development-evidence/psychometrics";
import type {
  DevelopmentEvidenceDocument,
  DevelopmentEvidenceLink,
  DevelopmentEvidenceObservation,
  DevelopmentEvidenceRecord,
  EvidenceAuditMetadata,
  StructuredEvidence,
} from "@/lib/development-evidence/types";

async function assertClientAccess(
  supabase: SupabaseClient,
  clientId: string,
  userId: string
): Promise<{ organisationId: string | null; restricted: boolean }> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, organisation_id, identity_mode")
    .eq("id", clientId)
    .maybeSingle();

  if (error || !data?.id) {
    throw new Error("Relationship not found or access denied.");
  }

  // RLS already enforces access; this confirms the row is visible.
  void userId;
  return {
    organisationId: (data.organisation_id as string | null) ?? null,
    restricted: data.identity_mode === "confidential",
  };
}

export async function writeEvidenceAudit(input: {
  supabase: SupabaseClient;
  organisationId: string | null;
  clientId: string | null;
  evidenceId: string | null;
  actorUserId: string;
  action: EvidenceAuditAction;
  metadata?: EvidenceAuditMetadata;
}): Promise<void> {
  // Metadata must never contain raw evidence content.
  const safeMetadata = { ...(input.metadata ?? {}) };
  delete (safeMetadata as { rawText?: string }).rawText;
  delete (safeMetadata as { extractedText?: string }).extractedText;

  const { error } = await input.supabase
    .from("development_evidence_audit_log")
    .insert({
      organisation_id: input.organisationId,
      client_id: input.clientId,
      evidence_id: input.evidenceId,
      actor_user_id: input.actorUserId,
      action: input.action,
      metadata: safeMetadata,
    });

  if (error) {
    console.error("Evidence audit write failed:", error.message);
  }
}

export async function listEvidenceForClient(
  supabase: SupabaseClient,
  userId: string,
  clientId: string
): Promise<DevelopmentEvidenceRecord[]> {
  await assertClientAccess(supabase, clientId, userId);

  const { data, error } = await supabase
    .from("development_evidence")
    .select("*")
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("evidence_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Unable to load development evidence.");
  }

  return (data ?? []).map(row => mapEvidenceRow(row as Record<string, unknown>));
}

export async function getEvidenceById(
  supabase: SupabaseClient,
  userId: string,
  evidenceId: string
): Promise<{
  evidence: DevelopmentEvidenceRecord;
  observations: DevelopmentEvidenceObservation[];
  document: DevelopmentEvidenceDocument | null;
  links: DevelopmentEvidenceLink[];
}> {
  const { data, error } = await supabase
    .from("development_evidence")
    .select("*")
    .eq("id", evidenceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Evidence not found or access denied.");
  }

  const evidence = mapEvidenceRow(data as Record<string, unknown>);
  await assertClientAccess(supabase, evidence.clientId, userId);

  const [observationsResult, documentResult, linksResult] = await Promise.all([
    supabase
      .from("development_evidence_observations")
      .select("*")
      .eq("evidence_id", evidenceId)
      .order("sort_order", { ascending: true }),
    evidence.originalDocumentId
      ? supabase
          .from("development_evidence_documents")
          .select("*")
          .eq("id", evidence.originalDocumentId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("development_evidence_links")
      .select("*")
      .eq("from_evidence_id", evidenceId),
  ]);

  await writeEvidenceAudit({
    supabase,
    organisationId: evidence.organisationId,
    clientId: evidence.clientId,
    evidenceId: evidence.id,
    actorUserId: userId,
    action: "evidence_viewed",
    metadata: {
      evidenceType: evidence.evidenceType,
      reviewStatus: evidence.reviewStatus,
    },
  });

  return {
    evidence,
    observations: (observationsResult.data ?? []).map(row =>
      mapObservationRow(row as Record<string, unknown>)
    ),
    document: documentResult.data
      ? mapDocumentRow(documentResult.data as Record<string, unknown>)
      : null,
    links: (linksResult.data ?? []).map(row =>
      mapLinkRow(row as Record<string, unknown>)
    ),
  };
}

export async function createUploadedEvidence(input: {
  supabase: SupabaseClient;
  userId: string;
  clientId: string;
  evidenceType: DevelopmentEvidenceType;
  title: string;
  evidenceDate?: string | null;
  purpose?: string | null;
  sourceLabel?: string | null;
  fileName: string;
  mimeType: string;
  byteSize: number;
  contentHash: string;
  extractedText: string | null;
  extractionMethod: string | null;
  extractionStatus: "extracted" | "failed" | "unsupported" | "pending";
  storagePath?: string | null;
}): Promise<{
  evidence: DevelopmentEvidenceRecord;
  document: DevelopmentEvidenceDocument;
}> {
  const access = await assertClientAccess(
    input.supabase,
    input.clientId,
    input.userId
  );

  const freshnessClass = calculateEvidenceFreshness({
    evidenceType: input.evidenceType,
    evidenceDate: input.evidenceDate,
  });

  const { data: documentRow, error: documentError } = await input.supabase
    .from("development_evidence_documents")
    .insert({
      organisation_id: access.organisationId,
      client_id: input.clientId,
      file_name: input.fileName,
      mime_type: input.mimeType,
      byte_size: input.byteSize,
      content_hash: input.contentHash,
      storage_path: input.storagePath ?? null,
      extracted_text: input.extractedText,
      extraction_method: input.extractionMethod,
      extraction_version: EXTRACTION_VERSION,
      extraction_status: input.extractionStatus,
      uploaded_by: input.userId,
    })
    .select("*")
    .single();

  if (documentError || !documentRow) {
    throw new Error("Unable to store evidence document.");
  }

  const document = mapDocumentRow(documentRow as Record<string, unknown>);

  const { data: evidenceRow, error: evidenceError } = await input.supabase
    .from("development_evidence")
    .insert({
      organisation_id: access.organisationId,
      client_id: input.clientId,
      evidence_type: input.evidenceType,
      source_type: "uploaded_document",
      title: input.title || EVIDENCE_TYPE_LABELS[input.evidenceType],
      evidence_date: input.evidenceDate ?? null,
      captured_by: input.userId,
      original_document_id: document.id,
      processing_status:
        input.extractionStatus === "extracted" ? "extracted" : "failed",
      review_status: "pending_review",
      include_in_intelligence: false,
      structured_evidence: {},
      source_summary: null,
      freshness_class: freshnessClass,
      restricted: access.restricted,
      content_hash: input.contentHash,
      extraction_version: EXTRACTION_VERSION,
      purpose: input.purpose ?? null,
      source_label: input.sourceLabel ?? "Uploaded document",
      capability_keys: [],
    })
    .select("*")
    .single();

  if (evidenceError || !evidenceRow) {
    throw new Error("Unable to create evidence record.");
  }

  await input.supabase
    .from("development_evidence_documents")
    .update({ evidence_id: evidenceRow.id })
    .eq("id", document.id);

  const evidence = mapEvidenceRow(evidenceRow as Record<string, unknown>);

  await writeEvidenceAudit({
    supabase: input.supabase,
    organisationId: access.organisationId,
    clientId: input.clientId,
    evidenceId: evidence.id,
    actorUserId: input.userId,
    action: "evidence_uploaded",
    metadata: {
      evidenceType: evidence.evidenceType,
      fileName: input.fileName,
      contentHashPrefix: input.contentHash.slice(0, 12),
      processingStatus: evidence.processingStatus,
    },
  });

  return {
    evidence,
    document: { ...document, evidenceId: evidence.id },
  };
}

/** Mark uploaded evidence as failed analysis without deleting the document. */
export async function markEvidenceAnalysisFailed(input: {
  supabase: SupabaseClient;
  evidenceId: string;
}): Promise<void> {
  const { error } = await input.supabase
    .from("development_evidence")
    .update({
      processing_status: "failed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.evidenceId)
    .is("deleted_at", null);

  if (error) {
    console.error("Unable to mark evidence analysis failed:", error.message);
  }
}

export async function saveAnalysedEvidence(input: {
  supabase: SupabaseClient;
  userId: string;
  evidenceId: string;
  structured: StructuredEvidence;
  sourceSummary?: string | null;
}): Promise<{
  evidence: DevelopmentEvidenceRecord;
  observations: DevelopmentEvidenceObservation[];
}> {
  const current = await getEvidenceById(
    input.supabase,
    input.userId,
    input.evidenceId
  );

  const structured = validateStructuredPsychometricEvidence(
    current.evidence.evidenceType,
    input.structured
  );

  const capabilityKeys = Array.from(
    new Set([
      ...inferCapabilityKeysFromText(
        [
          input.sourceSummary ?? "",
          ...(structured.observations ?? []).map(
            item => `${item.title} ${item.description}`
          ),
          ...(structured.capabilitySignals ?? []),
        ].join(" ")
      ),
      ...((structured.observations ?? [])
        .map(item => item.capabilityKey)
        .filter((value): value is string => Boolean(value)) ?? []),
    ])
  );

  const { data, error } = await input.supabase
    .from("development_evidence")
    .update({
      structured_evidence: structured,
      source_summary: input.sourceSummary ?? current.evidence.sourceSummary,
      processing_status: "ready",
      review_status: "pending_review",
      include_in_intelligence: false,
      capability_keys: capabilityKeys,
      freshness_class: calculateEvidenceFreshness({
        evidenceType: current.evidence.evidenceType,
        evidenceDate: current.evidence.evidenceDate,
        capturedAt: current.evidence.capturedAt,
      }),
    })
    .eq("id", input.evidenceId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error("Unable to save analysed evidence.");
  }

  await input.supabase
    .from("development_evidence_observations")
    .delete()
    .eq("evidence_id", input.evidenceId);

  const observationRows = (structured.observations ?? []).map(
    (observation, index) => ({
      evidence_id: input.evidenceId,
      organisation_id: current.evidence.organisationId,
      client_id: current.evidence.clientId,
      title: observation.title,
      description: observation.description,
      category: observation.category ?? null,
      behavioural_evidence: observation.behaviouralEvidence ?? null,
      development_implication: observation.developmentImplication ?? null,
      source_confidence: observation.sourceConfidence ?? "medium",
      assessment_context: observation.assessmentContext ?? null,
      limitations: observation.limitations ?? null,
      capability_key: observation.capabilityKey ?? null,
      include_in_intelligence: false,
      review_status: "proposed",
      sort_order: index,
    })
  );

  let observations: DevelopmentEvidenceObservation[] = [];
  if (observationRows.length > 0) {
    const { data: inserted, error: insertError } = await input.supabase
      .from("development_evidence_observations")
      .insert(observationRows)
      .select("*");
    if (insertError) {
      throw new Error("Unable to save evidence observations.");
    }
    observations = (inserted ?? []).map(row =>
      mapObservationRow(row as Record<string, unknown>)
    );
  }

  await writeEvidenceAudit({
    supabase: input.supabase,
    organisationId: current.evidence.organisationId,
    clientId: current.evidence.clientId,
    evidenceId: input.evidenceId,
    actorUserId: input.userId,
    action: "evidence_processed",
    metadata: {
      evidenceType: current.evidence.evidenceType,
      observationCount: observations.length,
      processingStatus: "ready",
    },
  });

  return {
    evidence: mapEvidenceRow(data as Record<string, unknown>),
    observations,
  };
}

export async function reviewEvidence(input: {
  supabase: SupabaseClient;
  userId: string;
  evidenceId: string;
  decision: "approve" | "reject" | "exclude";
  includeInIntelligence?: boolean;
  observationDecisions?: Array<{
    observationId: string;
    reviewStatus: "approved" | "edited" | "rejected" | "excluded";
    title?: string;
    description?: string;
    includeInIntelligence?: boolean;
  }>;
  editedSummary?: string | null;
}): Promise<{
  evidence: DevelopmentEvidenceRecord;
  observations: DevelopmentEvidenceObservation[];
}> {
  const current = await getEvidenceById(
    input.supabase,
    input.userId,
    input.evidenceId
  );

  for (const decision of input.observationDecisions ?? []) {
    const patch: Record<string, unknown> = {
      review_status: decision.reviewStatus,
      include_in_intelligence:
        decision.includeInIntelligence ??
        (decision.reviewStatus === "approved" ||
          decision.reviewStatus === "edited"),
    };
    if (decision.title !== undefined) patch.title = decision.title;
    if (decision.description !== undefined) {
      patch.description = decision.description;
    }

    const { error } = await input.supabase
      .from("development_evidence_observations")
      .update(patch)
      .eq("id", decision.observationId)
      .eq("evidence_id", input.evidenceId);

    if (error) {
      throw new Error("Unable to update observation review.");
    }
  }

  let reviewStatus: EvidenceReviewStatus = "approved";
  let include = input.includeInIntelligence ?? true;

  if (input.decision === "reject") {
    reviewStatus = "rejected";
    include = false;
  } else if (input.decision === "exclude") {
    reviewStatus = "excluded";
    include = false;
  } else if ((input.observationDecisions ?? []).some(item => item.title || item.description)) {
    reviewStatus = "edited";
  }

  const { data, error } = await input.supabase
    .from("development_evidence")
    .update({
      review_status: reviewStatus,
      include_in_intelligence: include,
      source_summary:
        input.editedSummary ?? current.evidence.sourceSummary,
    })
    .eq("id", input.evidenceId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error("Unable to save evidence review.");
  }

  // Rebuild capability links for approved evidence
  if (include) {
    await rebuildCapabilityLinks(
      input.supabase,
      mapEvidenceRow(data as Record<string, unknown>)
    );
  } else {
    await input.supabase
      .from("development_evidence_links")
      .delete()
      .eq("from_evidence_id", input.evidenceId);
  }

  const refreshed = await getEvidenceById(
    input.supabase,
    input.userId,
    input.evidenceId
  );

  await writeEvidenceAudit({
    supabase: input.supabase,
    organisationId: refreshed.evidence.organisationId,
    clientId: refreshed.evidence.clientId,
    evidenceId: input.evidenceId,
    actorUserId: input.userId,
    action: include ? "evidence_included" : "evidence_excluded",
    metadata: {
      reviewStatus,
      includeInIntelligence: include,
      observationCount: refreshed.observations.length,
    },
  });

  await writeEvidenceAudit({
    supabase: input.supabase,
    organisationId: refreshed.evidence.organisationId,
    clientId: refreshed.evidence.clientId,
    evidenceId: input.evidenceId,
    actorUserId: input.userId,
    action: "evidence_reviewed",
    metadata: { reviewStatus },
  });

  return {
    evidence: refreshed.evidence,
    observations: refreshed.observations,
  };
}

async function rebuildCapabilityLinks(
  supabase: SupabaseClient,
  evidence: DevelopmentEvidenceRecord
): Promise<void> {
  await supabase
    .from("development_evidence_links")
    .delete()
    .eq("from_evidence_id", evidence.id)
    .eq("link_type", "supports");

  if (evidence.capabilityKeys.length === 0) return;

  const rows = evidence.capabilityKeys.map(capabilityKey => ({
    organisation_id: evidence.organisationId,
    client_id: evidence.clientId,
    from_evidence_id: evidence.id,
    capability_key: capabilityKey,
    link_type: "supports",
    label: EVIDENCE_TYPE_LABELS[evidence.evidenceType],
  }));

  await supabase.from("development_evidence_links").insert(rows);
}

export async function softDeleteEvidence(input: {
  supabase: SupabaseClient;
  userId: string;
  evidenceId: string;
}): Promise<void> {
  const current = await getEvidenceById(
    input.supabase,
    input.userId,
    input.evidenceId
  );

  const now = new Date().toISOString();

  await input.supabase
    .from("development_evidence")
    .update({
      deleted_at: now,
      include_in_intelligence: false,
      review_status: "excluded",
    })
    .eq("id", input.evidenceId);

  if (current.document) {
    await input.supabase
      .from("development_evidence_documents")
      .update({
        deleted_at: now,
        extracted_text: null,
      })
      .eq("id", current.document.id);
  }

  await input.supabase
    .from("development_evidence_observations")
    .update({
      include_in_intelligence: false,
      review_status: "excluded",
    })
    .eq("evidence_id", input.evidenceId);

  await input.supabase
    .from("development_evidence_links")
    .delete()
    .eq("from_evidence_id", input.evidenceId);

  await writeEvidenceAudit({
    supabase: input.supabase,
    organisationId: current.evidence.organisationId,
    clientId: current.evidence.clientId,
    evidenceId: input.evidenceId,
    actorUserId: input.userId,
    action: "evidence_deleted",
    metadata: {
      evidenceType: current.evidence.evidenceType,
      includeInIntelligence: false,
    },
  });
}

export async function findExistingByContentHash(input: {
  supabase: SupabaseClient;
  clientId: string;
  contentHash: string;
}): Promise<DevelopmentEvidenceRecord | null> {
  const { data } = await input.supabase
    .from("development_evidence")
    .select("*")
    .eq("client_id", input.clientId)
    .eq("content_hash", input.contentHash)
    .is("deleted_at", null)
    .maybeSingle();

  return data ? mapEvidenceRow(data as Record<string, unknown>) : null;
}

export async function createInternalEvidenceReference(input: {
  supabase: SupabaseClient;
  userId: string;
  clientId: string;
  evidenceType: DevelopmentEvidenceType;
  sourceRecordId: string;
  title: string;
  evidenceDate?: string | null;
  sourceSummary?: string | null;
  capabilityKeys?: string[];
  includeInIntelligence?: boolean;
}): Promise<DevelopmentEvidenceRecord> {
  const access = await assertClientAccess(
    input.supabase,
    input.clientId,
    input.userId
  );

  const { data: existing } = await input.supabase
    .from("development_evidence")
    .select("*")
    .eq("client_id", input.clientId)
    .eq("source_type", "internal_reference")
    .eq("source_record_id", input.sourceRecordId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    return mapEvidenceRow(existing as Record<string, unknown>);
  }

  const { data, error } = await input.supabase
    .from("development_evidence")
    .insert({
      organisation_id: access.organisationId,
      client_id: input.clientId,
      evidence_type: input.evidenceType,
      source_type: "internal_reference",
      source_record_id: input.sourceRecordId,
      title: input.title,
      evidence_date: input.evidenceDate ?? null,
      captured_by: input.userId,
      processing_status: "ready",
      review_status: "approved",
      include_in_intelligence: input.includeInIntelligence ?? true,
      structured_evidence: {},
      source_summary: input.sourceSummary ?? null,
      freshness_class: calculateEvidenceFreshness({
        evidenceType: input.evidenceType,
        evidenceDate: input.evidenceDate,
      }),
      restricted: access.restricted,
      source_label: "Internal record",
      capability_keys: input.capabilityKeys ?? [],
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error("Unable to create internal evidence reference.");
  }

  return mapEvidenceRow(data as Record<string, unknown>);
}

export async function recordEvidenceAiUsage(input: {
  supabase: SupabaseClient;
  organisationId: string | null;
  clientId: string | null;
  evidenceId: string | null;
  usageKind:
    | "evidence_processing"
    | "development_generation"
    | "organisation_intelligence"
    | "team_intelligence";
  model?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  contentHash?: string | null;
}): Promise<void> {
  await input.supabase.from("development_evidence_ai_usage").insert({
    organisation_id: input.organisationId,
    client_id: input.clientId,
    evidence_id: input.evidenceId,
    usage_kind: input.usageKind,
    model: input.model ?? null,
    prompt_tokens: input.promptTokens ?? null,
    completion_tokens: input.completionTokens ?? null,
    content_hash: input.contentHash ?? null,
  });
}
