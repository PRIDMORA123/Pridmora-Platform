/**
 * DATA-LIFECYCLE DL-06 — commercial retention copy and purge-readiness gate.
 * Does not purge, delete storage, create certificates, or mutate Auth users.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadOrganisationDeletionPreflight } from "@/lib/owner/organisation-deletion-preflight";
import type { DeletionPreflightReason } from "@/lib/owner/organisation-deletion-preflight";
import { loadOpenOrganisationDeletionRun } from "@/lib/owner/organisation-deletion-initiation";
import { MIGRATION_REVIEW_DETAILS_NEVER_AUTHORITY_LIMITATION } from "@/lib/owner/organisation-migration-review-attribution";

export const OWNER_COPY_ORGANISATION_COMMERCIAL_RPC =
  "owner_copy_organisation_commercial_records";

export const COMMERCIAL_COPIED_RUN_STATUS = "commercial_copied";
export const COMMERCIAL_COPIED_STAGE = "commercial_copied";

export const PURGE_READINESS_RESULTS = [
  "not_ready",
  "requires_review",
  "blocked",
] as const;

export type PurgeReadinessResult = (typeof PURGE_READINESS_RESULTS)[number];

export type CommercialSourceCount = {
  table: string;
  recordType: string;
  sourceCount: number;
  retainedCount: number;
};

export type PurgeReadiness = {
  result: PurgeReadinessResult;
  reasons: Array<{ code: string; severity: "block" | "review"; message: string }>;
  acknowledgedLimitations: string[];
  commercialCopyVerified: boolean;
  freezeEffective: boolean;
  permanentDeletionOccurred: false;
};

export const OWNER_COPY_COMMERCIAL_ERROR_CODES = [
  "UNAUTHENTICATED",
  "PERMISSION_DENIED",
  "ORGANISATION_REQUIRED",
  "NOT_FOUND",
  "RUN_NOT_FOUND",
  "PERSONAL_ORGANISATION",
  "SAMPLE_INSTALLATION",
  "SAMPLE_SOURCE_ORGANISATION",
  "UNDELETABLE_ORGANISATION",
  "STATUS_NOT_ALLOWED",
  "INCONSISTENT_RUN",
  "RUN_STATE_NOT_ALLOWED",
  "ACKNOWLEDGEMENT_REQUIRED",
  "COMMERCIAL_COPY_INCOMPLETE",
  "UPDATE_FAILED",
] as const;

export type OwnerCopyCommercialErrorCode =
  (typeof OWNER_COPY_COMMERCIAL_ERROR_CODES)[number];

const DL04_ACKNOWLEDGED_LIMITATIONS = [
  MIGRATION_REVIEW_DETAILS_NEVER_AUTHORITY_LIMITATION,
  "Backup and external-processor retention cannot be confirmed from this inventory.",
] as const;

export function ownerCopyCommercialErrorMessage(
  code: OwnerCopyCommercialErrorCode | string
): string {
  switch (code) {
    case "UNAUTHENTICATED":
      return "You must be signed in.";
    case "PERMISSION_DENIED":
      return "Owner Console access denied.";
    case "ORGANISATION_REQUIRED":
      return "Organisation and deletion run are required.";
    case "NOT_FOUND":
      return "Organisation not found.";
    case "RUN_NOT_FOUND":
      return "Deletion run not found.";
    case "PERSONAL_ORGANISATION":
      return "Personal workspaces cannot use commercial retention copy.";
    case "SAMPLE_INSTALLATION":
      return "Sample installations cannot use this workflow.";
    case "SAMPLE_SOURCE_ORGANISATION":
      return "Sample pack source organisations cannot use this workflow.";
    case "UNDELETABLE_ORGANISATION":
      return "This organisation is listed as undeletable.";
    case "STATUS_NOT_ALLOWED":
      return "Commercial retention copy requires pending_closure.";
    case "INCONSISTENT_RUN":
      return "The deletion run does not match this organisation.";
    case "RUN_STATE_NOT_ALLOWED":
      return "The deletion run is not in a state that can copy commercial records.";
    case "ACKNOWLEDGEMENT_REQUIRED":
      return "Confirm that this copies commercial metadata only and does not delete tenant data.";
    case "COMMERCIAL_COPY_INCOMPLETE":
      return "Commercial retention copy did not verify complete and was rolled back.";
    default:
      return "Unable to prepare the retained commercial record.";
  }
}

function isErrorCode(value: unknown): value is OwnerCopyCommercialErrorCode {
  return (
    typeof value === "string" &&
    (OWNER_COPY_COMMERCIAL_ERROR_CODES as readonly string[]).includes(value)
  );
}

export function derivePurgeReadiness(input: {
  organisationFound: boolean;
  organisationStatus: string | null;
  organisationType: string | null;
  isSampleInstallation: boolean;
  isSampleSource: boolean;
  isUndeletable: boolean;
  openRunCount: number;
  runOrganisationId: string | null;
  runFormerOrganisationId: string | null;
  expectedOrganisationId: string;
  runStatus: string | null;
  freezeBlocksMemberAccess: boolean;
  commercialVerificationPassed: boolean;
  sourceRetainedMatches: boolean;
  preflightReviewReasons: DeletionPreflightReason[];
}): PurgeReadiness {
  const blockReasons: PurgeReadiness["reasons"] = [];
  const reviewReasons: PurgeReadiness["reasons"] = [];
  const acknowledgedLimitations = [...DL04_ACKNOWLEDGED_LIMITATIONS];

  if (!input.organisationFound) {
    blockReasons.push({
      code: "ORGANISATION_NOT_FOUND",
      severity: "block",
      message: "Organisation was not found.",
    });
  }
  if (input.organisationType === "personal") {
    blockReasons.push({
      code: "PERSONAL_ORGANISATION",
      severity: "block",
      message: "Personal workspaces are outside the organisation deletion path.",
    });
  }
  if (input.isSampleInstallation) {
    blockReasons.push({
      code: "SAMPLE_INSTALLATION",
      severity: "block",
      message: "Sample installations must not enter tenant purge.",
    });
  }
  if (input.isSampleSource) {
    blockReasons.push({
      code: "SAMPLE_SOURCE_ORGANISATION",
      severity: "block",
      message: "Sample pack source organisations must not enter tenant purge.",
    });
  }
  if (input.isUndeletable) {
    blockReasons.push({
      code: "UNDELETABLE_ORGANISATION",
      severity: "block",
      message: "This organisation is listed as undeletable.",
    });
  }
  if (input.organisationStatus !== "pending_closure") {
    blockReasons.push({
      code: "NOT_PENDING_CLOSURE",
      severity: "block",
      message: "Organisation is not pending_closure.",
    });
  }
  if (!input.freezeBlocksMemberAccess) {
    blockReasons.push({
      code: "FREEZE_NOT_EFFECTIVE",
      severity: "block",
      message: "DL-05 freeze is not effective.",
    });
  }
  if (input.openRunCount !== 1) {
    blockReasons.push({
      code: "OPEN_RUN_COUNT",
      severity: "block",
      message: "Exactly one open deletion run is required.",
    });
  }
  if (
    input.runFormerOrganisationId !== input.expectedOrganisationId ||
    input.runOrganisationId !== input.expectedOrganisationId
  ) {
    blockReasons.push({
      code: "INCONSISTENT_RUN",
      severity: "block",
      message: "Deletion run identity does not match this organisation.",
    });
  }
  if (
    input.runStatus &&
    ["purging", "purged", "storage_cleaning", "verifying", "completed", "failed", "blocked"].includes(
      input.runStatus
    )
  ) {
    blockReasons.push({
      code: "UNEXPECTED_RUN_STATE",
      severity: "block",
      message: "Deletion run is in an unexpected state for purge readiness.",
    });
  }
  if (!input.sourceRetainedMatches) {
    blockReasons.push({
      code: "COMMERCIAL_COUNT_MISMATCH",
      severity: "block",
      message: "Retained commercial counts do not match source counts.",
    });
  }

  if (!input.commercialVerificationPassed) {
    reviewReasons.push({
      code: "COMMERCIAL_COPY_NOT_VERIFIED",
      severity: "review",
      message: "Commercial retention copy has not been verified.",
    });
  }

  reviewReasons.push({
    code: "BACKUP_EXTERNAL_RETENTION_UNCONFIRMED",
    severity: "review",
    message: DL04_ACKNOWLEDGED_LIMITATIONS[1],
  });
  for (const reason of input.preflightReviewReasons) {
    if (
      !blockReasons.some(item => item.code === reason.code) &&
      !reviewReasons.some(item => item.code === reason.code)
    ) {
      reviewReasons.push(reason);
    }
  }

  const reasons = [...blockReasons, ...reviewReasons];
  // Never ready: backup/external follow-up is unconfirmed, and any
  // ambiguous/unknown_table preflight reason remains fail-closed.
  // Unrelated not_attributed migration-review rows are not passed in.
  const result: PurgeReadinessResult = blockReasons.length
    ? "blocked"
    : input.commercialVerificationPassed
      ? "requires_review"
      : "not_ready";

  return {
    result,
    reasons,
    acknowledgedLimitations,
    commercialCopyVerified: input.commercialVerificationPassed,
    freezeEffective: input.freezeBlocksMemberAccess,
    permanentDeletionOccurred: false,
  };
}

export type CommercialRetentionState = {
  organisationId: string;
  organisationStatus: string | null;
  deletionRunId: string | null;
  runStatus: string | null;
  stage: string | null;
  verificationStatus: string | null;
  sources: CommercialSourceCount[];
  retainedTotal: number;
  copyAvailable: boolean;
  alreadyCopied: boolean;
  purgeReadiness: PurgeReadiness;
  permanentDeletionOccurred: false;
};

export async function loadCommercialRetentionState(input: {
  ownerSupabase: SupabaseClient;
  inventorySupabase: SupabaseClient;
  organisationId: string;
}): Promise<CommercialRetentionState> {
  const existing = await loadOpenOrganisationDeletionRun({
    supabase: input.ownerSupabase,
    organisationId: input.organisationId,
  });
  const preflight = await loadOrganisationDeletionPreflight({
    supabase: input.inventorySupabase,
    organisationId: input.organisationId,
  });

  const runId = existing.openRun?.id ?? null;
  let retainedByType: Record<string, number> = {};
  if (runId) {
    const types = [
      "subscription",
      "payment_method_masked",
      "invoice",
      "purchase_order",
      "contract",
      "trial",
      "licence_snapshot",
    ];
    for (const recordType of types) {
      const { count } = await input.ownerSupabase
        .from("retained_organisation_commercial_records")
        .select("*", { count: "exact", head: true })
        .eq("deletion_run_id", runId)
        .eq("record_type", recordType);
      retainedByType[recordType] = count ?? 0;
    }
  }

  const commercial = preflight.commercial;
  const sources: CommercialSourceCount[] = [
    {
      table: "organisation_subscriptions",
      recordType: "subscription",
      sourceCount: commercial.find(item => item.key === "subscriptions")?.count ?? 0,
      retainedCount: retainedByType.subscription ?? 0,
    },
    {
      table: "organisation_payment_methods",
      recordType: "payment_method_masked",
      sourceCount: commercial.find(item => item.key === "paymentMethods")?.count ?? 0,
      retainedCount: retainedByType.payment_method_masked ?? 0,
    },
    {
      table: "invoices",
      recordType: "invoice",
      sourceCount: commercial.find(item => item.key === "invoices")?.count ?? 0,
      retainedCount: retainedByType.invoice ?? 0,
    },
    {
      table: "purchase_orders",
      recordType: "purchase_order",
      sourceCount: commercial.find(item => item.key === "purchaseOrders")?.count ?? 0,
      retainedCount: retainedByType.purchase_order ?? 0,
    },
    {
      table: "organisation_contracts",
      recordType: "contract",
      sourceCount: commercial.find(item => item.key === "contracts")?.count ?? 0,
      retainedCount: retainedByType.contract ?? 0,
    },
    {
      table: "organisation_trials",
      recordType: "trial",
      sourceCount: commercial.find(item => item.key === "trials")?.count ?? 0,
      retainedCount: retainedByType.trial ?? 0,
    },
    {
      table: "organisations",
      recordType: "licence_snapshot",
      sourceCount: existing.organisationStatus ? 1 : 0,
      retainedCount: retainedByType.licence_snapshot ?? 0,
    },
  ];

  const alreadyCopied = existing.openRun?.status === COMMERCIAL_COPIED_RUN_STATUS;
  const countsMatch = sources.every(item => item.sourceCount === item.retainedCount);
  const freezeEffective = existing.organisationStatus === "pending_closure";
  const sampleAsOrg = preflight.inventory.find(item => item.key === "sampleInstallationsAsOrg");
  const sampleAsSource = preflight.inventory.find(
    item => item.key === "sampleInstallationsAsSource"
  );

  const purgeReadiness = derivePurgeReadiness({
    organisationFound: Boolean(preflight.organisation),
    organisationStatus: existing.organisationStatus,
    organisationType: preflight.organisation?.organisationType ?? null,
    isSampleInstallation: (sampleAsOrg?.count ?? 0) > 0,
    isSampleSource: (sampleAsSource?.count ?? 0) > 0,
    isUndeletable: preflight.reasons.some(reason => reason.code === "UNDELETABLE_ORGANISATION"),
    openRunCount: existing.openRun ? 1 : 0,
    runOrganisationId: existing.openRun?.organisationId ?? null,
    runFormerOrganisationId: existing.openRun?.formerOrganisationId ?? null,
    expectedOrganisationId: input.organisationId,
    runStatus: existing.openRun?.status ?? null,
    freezeBlocksMemberAccess: freezeEffective,
    commercialVerificationPassed: alreadyCopied && countsMatch,
    sourceRetainedMatches: alreadyCopied ? countsMatch : true,
    preflightReviewReasons: preflight.reasons.filter(reason => reason.severity === "review"),
  });

  return {
    organisationId: input.organisationId,
    organisationStatus: existing.organisationStatus,
    deletionRunId: runId,
    runStatus: existing.openRun?.status ?? null,
    stage: existing.openRun?.stage ?? null,
    verificationStatus: alreadyCopied ? "passed" : "not_started",
    sources,
    retainedTotal: sources.reduce((sum, item) => sum + item.retainedCount, 0),
    copyAvailable:
      freezeEffective &&
      existing.openRun?.status === "frozen" &&
      Boolean(runId) &&
      preflight.organisation?.organisationType !== "personal" &&
      (sampleAsOrg?.count ?? 0) === 0 &&
      (sampleAsSource?.count ?? 0) === 0 &&
      !preflight.reasons.some(reason => reason.code === "UNDELETABLE_ORGANISATION"),
    alreadyCopied,
    purgeReadiness,
    permanentDeletionOccurred: false,
  };
}

export type CopyCommercialResult =
  | {
      ok: true;
      alreadyCopied: boolean;
      deletionRunId: string;
      organisationId: string;
      organisationStatus: string;
      runStatus: string;
      stage: string;
      verificationStatus: string;
      sources: CommercialSourceCount[];
      retainedTotal: number;
      purgeReadiness: PurgeReadiness;
      permanentDeletionOccurred: false;
    }
  | {
      ok: false;
      code: string;
      error: string;
      purgeReadiness?: PurgeReadiness;
    };

function commercialCopyRpcFailureCode(error: {
  message?: string;
  details?: string;
  hint?: string;
}): OwnerCopyCommercialErrorCode {
  const message = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`;
  if (/COMMERCIAL_COPY_INCOMPLETE/i.test(message)) {
    return "COMMERCIAL_COPY_INCOMPLETE";
  }
  return "UPDATE_FAILED";
}

export async function copyOrganisationCommercialRecords(input: {
  ownerSupabase: SupabaseClient;
  inventorySupabase: SupabaseClient;
  organisationId: string;
  deletionRunId: string;
  commercialCopyAcknowledged: boolean;
}): Promise<CopyCommercialResult> {
  if (!input.commercialCopyAcknowledged) {
    return {
      ok: false,
      code: "ACKNOWLEDGEMENT_REQUIRED",
      error: ownerCopyCommercialErrorMessage("ACKNOWLEDGEMENT_REQUIRED"),
    };
  }

  const existing = await loadOpenOrganisationDeletionRun({
    supabase: input.ownerSupabase,
    organisationId: input.organisationId,
  });
  const preflight = await loadOrganisationDeletionPreflight({
    supabase: input.inventorySupabase,
    organisationId: input.organisationId,
  });

  if (!preflight.organisation && !existing.organisationStatus) {
    return {
      ok: false,
      code: "NOT_FOUND",
      error: ownerCopyCommercialErrorMessage("NOT_FOUND"),
    };
  }
  if (preflight.organisation?.organisationType === "personal") {
    return {
      ok: false,
      code: "PERSONAL_ORGANISATION",
      error: ownerCopyCommercialErrorMessage("PERSONAL_ORGANISATION"),
    };
  }
  const sampleAsOrg = preflight.inventory.find(item => item.key === "sampleInstallationsAsOrg");
  const sampleAsSource = preflight.inventory.find(
    item => item.key === "sampleInstallationsAsSource"
  );
  if ((sampleAsOrg?.count ?? 0) > 0) {
    return {
      ok: false,
      code: "SAMPLE_INSTALLATION",
      error: ownerCopyCommercialErrorMessage("SAMPLE_INSTALLATION"),
    };
  }
  if ((sampleAsSource?.count ?? 0) > 0) {
    return {
      ok: false,
      code: "SAMPLE_SOURCE_ORGANISATION",
      error: ownerCopyCommercialErrorMessage("SAMPLE_SOURCE_ORGANISATION"),
    };
  }
  if (preflight.reasons.some(reason => reason.code === "UNDELETABLE_ORGANISATION")) {
    return {
      ok: false,
      code: "UNDELETABLE_ORGANISATION",
      error: ownerCopyCommercialErrorMessage("UNDELETABLE_ORGANISATION"),
    };
  }
  if (existing.organisationStatus !== "pending_closure") {
    return {
      ok: false,
      code: "STATUS_NOT_ALLOWED",
      error: ownerCopyCommercialErrorMessage("STATUS_NOT_ALLOWED"),
    };
  }
  if (!existing.openRun) {
    return {
      ok: false,
      code: "RUN_NOT_FOUND",
      error: ownerCopyCommercialErrorMessage("RUN_NOT_FOUND"),
    };
  }
  if (
    existing.openRun.id !== input.deletionRunId ||
    existing.openRun.formerOrganisationId !== input.organisationId ||
    existing.openRun.organisationId !== input.organisationId
  ) {
    return {
      ok: false,
      code: "INCONSISTENT_RUN",
      error: ownerCopyCommercialErrorMessage("INCONSISTENT_RUN"),
    };
  }
  if (!["frozen", COMMERCIAL_COPIED_RUN_STATUS].includes(existing.openRun.status)) {
    return {
      ok: false,
      code: "RUN_STATE_NOT_ALLOWED",
      error: ownerCopyCommercialErrorMessage("RUN_STATE_NOT_ALLOWED"),
    };
  }

  const { data, error } = await input.ownerSupabase.rpc(
    OWNER_COPY_ORGANISATION_COMMERCIAL_RPC,
    {
      p_organisation_id: input.organisationId,
      p_deletion_run_id: input.deletionRunId,
    }
  );

  if (error) {
    console.error("Commercial retention copy RPC failed:", {
      message: error.message,
      code: error.code,
    });
    const code = commercialCopyRpcFailureCode(error);
    return {
      ok: false,
      code,
      error: ownerCopyCommercialErrorMessage(code),
    };
  }

  const payload = (data ?? null) as {
    ok?: boolean;
    code?: string;
    alreadyCopied?: boolean;
    deletionRunId?: string;
    organisationId?: string;
    organisationStatus?: string;
    runStatus?: string;
    stage?: string;
    verificationStatus?: string;
    sources?: CommercialSourceCount[];
    retainedTotal?: number;
    permanentDeletionOccurred?: boolean;
  } | null;

  if (!payload || payload.ok !== true) {
    const code = isErrorCode(payload?.code) ? payload.code : "UPDATE_FAILED";
    return {
      ok: false,
      code,
      error: ownerCopyCommercialErrorMessage(code),
    };
  }

  if (payload.permanentDeletionOccurred === true) {
    return {
      ok: false,
      code: "UPDATE_FAILED",
      error: ownerCopyCommercialErrorMessage("UPDATE_FAILED"),
    };
  }

  const state = await loadCommercialRetentionState({
    ownerSupabase: input.ownerSupabase,
    inventorySupabase: input.inventorySupabase,
    organisationId: input.organisationId,
  });

  return {
    ok: true,
    alreadyCopied: Boolean(payload.alreadyCopied),
    deletionRunId: payload.deletionRunId ?? input.deletionRunId,
    organisationId: payload.organisationId ?? input.organisationId,
    organisationStatus: payload.organisationStatus ?? "pending_closure",
    runStatus: payload.runStatus ?? COMMERCIAL_COPIED_RUN_STATUS,
    stage: payload.stage ?? COMMERCIAL_COPIED_STAGE,
    verificationStatus: payload.verificationStatus ?? "passed",
    sources: payload.sources ?? state.sources,
    retainedTotal: payload.retainedTotal ?? state.retainedTotal,
    purgeReadiness: state.purgeReadiness,
    permanentDeletionOccurred: false,
  };
}