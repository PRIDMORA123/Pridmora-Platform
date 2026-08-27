/**
 * DATA-LIFECYCLE — issue the existing immutable deletion certificate and
 * complete the deletion run. Does not purge tenant data, Storage, Auth,
 * commercial, support, or audit rows. Claim remains APPLICATION DATA PURGED.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { RETAINED_COMMERCIAL_FORBIDDEN_SNAPSHOT_KEYS } from "@/lib/owner/organisation-deletion-foundation";
import {
  isDeletionCertificateIssuable,
  loadFinalVerificationState,
  type FinalVerificationState,
} from "@/lib/owner/organisation-final-verification";
import {
  APPLICATION_PURGE_CLAIM,
  FORBIDDEN_AUTH_USER_DELETION_APIS,
  ORGANISATION_PURGE_MUST_NEVER_DELETE_AUTH_USERS,
  WRITE_MINIMISED_DELETION_LIFECYCLE_AUDIT_SQL,
} from "@/lib/owner/organisation-purge-architecture";

export const OWNER_ISSUE_ORGANISATION_DELETION_CERTIFICATE_RPC =
  "owner_issue_organisation_deletion_certificate";

export const CERTIFICATE_COMPLETION_MIGRATION =
  "supabase/migrations/20260827270000_organisation_deletion_certificate.sql";

export const DELETION_CERTIFICATE_ERROR_CODES = [
  "UNAUTHENTICATED",
  "PERMISSION_DENIED",
  "ORGANISATION_REQUIRED",
  "RUN_NOT_FOUND",
  "INCONSISTENT_RUN",
  "RUN_STATE_NOT_ALLOWED",
  "INCONSISTENT_CERTIFICATE_STATE",
  "ORGANISATION_ROW_REMAINS",
  "STORAGE_STATUS_MISMATCH",
  "RETAINED_COMMERCIAL_MISMATCH",
  "ACKNOWLEDGEMENT_REQUIRED",
  "VERIFICATION_NOT_PASSED",
  "CERTIFICATE_NOT_ISSUABLE",
  "UPDATE_FAILED",
] as const;

export type DeletionCertificateErrorCode =
  (typeof DELETION_CERTIFICATE_ERROR_CODES)[number];

export const OWNER_CERTIFICATE_AUTHORISATION = {
  requirePlatformOwnerFirst: true,
  sqlMustCheckAuthUid: true,
  sqlMustCheckIsPlatformOwner: true,
  requiredFields: ["deletionRunId", "issueCertificateAcknowledged"] as const,
  forbiddenClientFlags: [
    "purgeReady",
    "eligible",
    "finalVerificationResult",
    "certificateIssuable",
    "verificationPassed",
    "commercialCopyComplete",
    "organisationRowAbsent",
    "eligibleErasureClaim",
  ] as const,
  freshFinalVerificationRequired: true,
  neverTrustBrowserBooleans: true,
} as const;

export const CERTIFICATE_INVENTORY_SUMMARY_KEYS = [
  "formerOrganisationId",
  "deletionRunId",
  "runStatus",
  "stage",
  "storageCleanupStatus",
  "backupStatus",
  "externalFollowUpStatus",
  "commercialRetainedCount",
  "eligibleErasureClaim",
] as const;

export type DeletionCertificateSuccess = {
  ok: true;
  formerOrganisationId: string;
  deletionRunId: string;
  runStatus: "completed";
  stage: string | null;
  completedAt: string | null;
  alreadyCompleted: boolean;
  certificateCreated: boolean;
  runCompleted: true;
  eligibleErasureClaim: typeof APPLICATION_PURGE_CLAIM;
  authUsersDeleted: false;
  backupStatus: "unknown";
  externalFollowUpStatus: "unknown";
  commercialCopyVerificationStatus: string | null;
  storageCleanupStatus: "passed" | "not_applicable";
  commercialRetainedCount: number;
  organisationRowAbsent: true;
};

export type DeletionCertificateFailure = {
  ok: false;
  code: string;
  error: string;
  certificateCreated: false;
  runCompleted: false;
  authUsersDeleted: false;
  backupStatus: "unknown";
  externalFollowUpStatus: "unknown";
  eligibleErasureClaim: null;
};

export type DeletionCertificateResult =
  | DeletionCertificateSuccess
  | DeletionCertificateFailure;

export function ownerDeletionCertificateErrorMessage(
  code: DeletionCertificateErrorCode | string
): string {
  switch (code) {
    case "UNAUTHENTICATED":
      return "You must be signed in.";
    case "PERMISSION_DENIED":
      return "Owner Console access denied.";
    case "ORGANISATION_REQUIRED":
      return "Former organisation and deletion run are required.";
    case "RUN_NOT_FOUND":
      return "Deletion run not found.";
    case "INCONSISTENT_RUN":
      return "The deletion run does not match this former organisation.";
    case "RUN_STATE_NOT_ALLOWED":
      return "Certificate issuance requires status verifying and stage awaiting_certificate.";
    case "INCONSISTENT_CERTIFICATE_STATE":
      return "The deletion certificate and run completion state are inconsistent.";
    case "ORGANISATION_ROW_REMAINS":
      return "The organisation row is still present.";
    case "STORAGE_STATUS_MISMATCH":
      return "Storage cleanup status does not match the verified result.";
    case "RETAINED_COMMERCIAL_MISMATCH":
      return "Retained commercial count does not match the verified result.";
    case "ACKNOWLEDGEMENT_REQUIRED":
      return "Confirm that this records application-data purge completion only.";
    case "VERIFICATION_NOT_PASSED":
      return "Fresh final verification has not passed.";
    case "CERTIFICATE_NOT_ISSUABLE":
      return "A deletion certificate cannot be issued for this state.";
    default:
      return "Unable to issue the deletion certificate.";
  }
}

export function storageCleanupStatusFromVerification(
  state: Pick<FinalVerificationState, "storage">
): "passed" | "not_applicable" | null {
  if (!state.storage.passed) return null;
  return "passed";
}

export function certificateInventorySummaryIsOperational(
  summary: Record<string, unknown>
): boolean {
  const forbidden = new Set(
    (RETAINED_COMMERCIAL_FORBIDDEN_SNAPSHOT_KEYS as readonly string[]).map(key =>
      key.toLowerCase()
    )
  );
  for (const extra of ["transcript", "evidence", "report", "private-note", "coaching"]) {
    forbidden.add(extra);
  }
  return Object.keys(summary).every(key => {
    const lower = key.toLowerCase();
    if (forbidden.has(lower)) return false;
    if (lower.includes("private") || lower.includes("coach") || lower.includes("transcript")) {
      return false;
    }
    return (CERTIFICATE_INVENTORY_SUMMARY_KEYS as readonly string[]).includes(key);
  });
}

export function deletionCertificateSqlIsSafe(source: string): boolean {
  return (
    source.includes(OWNER_ISSUE_ORGANISATION_DELETION_CERTIFICATE_RPC) &&
    source.includes("insert into public.organisation_deletion_certificates") &&
    source.includes(WRITE_MINIMISED_DELETION_LIFECYCLE_AUDIT_SQL) &&
    source.includes("'organisation.purge_completed'") &&
    source.includes("status = 'completed'") &&
    !source.includes("verification_status =") &&
    ORGANISATION_PURGE_MUST_NEVER_DELETE_AUTH_USERS &&
    FORBIDDEN_AUTH_USER_DELETION_APIS.every(api => !source.includes(api)) &&
    !/auth\.admin/i.test(source) &&
    !/from\s+auth\.users/i.test(source) &&
    !/delete\s+from\s+auth\.users/i.test(source) &&
    !/delete\s+from\s+public\.organisations/i.test(source) &&
    !/delete\s+from\s+public\.clients/i.test(source) &&
    !/delete\s+from\s+public\.sessions/i.test(source) &&
    !/delete\s+from\s+public\.support_cases/i.test(source) &&
    !/delete\s+from\s+public\.platform_audit_events/i.test(source) &&
    !/delete\s+from\s+public\.retained_organisation_commercial_records/i.test(source) &&
    !/storage\.objects/i.test(source) &&
    !/COMPLETE ERASURE CONFIRMED/.test(source) &&
    !/backup_status',\s*'passed'/.test(source) &&
    !/external_follow_up_status',\s*'passed'/.test(source) &&
    !/write_minimised_deletion_lifecycle_audit[\s\S]{0,400}authUsersDeleted/.test(
      source
    )
  );
}

function isErrorCode(value: unknown): value is DeletionCertificateErrorCode {
  return (
    typeof value === "string" &&
    (DELETION_CERTIFICATE_ERROR_CODES as readonly string[]).includes(
      value as DeletionCertificateErrorCode
    )
  );
}

function failure(
  code: DeletionCertificateErrorCode | string
): DeletionCertificateFailure {
  return {
    ok: false,
    code,
    error: ownerDeletionCertificateErrorMessage(code),
    certificateCreated: false,
    runCompleted: false,
    authUsersDeleted: false,
    backupStatus: "unknown",
    externalFollowUpStatus: "unknown",
    eligibleErasureClaim: null,
  };
}

function alreadyCompletedFromVerification(
  state: FinalVerificationState,
  deletionRunId: string
): boolean {
  return (
    state.runCompleted &&
    state.certificateExists &&
    state.deletionRunId === deletionRunId &&
    state.runStatus === "completed"
  );
}

export async function issueOrganisationDeletionCertificate(input: {
  ownerSupabase: SupabaseClient;
  inventorySupabase: SupabaseClient;
  formerOrganisationId: string;
  deletionRunId: string;
  issueCertificateAcknowledged: boolean;
}): Promise<DeletionCertificateResult> {
  if (!input.issueCertificateAcknowledged) {
    return failure("ACKNOWLEDGEMENT_REQUIRED");
  }

  const verification = await loadFinalVerificationState({
    ownerSupabase: input.ownerSupabase,
    inventorySupabase: input.inventorySupabase,
    formerOrganisationId: input.formerOrganisationId,
  });

  if (verification.deletionRunId && verification.deletionRunId !== input.deletionRunId) {
    return failure("INCONSISTENT_RUN");
  }
  if (!verification.deletionRunId) {
    return failure("RUN_NOT_FOUND");
  }
  if (verification.deletionRunId !== input.deletionRunId) {
    return failure("INCONSISTENT_RUN");
  }
  if (verification.certificateExists !== verification.runCompleted) {
    return failure("INCONSISTENT_CERTIFICATE_STATE");
  }

  const retryNoOp = alreadyCompletedFromVerification(verification, input.deletionRunId);
  if (!retryNoOp) {
    if (!verification.organisationRowAbsent) {
      return failure("ORGANISATION_ROW_REMAINS");
    }
    if (
      verification.runStatus !== "verifying" ||
      verification.stage !== "awaiting_certificate"
    ) {
      return failure("RUN_STATE_NOT_ALLOWED");
    }
    if (
      verification.finalVerificationResult !== "passed" ||
      verification.blockingReasons.length > 0
    ) {
      return failure("VERIFICATION_NOT_PASSED");
    }
    if (
      !isDeletionCertificateIssuable({
        finalVerificationResult: verification.finalVerificationResult,
        blockingReasons: verification.blockingReasons,
        runStatus: verification.runStatus,
        stage: verification.stage,
        organisationRowAbsent: verification.organisationRowAbsent,
        certificateExists: verification.certificateExists,
        runCompleted: verification.runCompleted,
      })
    ) {
      return failure("CERTIFICATE_NOT_ISSUABLE");
    }
  }

  const storageCleanupStatus = retryNoOp
    ? verification.storage.passed
      ? "passed"
      : "not_applicable"
    : storageCleanupStatusFromVerification(verification);
  if (!storageCleanupStatus && !retryNoOp) {
    return failure("VERIFICATION_NOT_PASSED");
  }

  const { data, error } = await input.ownerSupabase.rpc(
    OWNER_ISSUE_ORGANISATION_DELETION_CERTIFICATE_RPC,
    {
      p_former_organisation_id: input.formerOrganisationId,
      p_deletion_run_id: input.deletionRunId,
      p_storage_cleanup_status: storageCleanupStatus ?? "passed",
      p_commercial_retained_count: verification.retainedCommercial.actualTotal,
    }
  );

  if (error) {
    return failure("UPDATE_FAILED");
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  if (payload.ok === false) {
    const code = isErrorCode(payload.code) ? payload.code : "UPDATE_FAILED";
    return failure(code);
  }

  const storageStatus =
    payload.storageCleanupStatus === "not_applicable" ? "not_applicable" : "passed";

  return {
    ok: true,
    formerOrganisationId: input.formerOrganisationId,
    deletionRunId: String(payload.deletionRunId ?? input.deletionRunId),
    runStatus: "completed",
    stage: typeof payload.stage === "string" ? payload.stage : verification.stage,
    completedAt: typeof payload.completedAt === "string" ? payload.completedAt : null,
    alreadyCompleted: payload.alreadyCompleted === true,
    certificateCreated: payload.certificateCreated === true,
    runCompleted: true,
    eligibleErasureClaim: APPLICATION_PURGE_CLAIM,
    authUsersDeleted: false,
    backupStatus: "unknown",
    externalFollowUpStatus: "unknown",
    commercialCopyVerificationStatus:
      typeof payload.commercialCopyVerificationStatus === "string"
        ? payload.commercialCopyVerificationStatus
        : verification.commercialCopyVerificationStatus,
    storageCleanupStatus: storageStatus,
    commercialRetainedCount: Number(
      payload.commercialRetainedCount ?? verification.retainedCommercial.actualTotal
    ),
    organisationRowAbsent: true,
  };
}
