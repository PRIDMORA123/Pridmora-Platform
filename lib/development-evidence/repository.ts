import type { SupabaseClient } from "@supabase/supabase-js";
import { pruneStructuredEvidenceToAuthorisedObservations, authorisedCapabilityKeysFromObservations, reviewedCapabilityKeyFromDecision, capabilityReviewDecisionOutcome } from "@/lib/development-evidence/authorised-observations";
import { buildCapabilityInferenceCorpus, inferCapabilityKeysFromText, isPridmoraCapabilityKey, mapToPridmoraCapabilityKey } from "@/lib/development-evidence/capabilities";
import {
  EVIDENCE_TYPE_LABELS,
  EXTRACTION_VERSION,
  type DevelopmentEvidenceType,
  type EvidenceAuditAction,
  type EvidenceReviewStatus,
} from "@/lib/development-evidence/constants";
import { constrainStructuredEvidenceObservations } from "@/lib/development-evidence/constrain-observations";
import { calculateEvidenceFreshness } from "@/lib/development-evidence/freshness";
import {
  mapDocumentRow,
  mapEvidenceRow,
  mapLinkRow,
  mapObservationRow,
} from "@/lib/development-evidence/map";
import { validateStructuredPsychometricEvidence } from "@/lib/development-evidence/psychometrics";
import {
  DEVELOPMENT_EVIDENCE_STORAGE_BUCKET,
  assertDevelopmentEvidenceStoragePathMatches,
} from "@/lib/development-evidence/storage-path";
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

  const storagePath = input.storagePath?.trim() || null;
  if (storagePath) {
    assertDevelopmentEvidenceStoragePathMatches({
      storagePath,
      organisationId: access.organisationId,
      clientId: input.clientId,
    });
  }

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
      storage_path: storagePath,
      extracted_text: input.extractedText,
      extraction_method: input.extractionMethod,
      extraction_version: EXTRACTION_VERSION,
      extraction_status: input.extractionStatus,
      uploaded_by: input.userId,
    })
    .select("*")
    .single();

  if (documentError || !documentRow) {
    throw new Error(
      documentError?.message?.trim() || "Unable to store evidence document."
    );
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
        input.extractionStatus === "extracted"
          ? "extracted"
          : input.extractionStatus === "pending"
            ? "uploaded"
            : "failed",
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
    throw new Error(
      evidenceError?.message?.trim() || "Unable to create evidence record."
    );
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

/** Persist extraction results after the evidence/document rows already exist. */
export async function updateDocumentExtraction(input: {
  supabase: SupabaseClient;
  documentId: string;
  evidenceId: string;
  extractedText: string | null;
  extractionMethod: string | null;
  extractionStatus: "extracted" | "failed" | "unsupported" | "pending";
}): Promise<void> {
  const { error: documentError } = await input.supabase
    .from("development_evidence_documents")
    .update({
      extracted_text: input.extractedText,
      extraction_method: input.extractionMethod,
      extraction_status: input.extractionStatus,
      extraction_version: EXTRACTION_VERSION,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.documentId);

  if (documentError) {
    throw new Error(
      documentError.message || "Unable to update extracted document text."
    );
  }

  const { error: evidenceError } = await input.supabase
    .from("development_evidence")
    .update({
      processing_status:
        input.extractionStatus === "extracted" ? "extracted" : "failed",
      extraction_version: EXTRACTION_VERSION,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.evidenceId)
    .is("deleted_at", null);

  if (evidenceError) {
    throw new Error(
      evidenceError.message || "Unable to update evidence extraction status."
    );
  }
}

/** Mark uploaded evidence as failed analysis without deleting the document. */
export async function markEvidenceAnalysisFailed(input: {
  supabase: SupabaseClient;
  evidenceId: string;
  /** When set, records that failure left intelligence excluded. */
  actorUserId?: string;
  /** Optional analyse-attempt diagnostics (elapsed, finish reason, tokens). */
  analysisDiagnostics?: Record<string, unknown>;
}): Promise<void> {
  const { data: current } = await input.supabase
    .from("development_evidence")
    .select(
      "organisation_id, client_id, review_status, include_in_intelligence, capability_keys, processing_status"
    )
    .eq("id", input.evidenceId)
    .is("deleted_at", null)
    .maybeSingle();

  const { error } = await input.supabase
    .from("development_evidence")
    .update({
      processing_status: "failed",
      // Failed analysis must never remain intelligence-authorised.
      include_in_intelligence: false,
      review_status: "pending_review",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.evidenceId)
    .is("deleted_at", null);

  if (error) {
    console.error("Unable to mark evidence analysis failed:", error.message);
    return;
  }

  await input.supabase
    .from("development_evidence_observations")
    .update({
      include_in_intelligence: false,
      review_status: "proposed",
    })
    .eq("evidence_id", input.evidenceId);

  await input.supabase
    .from("development_evidence_links")
    .delete()
    .eq("from_evidence_id", input.evidenceId)
    .eq("link_type", "supports");

  if (input.actorUserId && current) {
    await writeEvidenceAudit({
      supabase: input.supabase,
      organisationId: (current.organisation_id as string | null) ?? null,
      clientId: (current.client_id as string | null) ?? null,
      evidenceId: input.evidenceId,
      actorUserId: input.actorUserId,
      action: "evidence_excluded",
      metadata: {
        reason: "reanalysis_failed",
        previousReviewStatus: String(current.review_status ?? ""),
        previousIncludeInIntelligence: Boolean(current.include_in_intelligence),
        previousCapabilityKeys: Array.isArray(current.capability_keys)
          ? (current.capability_keys as string[])
          : [],
        previousProcessingStatus: String(current.processing_status ?? ""),
        processingStatus: "failed",
        reviewStatus: "pending_review",
        includeInIntelligence: false,
        ...(input.analysisDiagnostics
          ? { analysisDiagnostics: input.analysisDiagnostics }
          : {}),
      },
    });
  }
}

/**
 * Begin an analysis run that may replace prior results.
 * Immediately withdraws any prior intelligence authorisation so MDI cannot
 * keep consuming previously approved capability keys while re-analysis is
 * in flight or if it later fails.
 * Historical audit rows are preserved; a new evidence_excluded row is appended
 * when prior authorisation existed.
 */
export async function beginEvidenceAnalysisRun(input: {
  supabase: SupabaseClient;
  userId: string;
  evidenceId: string;
  force?: boolean;
}): Promise<{
  invalidatedPriorAuthorisation: boolean;
}> {
  const detail = await getEvidenceById(
    input.supabase,
    input.userId,
    input.evidenceId
  );

  const previousReviewStatus = detail.evidence.reviewStatus;
  const previousInclude = detail.evidence.includeInIntelligence;
  const previousCapabilityKeys = [...detail.evidence.capabilityKeys];
  const previousProcessingStatus = detail.evidence.processingStatus;
  const hadAuthorisation =
    previousInclude ||
    previousReviewStatus === "approved" ||
    previousReviewStatus === "edited";

  const { error } = await input.supabase
    .from("development_evidence")
    .update({
      processing_status: "analysing",
      include_in_intelligence: false,
      review_status: "pending_review",
      // Clear authorised keys so MDI cannot read stale capabilities.
      capability_keys: [],
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.evidenceId)
    .is("deleted_at", null);

  if (error) {
    throw new Error("Unable to begin evidence analysis.");
  }

  await input.supabase
    .from("development_evidence_observations")
    .update({
      include_in_intelligence: false,
      review_status: "proposed",
    })
    .eq("evidence_id", input.evidenceId);

  await input.supabase
    .from("development_evidence_links")
    .delete()
    .eq("from_evidence_id", input.evidenceId)
    .eq("link_type", "supports");

  if (hadAuthorisation) {
    await writeEvidenceAudit({
      supabase: input.supabase,
      organisationId: detail.evidence.organisationId,
      clientId: detail.evidence.clientId,
      evidenceId: input.evidenceId,
      actorUserId: input.userId,
      action: "evidence_excluded",
      metadata: {
        reason: "reanalysis_started",
        force: Boolean(input.force),
        previousReviewStatus,
        previousIncludeInIntelligence: previousInclude,
        previousCapabilityKeys,
        previousProcessingStatus,
        processingStatus: "analysing",
        reviewStatus: "pending_review",
        includeInIntelligence: false,
      },
    });
  }

  return { invalidatedPriorAuthorisation: hadAuthorisation };
}

export async function saveAnalysedEvidence(input: {
  supabase: SupabaseClient;
  userId: string;
  evidenceId: string;
  structured: StructuredEvidence;
  sourceSummary?: string | null;
  /** Authorised extracted source text already cleared for analysis (bounded at inference). */
  extractedSourceText?: string | null;
  /** Optional analyse-attempt diagnostics (elapsed, finish reason, tokens). */
  analysisDiagnostics?: Record<string, unknown>;
}): Promise<{
  evidence: DevelopmentEvidenceRecord;
  observations: DevelopmentEvidenceObservation[];
}> {
  const current = await getEvidenceById(
    input.supabase,
    input.userId,
    input.evidenceId
  );

  const structured = constrainStructuredEvidenceObservations(
    validateStructuredPsychometricEvidence(
      current.evidence.evidenceType,
      input.structured
    ),
    current.evidence.evidenceType
  );

  const hasUsableObservation = (structured.observations ?? []).some(
    observation =>
      String(observation.title ?? "").trim().length > 0 &&
      String(observation.description ?? "").trim().length > 0
  );
  if (!hasUsableObservation) {
    throw new Error(
      "Cannot save analysed evidence without usable observations."
    );
  }

  const authorisedExtractedText =
    input.extractedSourceText ??
    current.document?.extractedText ??
    null;

  const capabilityKeys = Array.from(
    new Set([
      ...inferCapabilityKeysFromText(
        buildCapabilityInferenceCorpus({
          sourceSummary: input.sourceSummary,
          observations: structured.observations,
          capabilitySignals: structured.capabilitySignals,
          extractedSourceText: authorisedExtractedText,
        })
      ),
      ...((structured.observations ?? [])
        .map(item => mapToPridmoraCapabilityKey(item.capabilityKey))
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
      capability_key: mapToPridmoraCapabilityKey(observation.capabilityKey),
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
      proposedCapabilityKeys: (structured.observations ?? [])
        .map(item => item.capabilityKey)
        .filter((value): value is string =>
          Boolean(value && isPridmoraCapabilityKey(value))
        ),
      ...(input.analysisDiagnostics
        ? { analysisDiagnostics: input.analysisDiagnostics }
        : {}),
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
    /** When present, set/clear observation capability (catalogue keys only; null clears). */
    capabilityKey?: string | null;
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

  const observationById = new Map(
    current.observations.map(observation => [observation.id, observation])
  );
  const capabilityDecisions: NonNullable<
    EvidenceAuditMetadata["capabilityDecisions"]
  > = [];
  let capabilityEdited = false;

  for (const decision of input.observationDecisions ?? []) {
    const existing = observationById.get(decision.observationId);
    if (!existing) {
      throw new Error("Observation not found for this evidence.");
    }

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

    const reviewedCapabilityKey = reviewedCapabilityKeyFromDecision({
      decision,
      existingCapabilityKey: existing.capabilityKey,
    });
    if (Object.prototype.hasOwnProperty.call(decision, "capabilityKey")) {
      patch.capability_key = reviewedCapabilityKey;
      if (reviewedCapabilityKey !== existing.capabilityKey) {
        capabilityEdited = true;
      }
    }

    const outcome = capabilityReviewDecisionOutcome({
      proposedCapabilityKey: existing.capabilityKey,
      reviewedCapabilityKey,
    });
    capabilityDecisions.push({
      observationId: decision.observationId,
      proposedCapabilityKey: existing.capabilityKey,
      reviewedCapabilityKey,
      outcome,
    });

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
  } else if (
    capabilityEdited ||
    (input.observationDecisions ?? []).some(
      item => item.title || item.description
    )
  ) {
    reviewStatus = "edited";
  }

  // Reload observation rows after patches to derive authorised capability_keys.
  const afterObservationUpdates = await getEvidenceById(
    input.supabase,
    input.userId,
    input.evidenceId
  );
  const authorisedCapabilityKeys = authorisedCapabilityKeysFromObservations(
    afterObservationUpdates.observations,
    include
  );
  const prunedStructured = pruneStructuredEvidenceToAuthorisedObservations({
    structured: afterObservationUpdates.evidence.structuredEvidence,
    observations: afterObservationUpdates.observations,
    includeEvidenceInIntelligence: include,
  });

  const { data, error } = await input.supabase
    .from("development_evidence")
    .update({
      review_status: reviewStatus,
      include_in_intelligence: include,
      source_summary:
        input.editedSummary ?? current.evidence.sourceSummary,
      capability_keys: authorisedCapabilityKeys,
      structured_evidence: prunedStructured,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.evidenceId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error("Unable to save evidence review.");
  }

  const prunedEvidence = {
    ...mapEvidenceRow(data as Record<string, unknown>),
    structuredEvidence: prunedStructured,
    capabilityKeys: authorisedCapabilityKeys,
  };

  // Rebuild capability links for approved evidence
  if (include) {
    await rebuildCapabilityLinks(input.supabase, prunedEvidence);
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
      authorisedCapabilityKeys,
    },
  });

  await writeEvidenceAudit({
    supabase: input.supabase,
    organisationId: refreshed.evidence.organisationId,
    clientId: refreshed.evidence.clientId,
    evidenceId: input.evidenceId,
    actorUserId: input.userId,
    action: "evidence_reviewed",
    metadata: {
      reviewStatus,
      capabilityDecisions,
      authorisedCapabilityKeys,
      includeInIntelligence: include,
    },
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

/**
 * Remove the underlying storage object after ownership has already been proven
 * via getEvidenceById / assignment gates. Fail-closed: callers must not clear
 * storage_path unless removed is true or skipped (no object).
 */
export async function removeDevelopmentEvidenceStorageObject(input: {
  supabase: SupabaseClient;
  organisationId: string | null;
  clientId: string;
  storagePath: string | null | undefined;
}): Promise<{ removed: boolean; skipped: boolean; error?: string }> {
  const path = input.storagePath?.trim() ?? "";
  if (!path) {
    return { removed: false, skipped: true };
  }

  try {
    assertDevelopmentEvidenceStoragePathMatches({
      storagePath: path,
      organisationId: input.organisationId,
      clientId: input.clientId,
    });
  } catch (error) {
    return {
      removed: false,
      skipped: false,
      error: error instanceof Error ? error.message : "Invalid storage path.",
    };
  }

  const { error } = await input.supabase.storage
    .from(DEVELOPMENT_EVIDENCE_STORAGE_BUCKET)
    .remove([path]);

  if (error) {
    return { removed: false, skipped: false, error: error.message };
  }
  return { removed: true, skipped: false };
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
  const storagePath = current.document?.storagePath ?? null;

  let storagePathRemoved = false;
  if (storagePath) {
    const removal = await removeDevelopmentEvidenceStorageObject({
      supabase: input.supabase,
      organisationId: current.evidence.organisationId,
      clientId: current.evidence.clientId,
      storagePath,
    });
    if (!removal.removed) {
      const message =
        removal.error?.trim() || "Unable to remove the stored evidence file.";
      console.error("Evidence storage object delete failed:", message);
      throw new Error(message);
    }
    storagePathRemoved = true;
  }

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
        storage_path: null,
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
      storagePathRemoved,
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
