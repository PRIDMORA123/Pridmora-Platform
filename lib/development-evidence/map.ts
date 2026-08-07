import type {
  DevelopmentEvidenceType,
  EvidenceFreshnessClass,
  EvidenceProcessingStatus,
  EvidenceReviewStatus,
  EvidenceSourceType,
  ObservationReviewStatus,
  SourceConfidenceLevel,
} from "@/lib/development-evidence/constants";
import type {
  DevelopmentEvidenceDocument,
  DevelopmentEvidenceLink,
  DevelopmentEvidenceObservation,
  DevelopmentEvidenceRecord,
  StructuredEvidence,
} from "@/lib/development-evidence/types";

type DbEvidence = Record<string, unknown>;

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asStructured(value: unknown): StructuredEvidence {
  if (!value || typeof value !== "object") return {};
  return value as StructuredEvidence;
}

export function mapEvidenceRow(row: DbEvidence): DevelopmentEvidenceRecord {
  return {
    id: asString(row.id),
    organisationId: asNullableString(row.organisation_id),
    clientId: asString(row.client_id),
    evidenceType: asString(row.evidence_type) as DevelopmentEvidenceType,
    sourceType: asString(row.source_type) as EvidenceSourceType,
    sourceRecordId: asNullableString(row.source_record_id),
    title: asString(row.title),
    evidenceDate: asNullableString(row.evidence_date),
    capturedAt: asString(row.captured_at),
    capturedBy: asNullableString(row.captured_by),
    originalDocumentId: asNullableString(row.original_document_id),
    processingStatus: asString(
      row.processing_status,
      "ready"
    ) as EvidenceProcessingStatus,
    reviewStatus: asString(
      row.review_status,
      "pending_review"
    ) as EvidenceReviewStatus,
    includeInIntelligence: asBoolean(row.include_in_intelligence),
    structuredEvidence: asStructured(row.structured_evidence),
    sourceSummary: asNullableString(row.source_summary),
    freshnessClass: asString(
      row.freshness_class,
      "current"
    ) as EvidenceFreshnessClass,
    restricted: asBoolean(row.restricted),
    contentHash: asNullableString(row.content_hash),
    extractionVersion: asNullableString(row.extraction_version),
    purpose: asNullableString(row.purpose),
    sourceLabel: asNullableString(row.source_label),
    capabilityKeys: asStringArray(row.capability_keys),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    deletedAt: asNullableString(row.deleted_at),
  };
}

export function mapObservationRow(
  row: DbEvidence
): DevelopmentEvidenceObservation {
  return {
    id: asString(row.id),
    evidenceId: asString(row.evidence_id),
    organisationId: asNullableString(row.organisation_id),
    clientId: asString(row.client_id),
    title: asString(row.title),
    description: asString(row.description),
    category: asNullableString(row.category),
    behaviouralEvidence: asNullableString(row.behavioural_evidence),
    developmentImplication: asNullableString(row.development_implication),
    sourceConfidence: asString(
      row.source_confidence,
      "medium"
    ) as SourceConfidenceLevel,
    assessmentContext: asNullableString(row.assessment_context),
    limitations: asNullableString(row.limitations),
    capabilityKey: asNullableString(row.capability_key),
    includeInIntelligence: asBoolean(row.include_in_intelligence),
    reviewStatus: asString(
      row.review_status,
      "proposed"
    ) as ObservationReviewStatus,
    sortOrder: typeof row.sort_order === "number" ? row.sort_order : 0,
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

export function mapDocumentRow(row: DbEvidence): DevelopmentEvidenceDocument {
  return {
    id: asString(row.id),
    organisationId: asNullableString(row.organisation_id),
    clientId: asString(row.client_id),
    evidenceId: asNullableString(row.evidence_id),
    fileName: asString(row.file_name),
    mimeType: asString(row.mime_type),
    byteSize: typeof row.byte_size === "number" ? row.byte_size : 0,
    contentHash: asString(row.content_hash),
    storagePath: asNullableString(row.storage_path),
    extractedText: asNullableString(row.extracted_text),
    extractionMethod: asNullableString(row.extraction_method),
    extractionVersion: asString(row.extraction_version, "v1"),
    extractionStatus: asString(row.extraction_status, "pending") as
      | "pending"
      | "extracted"
      | "failed"
      | "unsupported",
    uploadedBy: asNullableString(row.uploaded_by),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    deletedAt: asNullableString(row.deleted_at),
  };
}

export function mapLinkRow(row: DbEvidence): DevelopmentEvidenceLink {
  return {
    id: asString(row.id),
    organisationId: asNullableString(row.organisation_id),
    clientId: asString(row.client_id),
    fromEvidenceId: asString(row.from_evidence_id),
    toEvidenceId: asNullableString(row.to_evidence_id),
    capabilityKey: asNullableString(row.capability_key),
    linkType: asString(row.link_type, "supports") as DevelopmentEvidenceLink["linkType"],
    label: asNullableString(row.label),
    createdAt: asString(row.created_at),
  };
}
