/**
 * DATA-LIFECYCLE DL-08 Slice 3 — authoritative tenant DB purge and
 * bound Storage deletion.
 *
 * Storage is not transactionally atomic with Postgres. Manifest is captured
 * first, DB purge second, exact-path Storage deletion third, verification
 * fourth. Run ends at verifying / awaiting_certificate. No certificate.
 * Never deletes Auth users.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadOrganisationDeletionPreflight } from "@/lib/owner/organisation-deletion-preflight";
import { loadOpenOrganisationDeletionRun } from "@/lib/owner/organisation-deletion-initiation";
import { loadCommercialRetentionState } from "@/lib/owner/organisation-commercial-retention";
import { loadRetainMinimiseState } from "@/lib/owner/organisation-retain-minimise";
import { assessOrganisationMigrationReview } from "@/lib/owner/organisation-migration-review-attribution";
import {
  AUTHORITATIVE_STORAGE_BUCKET,
  FORBIDDEN_AUTH_USER_DELETION_APIS,
  ORGANISATION_PURGE_MANIFEST,
  ORGANISATION_PURGE_MUST_NEVER_DELETE_AUTH_USERS,
  OWNER_PURGE_AUTHORISATION,
  reviewCodeBlocksTenantPurgeExecution,
  TENANT_PURGE_EXPLICIT_TABLES,
  TENANT_PURGE_PROTECTED_TABLES,
  TENANT_PURGE_RESIDUAL_SURFACES,
  tenantPurgeResidualAttribution,
} from "@/lib/owner/organisation-purge-architecture";
import { DEVELOPMENT_EVIDENCE_STORAGE_BUCKET } from "@/lib/development-evidence/storage-path";

export const OWNER_CAPTURE_STORAGE_MANIFEST_RPC =
  "owner_capture_organisation_storage_manifest";
export const OWNER_PURGE_TENANT_DATA_RPC =
  "owner_purge_organisation_tenant_data";
export const OWNER_MARK_STORAGE_CLEANUP_RPC =
  "owner_mark_organisation_storage_cleanup";

export const TENANT_PURGE_ERROR_CODES = [
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
  "CONFIRMATION_NAME_MISMATCH",
  "INSTRUCTION_REQUIRED",
  "COMMERCIAL_COPY_NOT_VERIFIED",
  "RETAIN_MINIMISE_PENDING",
  "MIGRATION_REVIEW_AMBIGUOUS",
  "MIGRATION_REVIEW_UNKNOWN_TABLE",
  "STORAGE_PATH_NOT_AUTHORITATIVE",
  "STORAGE_MANIFEST_REQUIRED",
  "INVENTORY_INCOMPLETE",
  "PURGE_READINESS_BLOCKED",
  "PARTIAL_STORAGE_FAILURE",
  "STORAGE_PREFIX_REMAINDER",
  "RESIDUAL_TENANT_ROWS",
  "UPDATE_FAILED",
] as const;

export type TenantPurgeErrorCode = (typeof TENANT_PURGE_ERROR_CODES)[number];

export type TenantPurgeGate = {
  key: string;
  passed: boolean;
  message: string;
};

export type TenantPurgeState = {
  organisationId: string;
  organisationStatus: string | null;
  organisationName: string | null;
  deletionRunId: string | null;
  runStatus: string | null;
  stage: string | null;
  storageStatus: string | null;
  purgeAvailable: boolean;
  alreadyPurged: boolean;
  awaitingCertificate: boolean;
  partialFailure: boolean;
  lastError: string | null;
  gates: TenantPurgeGate[];
  blockingReasons: Array<{ code: string; message: string }>;
  acknowledgedLimitations: string[];
  storage: {
    bucket: string;
    capturedCount: number;
    deletedCount: number;
    verifiedCount: number;
    authoritative: boolean;
  };
  retainedCommercialUnchanged: true;
  authUsersDeleted: false;
  certificateCreated: false;
  permanentDeletionOccurred: boolean;
  runStatusUnchangedUntilPurge: boolean;
};

export function ownerTenantPurgeErrorMessage(
  code: TenantPurgeErrorCode | string
): string {
  switch (code) {
    case "UNAUTHENTICATED":
      return "You must be signed in.";
    case "PERMISSION_DENIED":
      return "Owner Console access denied.";
    case "ACKNOWLEDGEMENT_REQUIRED":
      return "Confirm that this permanently erases tenant database data and captured Storage objects.";
    case "CONFIRMATION_NAME_MISMATCH":
      return "The confirmation name does not match this organisation.";
    case "INSTRUCTION_REQUIRED":
      return "The deletion instruction reference is required.";
    case "COMMERCIAL_COPY_NOT_VERIFIED":
      return "Commercial retention copy must be completed and verified first.";
    case "RETAIN_MINIMISE_PENDING":
      return "Support and audit retain_minimise must complete first.";
    case "MIGRATION_REVIEW_AMBIGUOUS":
      return "Ambiguous migration-review rows block tenant purge.";
    case "MIGRATION_REVIEW_UNKNOWN_TABLE":
      return "Unknown migration-review table names block tenant purge.";
    case "STORAGE_PATH_NOT_AUTHORITATIVE":
      return "Storage inventory is not authoritative for this organisation.";
    case "STATUS_NOT_ALLOWED":
      return "Tenant purge requires pending_closure.";
    case "PARTIAL_STORAGE_FAILURE":
      return "Storage deletion was partial and failed closed.";
    case "STORAGE_PREFIX_REMAINDER":
      return "Storage deletion was partial and failed closed.";
    default:
      return "Unable to purge tenant data.";
  }
}

const RETRY_NONBLOCKING_READINESS_CODES = [
  "UNEXPECTED_RUN_STATE",
  "COMMERCIAL_COUNT_MISMATCH",
] as const;

function isRetryStatus(status: string | null): boolean {
  return (
    status === "purging" ||
    status === "purged" ||
    status === "storage_cleaning" ||
    status === "failed" ||
    status === "verifying"
  );
}

function isDbPurgedRunStatus(status: string | null): boolean {
  return (
    status === "purged" ||
    status === "storage_cleaning" ||
    status === "verifying"
  );
}

export function evaluateTenantPurgeGates(input: {
  organisationStatus: string | null;
  organisationName: string | null;
  organisationType: string | null;
  runId: string | null;
  runStatus: string | null;
  runOrganisationId: string | null;
  runFormerOrganisationId: string | null;
  expectedOrganisationId: string;
  commercialCopyVerified: boolean;
  retainMinimisePending: number;
  purgeReadinessResult: string;
  purgeReadinessReasons: Array<{ code: string; severity: string; message: string }>;
  storageAuthoritative: boolean;
  migrationReviewAmbiguous: number;
  migrationReviewUnknown: number;
  inventoryIncomplete: boolean;
  confirmationName?: string;
  instructionReference?: string;
  permanentErasureAcknowledged?: boolean;
}): { gates: TenantPurgeGate[]; purgeAvailable: boolean; blockingReasons: Array<{ code: string; message: string }> } {
  const retry = isRetryStatus(input.runStatus);
  const gates: TenantPurgeGate[] = [
    {
      key: "pending_closure",
      passed: retry || input.organisationStatus === "pending_closure",
      message: "Organisation is pending_closure.",
    },
    {
      key: "open_run",
      passed:
        Boolean(input.runId) &&
        input.runFormerOrganisationId === input.expectedOrganisationId &&
        (retry || input.runOrganisationId === input.expectedOrganisationId),
      message: "Open deletion run belongs to this organisation.",
    },
    {
      key: "commercial_copied",
      passed: retry || (input.runStatus === "commercial_copied" && input.commercialCopyVerified),
      message: "Commercial retention is completed and verified.",
    },
    {
      key: "retain_minimise",
      passed: retry || input.retainMinimisePending === 0,
      message: "Retain/minimise pending rows are zero.",
    },
    {
      key: "migration_review",
      passed: input.migrationReviewAmbiguous === 0 && input.migrationReviewUnknown === 0,
      message: "Migration-review attribution has no ambiguous or unknown rows.",
    },
    {
      key: "storage_authoritative",
      passed: retry || input.storageAuthoritative,
      message: "Storage inventory is authoritative.",
    },
    {
      key: "inventory",
      passed: retry || !input.inventoryIncomplete,
      message: "Authoritative tenant inventory is available.",
    },
  ];

  const blockingReasons: Array<{ code: string; message: string }> = [];
  if (input.organisationType === "personal") {
    blockingReasons.push({
      code: "PERSONAL_ORGANISATION",
      message: "Personal workspaces cannot be purged.",
    });
  }
  for (const reason of input.purgeReadinessReasons) {
    if (reason.severity === "block" || reviewCodeBlocksTenantPurgeExecution(reason.code)) {
      if (
        retry &&
        (RETRY_NONBLOCKING_READINESS_CODES as readonly string[]).includes(reason.code)
      ) {
        continue;
      }
      if (retry && reason.code === "NOT_PENDING_CLOSURE" && input.runStatus !== "commercial_copied") {
        continue;
      }
      blockingReasons.push({ code: reason.code, message: reason.message });
    }
  }
  if (input.migrationReviewAmbiguous > 0) {
    blockingReasons.push({
      code: "MIGRATION_REVIEW_AMBIGUOUS",
      message: "Ambiguous migration-review rows remain.",
    });
  }
  if (input.migrationReviewUnknown > 0) {
    blockingReasons.push({
      code: "MIGRATION_REVIEW_UNKNOWN_TABLE",
      message: "Unknown migration-review table names remain.",
    });
  }

  const purgeAvailable =
    gates.every(gate => gate.passed) &&
    blockingReasons.length === 0 &&
    input.purgeReadinessResult !== "blocked" &&
    ORGANISATION_PURGE_MUST_NEVER_DELETE_AUTH_USERS &&
    !FORBIDDEN_AUTH_USER_DELETION_APIS.some(api =>
      TENANT_PURGE_EXPLICIT_TABLES.includes(api)
    );

  return { gates, purgeAvailable, blockingReasons };
}

export async function loadTenantPurgeState(input: {
  ownerSupabase: SupabaseClient;
  inventorySupabase: SupabaseClient;
  organisationId: string;
}): Promise<TenantPurgeState> {
  const existing = await loadOpenOrganisationDeletionRun({
    supabase: input.ownerSupabase,
    organisationId: input.organisationId,
  });
  const runStatusEarly = existing.openRun?.status ?? null;
  const orgRowGone = !existing.organisationStatus;
  const alreadyPurgedEarly =
    isDbPurgedRunStatus(runStatusEarly) ||
    (runStatusEarly === "failed" && orgRowGone);

  const { data: runRow } = await input.ownerSupabase
    .from("organisation_deletion_runs")
    .select("id, status, stage, last_error, storage_status, organisation_name_snapshot")
    .eq("former_organisation_id", input.organisationId)
    .neq("status", "completed")
    .neq("status", "blocked")
    .maybeSingle();

  const { count: capturedCount } = await input.inventorySupabase
    .from("organisation_deletion_storage_manifest")
    .select("*", { count: "exact", head: true })
    .eq("deletion_run_id", existing.openRun?.id ?? runRow?.id ?? "00000000-0000-4000-8000-000000000000");
  const { count: deletedCount } = await input.inventorySupabase
    .from("organisation_deletion_storage_manifest")
    .select("*", { count: "exact", head: true })
    .eq("deletion_run_id", existing.openRun?.id ?? runRow?.id ?? "00000000-0000-4000-8000-000000000000")
    .not("deleted_at", "is", null);
  const { count: verifiedCount } = await input.inventorySupabase
    .from("organisation_deletion_storage_manifest")
    .select("*", { count: "exact", head: true })
    .eq("deletion_run_id", existing.openRun?.id ?? runRow?.id ?? "00000000-0000-4000-8000-000000000000")
    .not("verified_absent_at", "is", null);

  if (alreadyPurgedEarly || (typeof runRow?.status === "string" && ["purged", "storage_cleaning", "verifying"].includes(runRow.status))) {
    const status = runStatusEarly ?? (runRow?.status as string | null) ?? null;
    const storageFailed =
      status === "failed" ||
      runRow?.storage_status === "failed" ||
      (typeof runRow?.last_error === "string" && runRow.last_error.length > 0 && status !== "verifying");
    return {
      organisationId: input.organisationId,
      organisationStatus: existing.organisationStatus,
      organisationName:
        existing.organisationName ??
        (typeof runRow?.organisation_name_snapshot === "string"
          ? runRow.organisation_name_snapshot
          : null),
      deletionRunId: existing.openRun?.id ?? (runRow?.id as string | null) ?? null,
      runStatus: status,
      stage: (runRow?.stage as string | null) ?? existing.openRun?.stage ?? null,
      storageStatus: (runRow?.storage_status as string | null) ?? null,
      purgeAvailable: storageFailed,
      alreadyPurged: true,
      awaitingCertificate: status === "verifying",
      partialFailure: storageFailed,
      lastError: typeof runRow?.last_error === "string" ? runRow.last_error : null,
      gates: [],
      blockingReasons: [],
      acknowledgedLimitations: [],
      storage: {
        bucket: AUTHORITATIVE_STORAGE_BUCKET,
        capturedCount: capturedCount ?? 0,
        deletedCount: deletedCount ?? 0,
        verifiedCount: verifiedCount ?? 0,
        authoritative: true,
      },
      retainedCommercialUnchanged: true,
      authUsersDeleted: false,
      certificateCreated: false,
      permanentDeletionOccurred: true,
      runStatusUnchangedUntilPurge: false,
    };
  }

  const preflight = await loadOrganisationDeletionPreflight({
    supabase: input.inventorySupabase,
    organisationId: input.organisationId,
  });
  const commercial = await loadCommercialRetentionState({
    ownerSupabase: input.ownerSupabase,
    inventorySupabase: input.inventorySupabase,
    organisationId: input.organisationId,
  });
  const minimise = await loadRetainMinimiseState({
    ownerSupabase: input.ownerSupabase,
    inventorySupabase: input.inventorySupabase,
    organisationId: input.organisationId,
  });

  const { data: clientRows } = await input.inventorySupabase
    .from("clients")
    .select("id")
    .eq("organisation_id", input.organisationId);
  const { data: sessionRows } = await input.inventorySupabase
    .from("sessions")
    .select("id")
    .eq("organisation_id", input.organisationId);
  const descendantIds = new Set<string>(
    [...(clientRows ?? []), ...(sessionRows ?? [])]
      .map(row => (row as { id?: unknown }).id)
      .filter((id): id is string => typeof id === "string")
  );
  const migration = await assessOrganisationMigrationReview({
    supabase: input.inventorySupabase,
    organisationId: input.organisationId,
    descendantIds,
  });

  const evaluated = evaluateTenantPurgeGates({
    organisationStatus: existing.organisationStatus,
    organisationName: existing.organisationName,
    organisationType: preflight.organisation?.organisationType ?? null,
    runId: existing.openRun?.id ?? null,
    runStatus: existing.openRun?.status ?? null,
    runOrganisationId: existing.openRun?.organisationId ?? null,
    runFormerOrganisationId: existing.openRun?.formerOrganisationId ?? null,
    expectedOrganisationId: input.organisationId,
    commercialCopyVerified: commercial.alreadyCopied,
    retainMinimisePending: minimise.pendingTotal,
    purgeReadinessResult: commercial.purgeReadiness.result,
    purgeReadinessReasons: commercial.purgeReadiness.reasons,
    storageAuthoritative: preflight.storage.ownership === "authoritative",
    migrationReviewAmbiguous: migration.ambiguousCount,
    migrationReviewUnknown: migration.unknownTableCount,
    inventoryIncomplete: preflight.reasons.some(
      reason => reason.code === "INVENTORY_INCOMPLETE"
    ),
  });

  const runStatus = existing.openRun?.status ?? (runRow?.status as string | null) ?? null;
  const stage = (runRow?.stage as string | null) ?? existing.openRun?.stage ?? null;
  const alreadyPurged = isDbPurgedRunStatus(runStatus);
  const storageFailed = runStatus === "failed";

  return {
    organisationId: input.organisationId,
    organisationStatus: existing.organisationStatus,
    organisationName:
      existing.organisationName ??
      (typeof runRow?.organisation_name_snapshot === "string"
        ? runRow.organisation_name_snapshot
        : null),
    deletionRunId: existing.openRun?.id ?? null,
    runStatus,
    stage,
    storageStatus: (runRow?.storage_status as string | null) ?? null,
    purgeAvailable:
      evaluated.purgeAvailable && !alreadyPurged && runStatus !== "verifying",
    alreadyPurged,
    awaitingCertificate: runStatus === "verifying" || stage === "awaiting_certificate",
    partialFailure: storageFailed,
    lastError: typeof runRow?.last_error === "string" ? runRow.last_error : null,
    gates: evaluated.gates,
    blockingReasons: evaluated.blockingReasons,
    acknowledgedLimitations: commercial.purgeReadiness.acknowledgedLimitations,
    storage: {
      bucket: AUTHORITATIVE_STORAGE_BUCKET,
      capturedCount: capturedCount ?? 0,
      deletedCount: deletedCount ?? 0,
      verifiedCount: verifiedCount ?? 0,
      authoritative: preflight.storage.ownership === "authoritative",
    },
    retainedCommercialUnchanged: true,
    authUsersDeleted: false,
    certificateCreated: false,
    permanentDeletionOccurred: alreadyPurged,
    runStatusUnchangedUntilPurge: runStatus === "commercial_copied",
  };
}

type PurgeExecResult =
  | { ok: true; state: TenantPurgeState }
  | {
      ok: false;
      code: string;
      error: string;
      permanentDeletionOccurred: boolean;
      authUsersDeleted: false;
      certificateCreated: false;
    };

async function rpcOk(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown>
): Promise<{ ok: boolean; payload: Record<string, unknown>; error?: string; code?: string }> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    return { ok: false, payload: {}, error: error.message, code: "UPDATE_FAILED" };
  }
  const payload = (data ?? {}) as Record<string, unknown>;
  if (payload.ok === false) {
    return {
      ok: false,
      payload,
      code: typeof payload.code === "string" ? payload.code : "UPDATE_FAILED",
      error: typeof payload.error === "string" ? payload.error : undefined,
    };
  }
  return { ok: true, payload };
}

export type BoundStorageManifestRow = {
  id: string;
  bucket: string;
  object_path: string;
  deleted_at: string | null;
  verified_absent_at: string | null;
};

export function capturedStorageRemovalTargets(
  rows: BoundStorageManifestRow[]
): string[] {
  return rows
    .filter(
      row =>
        row.bucket === DEVELOPMENT_EVIDENCE_STORAGE_BUCKET &&
        row.verified_absent_at === null
    )
    .map(row => row.object_path);
}

export function attemptedPathsStayWithinManifest(
  capturedPaths: readonly string[],
  attemptedPaths: readonly string[]
): boolean {
  const allowed = new Set(capturedPaths);
  return attemptedPaths.every(path => allowed.has(path));
}

async function loadManifestRows(
  supabase: SupabaseClient,
  deletionRunId: string
): Promise<{ ok: boolean; rows: BoundStorageManifestRow[] }> {
  const { data, error } = await supabase
    .from("organisation_deletion_storage_manifest")
    .select("id, bucket, object_path, deleted_at, verified_absent_at")
    .eq("deletion_run_id", deletionRunId);
  if (error) return { ok: false, rows: [] };
  return {
    ok: true,
    rows: (data ?? []) as BoundStorageManifestRow[],
  };
}

export async function objectStillPresent(
  supabase: SupabaseClient,
  bucket: string,
  objectPath: string
): Promise<boolean> {
  const parts = objectPath.split("/");
  const name = parts.at(-1);
  const parent = parts.slice(0, -1).join("/");
  if (!name) return true;
  const { data, error } = await supabase.storage.from(bucket).list(parent, {
    limit: 1000,
    search: name,
  });
  if (error) return true;
  return (data ?? []).some(item => item.name === name);
}

export async function organisationStoragePrefixHasRemainder(
  supabase: SupabaseClient,
  organisationId: string
): Promise<{ remainder: boolean; listed: boolean }> {
  const { data: top, error } = await supabase.storage
    .from(DEVELOPMENT_EVIDENCE_STORAGE_BUCKET)
    .list(organisationId, { limit: 1000, offset: 0 });
  if (error) return { remainder: true, listed: false };
  const entries = top ?? [];
  if (entries.length >= 1000) return { remainder: true, listed: false };
  for (const entry of entries) {
    const name = entry.name;
    if (!name) continue;
    const looksLikeFolder = !entry.id || entry.metadata == null;
    if (!looksLikeFolder) return { remainder: true, listed: true };
    const { data: nested, error: nestedError } = await supabase.storage
      .from(DEVELOPMENT_EVIDENCE_STORAGE_BUCKET)
      .list(`${organisationId}/${name}`, { limit: 1000, offset: 0 });
    if (nestedError) return { remainder: true, listed: false };
    if ((nested ?? []).length >= 1000) return { remainder: true, listed: false };
    if ((nested ?? []).some(item => item.name)) return { remainder: true, listed: true };
  }
  return { remainder: false, listed: true };
}

export async function deleteAndVerifyBoundStorage(input: {
  supabase: SupabaseClient;
  deletionRunId: string;
  organisationId: string;
  capturedCount: number;
}): Promise<{ ok: boolean; attemptedPaths: string[]; code?: string }> {
  const loaded = await loadManifestRows(input.supabase, input.deletionRunId);
  if (!loaded.ok) {
    return { ok: false, attemptedPaths: [], code: "PARTIAL_STORAGE_FAILURE" };
  }
  if (input.capturedCount > 0 && loaded.rows.length === 0) {
    return { ok: false, attemptedPaths: [], code: "STORAGE_MANIFEST_REQUIRED" };
  }
  if (
    loaded.rows.some(row => row.bucket !== DEVELOPMENT_EVIDENCE_STORAGE_BUCKET)
  ) {
    return { ok: false, attemptedPaths: [], code: "STORAGE_PATH_NOT_AUTHORITATIVE" };
  }

  const attemptedPaths = capturedStorageRemovalTargets(loaded.rows);
  const capturedPaths = loaded.rows.map(row => row.object_path);
  if (!attemptedPathsStayWithinManifest(capturedPaths, attemptedPaths)) {
    return { ok: false, attemptedPaths, code: "PARTIAL_STORAGE_FAILURE" };
  }

  for (const row of loaded.rows) {
    if (row.verified_absent_at) {
      if (await objectStillPresent(input.supabase, row.bucket, row.object_path)) {
        return {
          ok: false,
          attemptedPaths,
          code: "PARTIAL_STORAGE_FAILURE",
        };
      }
      continue;
    }
    const { error } = await input.supabase.storage
      .from(row.bucket)
      .remove([row.object_path]);
    if (error && (await objectStillPresent(input.supabase, row.bucket, row.object_path))) {
      return { ok: false, attemptedPaths, code: "PARTIAL_STORAGE_FAILURE" };
    }
    await input.supabase
      .from("organisation_deletion_storage_manifest")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("deletion_run_id", input.deletionRunId);
    if (await objectStillPresent(input.supabase, row.bucket, row.object_path)) {
      return { ok: false, attemptedPaths, code: "PARTIAL_STORAGE_FAILURE" };
    }
    await input.supabase
      .from("organisation_deletion_storage_manifest")
      .update({ verified_absent_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("deletion_run_id", input.deletionRunId);
  }

  const prefix = await organisationStoragePrefixHasRemainder(
    input.supabase,
    input.organisationId
  );
  if (!prefix.listed || prefix.remainder) {
    return { ok: false, attemptedPaths, code: "STORAGE_PREFIX_REMAINDER" };
  }
  return { ok: true, attemptedPaths };
}

export async function executeOrganisationTenantPurge(input: {
  ownerSupabase: SupabaseClient;
  inventorySupabase: SupabaseClient;
  organisationId: string;
  deletionRunId: string;
  confirmationName: string;
  instructionReference: string;
  permanentErasureAcknowledged: boolean;
}): Promise<PurgeExecResult> {
  if (!input.permanentErasureAcknowledged) {
    return {
      ok: false,
      code: "ACKNOWLEDGEMENT_REQUIRED",
      error: ownerTenantPurgeErrorMessage("ACKNOWLEDGEMENT_REQUIRED"),
      permanentDeletionOccurred: false,
      authUsersDeleted: false,
      certificateCreated: false,
    };
  }
  if (!OWNER_PURGE_AUTHORISATION.requiredFields.includes("permanentErasureAcknowledged")) {
    return {
      ok: false,
      code: "ACKNOWLEDGEMENT_REQUIRED",
      error: ownerTenantPurgeErrorMessage("ACKNOWLEDGEMENT_REQUIRED"),
      permanentDeletionOccurred: false,
      authUsersDeleted: false,
      certificateCreated: false,
    };
  }
  if (!input.instructionReference.trim()) {
    return {
      ok: false,
      code: "INSTRUCTION_REQUIRED",
      error: ownerTenantPurgeErrorMessage("INSTRUCTION_REQUIRED"),
      permanentDeletionOccurred: false,
      authUsersDeleted: false,
      certificateCreated: false,
    };
  }

  const state = await loadTenantPurgeState({
    ownerSupabase: input.ownerSupabase,
    inventorySupabase: input.inventorySupabase,
    organisationId: input.organisationId,
  });

  if (state.deletionRunId && state.deletionRunId !== input.deletionRunId) {
    return {
      ok: false,
      code: "INCONSISTENT_RUN",
      error: ownerTenantPurgeErrorMessage("INCONSISTENT_RUN"),
      permanentDeletionOccurred: false,
      authUsersDeleted: false,
      certificateCreated: false,
    };
  }

  const expectedName = (state.organisationName ?? "").trim();
  if (expectedName && expectedName !== input.confirmationName.trim()) {
    return {
      ok: false,
      code: "CONFIRMATION_NAME_MISMATCH",
      error: ownerTenantPurgeErrorMessage("CONFIRMATION_NAME_MISMATCH"),
      permanentDeletionOccurred: false,
      authUsersDeleted: false,
      certificateCreated: false,
    };
  }

  if (!state.purgeAvailable && !state.alreadyPurged && !state.partialFailure) {
    const first = state.blockingReasons[0];
    return {
      ok: false,
      code: first?.code ?? "PURGE_READINESS_BLOCKED",
      error: first?.message ?? ownerTenantPurgeErrorMessage("PURGE_READINESS_BLOCKED"),
      permanentDeletionOccurred: false,
      authUsersDeleted: false,
      certificateCreated: false,
    };
  }

  const capture = await rpcOk(input.ownerSupabase, OWNER_CAPTURE_STORAGE_MANIFEST_RPC, {
    p_organisation_id: input.organisationId,
    p_deletion_run_id: input.deletionRunId,
  });
  if (!capture.ok) {
    return {
      ok: false,
      code: capture.code ?? "UPDATE_FAILED",
      error: capture.error ?? ownerTenantPurgeErrorMessage(capture.code ?? "UPDATE_FAILED"),
      permanentDeletionOccurred: false,
      authUsersDeleted: false,
      certificateCreated: false,
    };
  }

  const purged = await rpcOk(input.ownerSupabase, OWNER_PURGE_TENANT_DATA_RPC, {
    p_organisation_id: input.organisationId,
    p_deletion_run_id: input.deletionRunId,
  });
  if (!purged.ok) {
    return {
      ok: false,
      code: purged.code ?? "UPDATE_FAILED",
      error: purged.error ?? ownerTenantPurgeErrorMessage(purged.code ?? "UPDATE_FAILED"),
      permanentDeletionOccurred: false,
      authUsersDeleted: false,
      certificateCreated: false,
    };
  }

  await rpcOk(input.ownerSupabase, OWNER_MARK_STORAGE_CLEANUP_RPC, {
    p_organisation_id: input.organisationId,
    p_deletion_run_id: input.deletionRunId,
    p_storage_status: "pending",
    p_stage: "storage_cleaning",
  });

  const capturedCount = Number(capture.payload.capturedCount ?? 0);
  const storage = await deleteAndVerifyBoundStorage({
    supabase: input.inventorySupabase,
    deletionRunId: input.deletionRunId,
    organisationId: input.organisationId,
    capturedCount,
  });

  const marked = await rpcOk(input.ownerSupabase, OWNER_MARK_STORAGE_CLEANUP_RPC, {
    p_organisation_id: input.organisationId,
    p_deletion_run_id: input.deletionRunId,
    p_storage_status: storage.ok ? "passed" : "failed",
    p_stage: storage.ok ? "awaiting_certificate" : "failed",
  });
  if (!marked.ok || !storage.ok) {
    return {
      ok: false,
      code: storage.code ?? "PARTIAL_STORAGE_FAILURE",
      error: ownerTenantPurgeErrorMessage(
        storage.code === "STORAGE_PREFIX_REMAINDER"
          ? "PARTIAL_STORAGE_FAILURE"
          : storage.code ?? "PARTIAL_STORAGE_FAILURE"
      ),
      permanentDeletionOccurred: true,
      authUsersDeleted: false,
      certificateCreated: false,
    };
  }

  const refreshed = await loadTenantPurgeState({
    ownerSupabase: input.ownerSupabase,
    inventorySupabase: input.inventorySupabase,
    organisationId: input.organisationId,
  });
  return { ok: true, state: { ...refreshed, alreadyPurged: true, awaitingCertificate: true } };
}

export function residualTenantRowsBlockPurge(input: {
  table: string;
  remainingCount: number;
}): {
  blocked: boolean;
  code: "RESIDUAL_TENANT_ROWS" | null;
  table: string;
  remainingCount: number;
} {
  const entry = ORGANISATION_PURGE_MANIFEST.find(item => item.table === input.table);
  if (!entry) {
    return {
      blocked: true,
      code: "RESIDUAL_TENANT_ROWS",
      table: input.table,
      remainingCount: input.remainingCount,
    };
  }
  const attribution = tenantPurgeResidualAttribution(entry);
  if (attribution === null) {
    return {
      blocked: false,
      code: null,
      table: input.table,
      remainingCount: input.remainingCount,
    };
  }
  if (input.remainingCount > 0) {
    return {
      blocked: true,
      code: "RESIDUAL_TENANT_ROWS",
      table: input.table,
      remainingCount: input.remainingCount,
    };
  }
  return {
    blocked: false,
    code: null,
    table: input.table,
    remainingCount: 0,
  };
}

export function residualVerificationBlocksStorageStage(
  residuals: Array<{ table: string; remainingCount: number }>
): boolean {
  return residuals.some(item => residualTenantRowsBlockPurge(item).blocked);
}

export function tenantPurgeSqlVerifiesResidualSurfaces(sql: string): boolean {
  const start = sql.indexOf("-- EXHAUSTIVE RESIDUAL VERIFICATION");
  const end = sql.indexOf("-- END EXHAUSTIVE RESIDUAL VERIFICATION");
  if (start < 0 || end < 0 || end <= start) return false;
  const section = sql.slice(start, end);
  const residualTablesCovered = TENANT_PURGE_RESIDUAL_SURFACES.every(item =>
    section.includes(`'${item.table}'`) ||
    section.includes(`public.${item.table}`)
  );
  const protectedExcludedFromOrgIdLoop = TENANT_PURGE_PROTECTED_TABLES.every(
    table => !new RegExp(`'${table}'`).test(section)
  );
  const failsBeforePurged =
    sql.indexOf("-- EXHAUSTIVE RESIDUAL VERIFICATION") <
      sql.indexOf("status = 'purged'") &&
    sql.indexOf("RESIDUAL_TENANT_ROWS") < sql.indexOf("status = 'purged'");
  return residualTablesCovered && protectedExcludedFromOrgIdLoop && failsBeforePurged;
}

export function tenantPurgeSqlForbidsAuthDeletion(sql: string): boolean {
  return (
    ORGANISATION_PURGE_MUST_NEVER_DELETE_AUTH_USERS &&
    FORBIDDEN_AUTH_USER_DELETION_APIS.every(api => !sql.includes(api)) &&
    !/auth\.admin/i.test(sql) &&
    !/delete\s+from\s+auth\.users/i.test(sql)
  );
}

export function tenantPurgeSqlProtectsSurfaces(sql: string): boolean {
  return (
    TENANT_PURGE_PROTECTED_TABLES.every(table => {
      const pattern = new RegExp(`delete\\s+from\\s+public\\.${table}\\b`, "i");
      return !pattern.test(sql);
    }) &&
    !/insert\s+into\s+public\.organisation_deletion_certificates/i.test(sql) &&
    !/status\s*=\s*'completed'/i.test(sql)
  );
}

void ORGANISATION_PURGE_MANIFEST;
void TENANT_PURGE_EXPLICIT_TABLES;
void TENANT_PURGE_RESIDUAL_SURFACES;
