/**
 * DATA-LIFECYCLE DL-03 foundation types only.
 * Does not execute freeze, commercial copy, purge, storage cleanup, or verification.
 */

export const ORGANISATION_DELETION_RUN_STATUSES = [
  "pending_freeze",
  "frozen",
  "commercial_copied",
  "purging",
  "purged",
  "storage_cleaning",
  "verifying",
  "completed",
  "failed",
  "blocked",
] as const;

export type OrganisationDeletionRunStatus =
  (typeof ORGANISATION_DELETION_RUN_STATUSES)[number];

export const ORGANISATION_DELETION_OPEN_RUN_STATUSES =
  ORGANISATION_DELETION_RUN_STATUSES.filter(
    status => status !== "completed" && status !== "blocked"
  ) as Exclude<OrganisationDeletionRunStatus, "completed" | "blocked">[];

export const RETAINED_COMMERCIAL_RECORD_TYPES = [
  "subscription",
  "invoice",
  "purchase_order",
  "contract",
  "trial",
  "payment_method_masked",
  "licence_snapshot",
] as const;

export type RetainedCommercialRecordType =
  (typeof RETAINED_COMMERCIAL_RECORD_TYPES)[number];

export const RETAINED_COMMERCIAL_FORBIDDEN_SNAPSHOT_KEYS = [
  "private_notes",
  "privateNotes",
  "preparation",
  "reflection",
  "extracted_text",
  "extractedText",
  "approved_content",
  "approvedContent",
  "structured_evidence",
  "structuredEvidence",
  "conversation_text",
  "conversationText",
  "session_notes",
  "sessionNotes",
  "coach_insight",
  "coachInsight",
  "identity_summary",
  "identitySummary",
  "intelligence_items",
  "intelligenceItems",
] as const;

export const UNDELETABLE_ORGANISATION_IDS_SETTING_KEY =
  "undeletable_organisation_ids";
