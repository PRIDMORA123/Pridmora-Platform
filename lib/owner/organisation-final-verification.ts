/**
 * DATA-LIFECYCLE DL-08 Slice 4A — independent read-only final verification.
 *
 * GET only. Does not create a certificate, update the deletion run, mutate
 * tenant/retained/Storage/Auth data, or set completed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { RETAINED_COMMERCIAL_FORBIDDEN_SNAPSHOT_KEYS } from "@/lib/owner/organisation-deletion-foundation";
import { assessOrganisationMigrationReview } from "@/lib/owner/organisation-migration-review-attribution";
import {
  APPLICATION_PURGE_CLAIM,
  AUTHORITATIVE_STORAGE_BUCKET,
  COMMERCIAL_LIVE_TABLES,
  FORBIDDEN_AUTH_USER_DELETION_APIS,
  ORGANISATION_PURGE_MANIFEST,
  ORGANISATION_PURGE_MUST_NEVER_DELETE_AUTH_USERS,
  TENANT_PURGE_RESIDUAL_SURFACES,
  erasureClaim,
  tenantPurgeResidualAttribution,
  tenantPurgeResidualTables,
  type TenantPurgeResidualAttributionKind,
} from "@/lib/owner/organisation-purge-architecture";
import {
  isPlatformAuditEventMinimised,
  isSupportCaseMinimised,
} from "@/lib/owner/organisation-retain-minimise";
import { objectStillPresent } from "@/lib/owner/organisation-tenant-purge";

export const FINAL_VERIFICATION_VERSION = "dl-08-slice-4a-v1";

const CAPTURE_PERFORMED_STAGES = new Set([
  "storage_manifest_captured",
  "db_purging",
  "db_purged",
  "storage_cleaning",
  "storage_verified",
]);

const FRESH_LIVE_KINDS = new Set<TenantPurgeResidualAttributionKind>([
  "organisation_id",
  "current_organisation_id",
  "organisation_pk",
]);

const BOUND_SLICE3_KINDS = new Set<TenantPurgeResidualAttributionKind>([
  "snapshot_children",
  "client_id_in_org_clients",
  "migration_review_join",
]);

export type FinalVerificationResult = "passed" | "failed" | "not_ready";

export type FinalVerificationBlockingReason = {
  code: string;
  message: string;
};

export type LiveResidualSurface = {
  table: string;
  remainingCount: number;
  counted: boolean;
  passed: boolean;
  attribution: TenantPurgeResidualAttributionKind;
  evidence: "freshly_reverified";
};

export type BoundSlice3Surface = {
  table: string;
  evidence: "bound_slice3_execution";
  independentReverification: "not_available_parents_deleted";
  liveJoinRemainingCount: number;
  liveJoinPassed: boolean;
};

export type FinalVerificationState = {
  formerOrganisationId: string;
  organisationRowAbsent: boolean;
  organisationNameSnapshot: string | null;
  deletionRunId: string | null;
  runStatus: string | null;
  stage: string | null;
  commercialCopyVerificationStatus: string | null;
  finalVerificationResult: FinalVerificationResult;
  verificationVersion: typeof FINAL_VERIFICATION_VERSION;
  blockingReasons: FinalVerificationBlockingReason[];
  liveResiduals: LiveResidualSurface[];
  boundSlice3Evidence: BoundSlice3Surface[];
  liveCommercial: Array<{ table: string; remainingCount: number; passed: boolean }>;
  storage: {
    bucket: string;
    capturePerformed: boolean;
    explicitEmptyCapture: boolean;
    capturedCount: number;
    verifiedAbsentCount: number;
    pendingOrUnverifiedCount: number;
    prefixRemainderCount: number;
    prefixListed: boolean;
    passed: boolean;
  };
  retainedCommercial: {
    expectedTotal: number | null;
    actualTotal: number;
    countsMatch: boolean;
    coachingContentAbsent: boolean;
    passed: boolean;
  };
  retainedSupportAudit: {
    supportPending: number;
    supportMinimised: number;
    supportNonMinimised: number;
    auditPending: number;
    auditMinimised: number;
    auditNonMinimised: number;
    passed: boolean;
  };
  authUsersDeleted: false;
  authStatement: "this deletion process does not delete Auth users";
  backupStatus: "unknown";
  externalFollowUpStatus: "unknown";
  eligibleErasureClaim: typeof APPLICATION_PURGE_CLAIM | null;
  certificateExists: boolean;
  certificateCreated: false;
  runCompleted: boolean;
  certificateIssuable: boolean;
};

export function isDeletionCertificateIssuable(input: {
  finalVerificationResult: FinalVerificationResult;
  blockingReasons: Array<{ code: string }>;
  runStatus: string | null;
  stage: string | null;
  organisationRowAbsent: boolean;
  certificateExists: boolean;
  runCompleted: boolean;
}): boolean {
  return (
    input.finalVerificationResult === "passed" &&
    input.blockingReasons.length === 0 &&
    input.runStatus === "verifying" &&
    input.stage === "awaiting_certificate" &&
    input.organisationRowAbsent &&
    !input.certificateExists &&
    !input.runCompleted
  );
}

export function storageCaptureWasPerformed(input: {
  stage: string | null;
  status?: string | null;
  storageStatus: string | null;
}): boolean {
  void input.status;
  return (
    input.storageStatus === "pending" ||
    input.storageStatus === "passed" ||
    input.storageStatus === "failed" ||
    CAPTURE_PERFORMED_STAGES.has(input.stage ?? "")
  );
}

export function explicitEmptyStorageCaptureProven(input: {
  capturedCount: number;
  capturePerformed: boolean;
}): boolean {
  return input.capturedCount === 0 && input.capturePerformed;
}

export function evaluateStorageFinalVerification(input: {
  manifestLoadFailed: boolean;
  capturePerformed: boolean;
  capturedCount: number;
  pendingOrUnverifiedCount: number;
  capturedObjectsAbsent: boolean;
  prefixListed: boolean;
  prefixRemainderCount: number;
}): {
  explicitEmptyCapture: boolean;
  passed: boolean;
  codes: string[];
} {
  const explicitEmptyCapture = explicitEmptyStorageCaptureProven({
    capturedCount: input.capturedCount,
    capturePerformed: input.capturePerformed,
  });
  const codes: string[] = [];
  if (!input.capturePerformed || (input.capturedCount === 0 && !explicitEmptyCapture)) {
    codes.push("STORAGE_CAPTURE_NOT_PERFORMED");
  }
  if (input.pendingOrUnverifiedCount > 0 || !input.capturedObjectsAbsent) {
    codes.push("STORAGE_NOT_VERIFIED_ABSENT");
  }
  if (!input.prefixListed || input.prefixRemainderCount !== 0) {
    codes.push("STORAGE_PREFIX_REMAINDER");
  }
  return {
    explicitEmptyCapture,
    passed:
      !input.manifestLoadFailed &&
      input.capturePerformed &&
      (input.capturedCount > 0 || explicitEmptyCapture) &&
      input.pendingOrUnverifiedCount === 0 &&
      input.capturedObjectsAbsent &&
      input.prefixListed &&
      input.prefixRemainderCount === 0,
    codes,
  };
}

export function residualSurfaceEvidenceKind(
  kind: TenantPurgeResidualAttributionKind
): LiveResidualSurface["evidence"] | BoundSlice3Surface["evidence"] {
  return FRESH_LIVE_KINDS.has(kind) ? "freshly_reverified" : "bound_slice3_execution";
}

function isMissingRelation(message: string): boolean {
  return (
    /could not find the table/i.test(message) ||
    /schema cache/i.test(message) ||
    /does not exist/i.test(message) ||
    /relation .* does not exist/i.test(message)
  );
}

async function countEq(
  supabase: SupabaseClient,
  table: string,
  column: string,
  value: string,
  optional = false
): Promise<{ count: number; counted: boolean }> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, value);
  if (error) {
    if (optional && isMissingRelation(error.message)) {
      return { count: 0, counted: true };
    }
    return { count: 0, counted: false };
  }
  return { count: count ?? 0, counted: true };
}

async function listPrefixRemainderCount(
  supabase: SupabaseClient,
  organisationId: string
): Promise<{ count: number; listed: boolean }> {
  const { data: top, error } = await supabase.storage
    .from(AUTHORITATIVE_STORAGE_BUCKET)
    .list(organisationId, { limit: 1000, offset: 0 });
  if (error) return { count: -1, listed: false };
  const entries = top ?? [];
  if (entries.length >= 1000) return { count: -1, listed: false };
  let files = 0;
  for (const entry of entries) {
    const name = entry.name;
    if (!name) continue;
    const looksLikeFolder = !entry.id || entry.metadata == null;
    if (!looksLikeFolder) {
      files += 1;
      continue;
    }
    const { data: nested, error: nestedError } = await supabase.storage
      .from(AUTHORITATIVE_STORAGE_BUCKET)
      .list(`${organisationId}/${name}`, { limit: 1000, offset: 0 });
    if (nestedError) return { count: -1, listed: false };
    if ((nested ?? []).length >= 1000) return { count: -1, listed: false };
    files += (nested ?? []).filter(item => item.name).length;
  }
  return { count: files, listed: true };
}

function commercialSourcesFromInventory(inventory: unknown): Array<{
  recordType: string;
  retainedCount: number;
}> {
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) {
    return [];
  }
  const retention = (inventory as { commercialRetention?: unknown }).commercialRetention;
  if (!retention || typeof retention !== "object" || Array.isArray(retention)) {
    return [];
  }
  const sources = (retention as { sources?: unknown }).sources;
  if (!Array.isArray(sources)) return [];
  return sources.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const recordType = (item as { recordType?: unknown }).recordType;
    const retainedCount = (item as { retainedCount?: unknown }).retainedCount;
    if (typeof recordType !== "string" || typeof retainedCount !== "number") return [];
    return [{ recordType, retainedCount }];
  });
}

function expectedTotalFromSources(
  sources: Array<{ recordType: string; retainedCount: number }>
): number {
  return sources.reduce((sum, item) => sum + item.retainedCount, 0);
}

export async function loadFinalVerificationState(input: {
  ownerSupabase: SupabaseClient;
  inventorySupabase: SupabaseClient;
  formerOrganisationId: string;
}): Promise<FinalVerificationState> {
  const formerOrganisationId = input.formerOrganisationId;
  const blockingReasons: FinalVerificationBlockingReason[] = [];

  const { data: orgRow } = await input.inventorySupabase
    .from("organisations")
    .select("id")
    .eq("id", formerOrganisationId)
    .maybeSingle();
  const organisationRowAbsent = !orgRow;

  const runSelect =
    "id, organisation_id, former_organisation_id, organisation_name_snapshot, status, stage, storage_status, verification_status, inventory, last_error, requested_at, completed_at";
  const { data: openRun } = await input.ownerSupabase
    .from("organisation_deletion_runs")
    .select(runSelect)
    .eq("former_organisation_id", formerOrganisationId)
    .neq("status", "completed")
    .neq("status", "blocked")
    .maybeSingle();
  let run = openRun;
  if (!run) {
    const { data: completedRun } = await input.ownerSupabase
      .from("organisation_deletion_runs")
      .select(runSelect)
      .eq("former_organisation_id", formerOrganisationId)
      .eq("status", "completed")
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    run = completedRun;
  }

  const { count: certificateCount } = await input.ownerSupabase
    .from("organisation_deletion_certificates")
    .select("*", { count: "exact", head: true })
    .eq("former_organisation_id", formerOrganisationId)
    .eq("deletion_run_id", typeof run?.id === "string" ? run.id : "00000000-0000-4000-8000-000000000000");

  const runCompleted = run?.status === "completed";
  const base = {
    formerOrganisationId,
    organisationRowAbsent,
    organisationNameSnapshot:
      typeof run?.organisation_name_snapshot === "string"
        ? run.organisation_name_snapshot
        : null,
    deletionRunId: typeof run?.id === "string" ? run.id : null,
    runStatus: typeof run?.status === "string" ? run.status : null,
    stage: typeof run?.stage === "string" ? run.stage : null,
    commercialCopyVerificationStatus:
      typeof run?.verification_status === "string" ? run.verification_status : null,
    verificationVersion: FINAL_VERIFICATION_VERSION as typeof FINAL_VERIFICATION_VERSION,
    authUsersDeleted: false as const,
    authStatement: "this deletion process does not delete Auth users" as const,
    backupStatus: "unknown" as const,
    externalFollowUpStatus: "unknown" as const,
    certificateExists: (certificateCount ?? 0) > 0,
    certificateCreated: false as const,
    runCompleted,
    certificateIssuable: false,
  };

  if (!run || typeof run.id !== "string") {
    blockingReasons.push({
      code: "RUN_NOT_FOUND",
      message: "No open deletion run exists for this former organisation.",
    });
    return emptyFailedState(base, blockingReasons, "not_ready");
  }
  if (run.former_organisation_id !== formerOrganisationId) {
    blockingReasons.push({
      code: "INCONSISTENT_RUN",
      message: "Deletion run identity does not match this former organisation.",
    });
    return emptyFailedState(base, blockingReasons, "not_ready");
  }
  if (runCompleted && !base.certificateExists) {
    blockingReasons.push({
      code: "INCONSISTENT_CERTIFICATE_STATE",
      message: "A completed deletion run must have exactly one certificate.",
    });
    return emptyFailedState(base, blockingReasons, "failed");
  }
  if (runCompleted && base.certificateExists) {
    return {
      ...emptyFailedState(base, [], "passed"),
      runCompleted: true,
      certificateExists: true,
      certificateIssuable: false,
      blockingReasons: [],
      eligibleErasureClaim: APPLICATION_PURGE_CLAIM,
      retainedCommercial: {
        expectedTotal: null,
        actualTotal: 0,
        countsMatch: true,
        coachingContentAbsent: true,
        passed: true,
      },
      retainedSupportAudit: {
        supportPending: 0,
        supportMinimised: 0,
        supportNonMinimised: 0,
        auditPending: 0,
        auditMinimised: 0,
        auditNonMinimised: 0,
        passed: true,
      },
      storage: {
        bucket: AUTHORITATIVE_STORAGE_BUCKET,
        capturePerformed: true,
        explicitEmptyCapture: false,
        capturedCount: 0,
        verifiedAbsentCount: 0,
        pendingOrUnverifiedCount: 0,
        prefixRemainderCount: 0,
        prefixListed: true,
        passed: true,
      },
    };
  }
  if (base.certificateExists && run.status === "verifying") {
    blockingReasons.push({
      code: "INCONSISTENT_CERTIFICATE_STATE",
      message: "A certificate already exists for a run that is not completed.",
    });
  }
  if (run.status !== "verifying" || run.stage !== "awaiting_certificate") {
    blockingReasons.push({
      code: "RUN_STATE_NOT_ALLOWED",
      message: "Final verification requires status verifying and stage awaiting_certificate.",
    });
  }

  const liveResiduals: LiveResidualSurface[] = [];
  for (const table of tenantPurgeResidualTables("organisation_id")) {
    const counted = await countEq(
      input.inventorySupabase,
      table,
      "organisation_id",
      formerOrganisationId,
      false
    );
    liveResiduals.push({
      table,
      remainingCount: counted.count,
      counted: counted.counted,
      passed: counted.counted && counted.count === 0,
      attribution: "organisation_id",
      evidence: "freshly_reverified",
    });
  }

  const profileLinks = await countEq(
    input.inventorySupabase,
    "profiles",
    "current_organisation_id",
    formerOrganisationId
  );
  liveResiduals.push({
    table: "profiles",
    remainingCount: profileLinks.count,
    counted: profileLinks.counted,
    passed: profileLinks.counted && profileLinks.count === 0,
    attribution: "current_organisation_id",
    evidence: "freshly_reverified",
  });

  const orgCount = organisationRowAbsent
    ? { count: 0, counted: true }
    : { count: 1, counted: true };
  liveResiduals.push({
    table: "organisations",
    remainingCount: orgCount.count,
    counted: true,
    passed: orgCount.count === 0,
    attribution: "organisation_pk",
    evidence: "freshly_reverified",
  });

  const liveCommercial = [];
  for (const table of COMMERCIAL_LIVE_TABLES) {
    const counted = await countEq(
      input.inventorySupabase,
      table,
      "organisation_id",
      formerOrganisationId
    );
    liveCommercial.push({
      table,
      remainingCount: counted.count,
      passed: counted.counted && counted.count === 0,
    });
  }

  const { data: liveClients } = await input.inventorySupabase
    .from("clients")
    .select("id")
    .eq("organisation_id", formerOrganisationId);
  const { data: liveSessions } = await input.inventorySupabase
    .from("sessions")
    .select("id")
    .eq("organisation_id", formerOrganisationId);
  const descendantIds = new Set<string>(
    [...(liveClients ?? []), ...(liveSessions ?? [])]
      .map(row => (row as { id?: unknown }).id)
      .filter((id): id is string => typeof id === "string")
  );
  const migration = await assessOrganisationMigrationReview({
    supabase: input.inventorySupabase,
    organisationId: formerOrganisationId,
    descendantIds,
  });
  const migrationLivePassed =
    migration.counted &&
    migration.attributedCount === 0 &&
    migration.ambiguousCount === 0 &&
    migration.unknownTableCount === 0;

  const snapshotLive = await countSnapshotChildren(
    input.inventorySupabase,
    formerOrganisationId
  );
  const backupViaLiveClients =
    descendantIds.size === 0
      ? { count: 0, counted: true }
      : await countBackupForClientIds(input.inventorySupabase, [...descendantIds]);

  const boundSlice3Evidence: BoundSlice3Surface[] = [
    {
      table: "organisation_migration_review",
      evidence: "bound_slice3_execution",
      independentReverification: "not_available_parents_deleted",
      liveJoinRemainingCount: migration.attributedCount + migration.ambiguousCount + migration.unknownTableCount,
      liveJoinPassed: migrationLivePassed,
    },
    {
      table: "sessions_workflow_backup_20260726",
      evidence: "bound_slice3_execution",
      independentReverification: "not_available_parents_deleted",
      liveJoinRemainingCount: backupViaLiveClients.count,
      liveJoinPassed: backupViaLiveClients.counted && backupViaLiveClients.count === 0,
    },
    ...tenantPurgeResidualTables("snapshot_children").map(table => ({
      table,
      evidence: "bound_slice3_execution" as const,
      independentReverification: "not_available_parents_deleted" as const,
      liveJoinRemainingCount: snapshotLive[table]?.count ?? 0,
      liveJoinPassed: Boolean(snapshotLive[table]?.counted && snapshotLive[table]?.count === 0),
    })),
  ];

  const { data: manifestRows, error: manifestError } = await input.inventorySupabase
    .from("organisation_deletion_storage_manifest")
    .select("id, bucket, deleted_at, verified_absent_at, object_path")
    .eq("deletion_run_id", run.id);
  const capturePerformed = storageCaptureWasPerformed({
    stage: typeof run.stage === "string" ? run.stage : null,
    status: typeof run.status === "string" ? run.status : null,
    storageStatus: typeof run.storage_status === "string" ? run.storage_status : null,
  });
  const rows = manifestError ? [] : (manifestRows ?? []);
  const capturedCount = rows.length;
  const verifiedAbsentCount = rows.filter(row => row.verified_absent_at).length;
  const pendingOrUnverifiedCount = rows.filter(row => !row.verified_absent_at).length;
  const prefix = await listPrefixRemainderCount(
    input.inventorySupabase,
    formerOrganisationId
  );

  let capturedObjectsAbsent = true;
  if (!manifestError) {
    for (const row of rows) {
      if (row.bucket !== AUTHORITATIVE_STORAGE_BUCKET) {
        capturedObjectsAbsent = false;
        break;
      }
      if (await objectStillPresent(input.inventorySupabase, row.bucket, row.object_path)) {
        capturedObjectsAbsent = false;
        break;
      }
    }
  }

  const storageEval = evaluateStorageFinalVerification({
    manifestLoadFailed: Boolean(manifestError),
    capturePerformed,
    capturedCount,
    pendingOrUnverifiedCount,
    capturedObjectsAbsent,
    prefixListed: prefix.listed,
    prefixRemainderCount: prefix.listed ? prefix.count : -1,
  });
  const storagePassed = storageEval.passed;

  for (const code of storageEval.codes) {
    if (code === "STORAGE_CAPTURE_NOT_PERFORMED") {
      blockingReasons.push({
        code,
        message:
          "Zero Storage objects require an authoritative empty capture, not a missing manifest.",
      });
    } else if (code === "STORAGE_NOT_VERIFIED_ABSENT") {
      blockingReasons.push({
        code,
        message: "A captured Storage object is still present or unverified.",
      });
    } else {
      blockingReasons.push({
        code,
        message:
          "The organisation Storage prefix still has remainder objects or could not be listed.",
      });
    }
  }

  const expectedSources = commercialSourcesFromInventory(run.inventory);
  let actualTotal = 0;
  let countsMatch = expectedSources.length > 0;
  for (const source of expectedSources) {
    const scoped = await input.ownerSupabase
      .from("retained_organisation_commercial_records")
      .select("*", { count: "exact", head: true })
      .eq("deletion_run_id", run.id)
      .eq("record_type", source.recordType);
    const actualCount = scoped.count ?? 0;
    actualTotal += actualCount;
    if (scoped.error || actualCount !== source.retainedCount) countsMatch = false;
  }
  if (expectedSources.length === 0) {
    const { count } = await input.ownerSupabase
      .from("retained_organisation_commercial_records")
      .select("*", { count: "exact", head: true })
      .eq("deletion_run_id", run.id);
    actualTotal = count ?? 0;
    countsMatch = false;
    blockingReasons.push({
      code: "COMMERCIAL_COPY_INVENTORY_MISSING",
      message: "DL-06 commercial retention inventory is not available on the deletion run.",
    });
  } else {
    const { count: scopedAll, error: scopedAllError } = await input.ownerSupabase
      .from("retained_organisation_commercial_records")
      .select("*", { count: "exact", head: true })
      .eq("deletion_run_id", run.id);
    if (scopedAllError || (scopedAll ?? 0) !== expectedTotalFromSources(expectedSources)) {
      countsMatch = false;
    }
  }

  const { data: retainedRows } = await input.ownerSupabase
    .from("retained_organisation_commercial_records")
    .select("record_type, snapshot")
    .eq("deletion_run_id", run.id);
  let coachingContentAbsent = true;
  for (const row of retainedRows ?? []) {
    const snapshot = (row as { snapshot?: unknown }).snapshot;
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) continue;
    if (
      RETAINED_COMMERCIAL_FORBIDDEN_SNAPSHOT_KEYS.some(key =>
        Object.prototype.hasOwnProperty.call(snapshot, key)
      )
    ) {
      coachingContentAbsent = false;
      break;
    }
  }

  const supportPending = await countEq(
    input.inventorySupabase,
    "support_cases",
    "organisation_id",
    formerOrganisationId
  );
  const auditPending = await countEq(
    input.inventorySupabase,
    "platform_audit_events",
    "organisation_id",
    formerOrganisationId
  );
  const { data: supportRows } = await input.inventorySupabase
    .from("support_cases")
    .select(
      "organisation_id, former_organisation_id, user_id, subject, description, assigned_to, resolution_notes, created_by"
    )
    .eq("former_organisation_id", formerOrganisationId);
  const { data: auditRows } = await input.inventorySupabase
    .from("platform_audit_events")
    .select("organisation_id, former_organisation_id, entity_type, entity_id, metadata")
    .eq("former_organisation_id", formerOrganisationId);

  const supportNonMinimised = (supportRows ?? []).filter(
    row => !isSupportCaseMinimised(row as Record<string, unknown>)
  ).length;
  const auditNonMinimised = (auditRows ?? []).filter(
    row => !isPlatformAuditEventMinimised(row as Record<string, unknown>)
  ).length;

  const retainedSupportAuditPassed =
    supportPending.counted &&
    auditPending.counted &&
    supportPending.count === 0 &&
    auditPending.count === 0 &&
    supportNonMinimised === 0 &&
    auditNonMinimised === 0;

  if (!organisationRowAbsent) {
    blockingReasons.push({
      code: "ORGANISATION_ROW_REMAINS",
      message: "The organisations row is still present.",
    });
  }
  for (const surface of liveResiduals) {
    if (!surface.passed) {
      blockingReasons.push({
        code: "RESIDUAL_TENANT_ROWS",
        message: `${surface.table} still has ${surface.remainingCount} live residual row(s).`,
      });
    }
  }
  for (const surface of liveCommercial) {
    if (!surface.passed) {
      blockingReasons.push({
        code: "LIVE_COMMERCIAL_REMAINS",
        message: `${surface.table} still has live commercial rows.`,
      });
    }
  }
  if (!migrationLivePassed) {
    blockingReasons.push({
      code: "MIGRATION_REVIEW_LIVE_RESIDUAL",
      message: "Live-attributable migration-review residuals remain.",
    });
  }
  if (!countsMatch || !coachingContentAbsent) {
    blockingReasons.push({
      code: "RETAINED_COMMERCIAL_MISMATCH",
      message: "Retained commercial counts do not match DL-06 inventory or contain forbidden content.",
    });
  }
  if (!retainedSupportAuditPassed) {
    blockingReasons.push({
      code: "RETAIN_MINIMISE_INCOMPLETE",
      message: "Retained support or audit rows are pending or not minimised.",
    });
  }
  if (!ORGANISATION_PURGE_MUST_NEVER_DELETE_AUTH_USERS) {
    blockingReasons.push({
      code: "AUTH_PROHIBITION_MISSING",
      message: "Auth-user deletion prohibition is not in force.",
    });
  }

  const verificationGatesReady =
    run.status === "verifying" && run.stage === "awaiting_certificate";
  const passed =
    verificationGatesReady &&
    blockingReasons.length === 0 &&
    liveResiduals.every(item => item.passed) &&
    liveCommercial.every(item => item.passed) &&
    storagePassed &&
    countsMatch &&
    coachingContentAbsent &&
    retainedSupportAuditPassed &&
    organisationRowAbsent &&
    ORGANISATION_PURGE_MUST_NEVER_DELETE_AUTH_USERS &&
    !FORBIDDEN_AUTH_USER_DELETION_APIS.some(api => api.length === 0);

  const expectedTotal = expectedTotalFromSources(expectedSources);

  return {
    ...base,
    finalVerificationResult: !verificationGatesReady
      ? "not_ready"
      : passed
        ? "passed"
        : "failed",
    blockingReasons,
    liveResiduals,
    boundSlice3Evidence,
    liveCommercial,
    storage: {
      bucket: AUTHORITATIVE_STORAGE_BUCKET,
      capturePerformed,
      explicitEmptyCapture: storageEval.explicitEmptyCapture,
      capturedCount,
      verifiedAbsentCount,
      pendingOrUnverifiedCount,
      prefixRemainderCount: prefix.listed ? prefix.count : -1,
      prefixListed: prefix.listed,
      passed: storagePassed,
    },
    retainedCommercial: {
      expectedTotal: expectedSources.length > 0 ? expectedTotal : null,
      actualTotal,
      countsMatch,
      coachingContentAbsent,
      passed: countsMatch && coachingContentAbsent,
    },
    retainedSupportAudit: {
      supportPending: supportPending.count,
      supportMinimised: (supportRows ?? []).length - supportNonMinimised,
      supportNonMinimised,
      auditPending: auditPending.count,
      auditMinimised: (auditRows ?? []).length - auditNonMinimised,
      auditNonMinimised,
      passed: retainedSupportAuditPassed,
    },
    eligibleErasureClaim:
      passed &&
      erasureClaim({
        applicationDataPurged: true,
        backupStatus: "unknown",
        externalFollowUpStatus: "unknown",
      }) === APPLICATION_PURGE_CLAIM
        ? APPLICATION_PURGE_CLAIM
        : null,
    certificateIssuable: isDeletionCertificateIssuable({
      finalVerificationResult: !verificationGatesReady
        ? "not_ready"
        : passed
          ? "passed"
          : "failed",
      blockingReasons,
      runStatus: typeof run.status === "string" ? run.status : null,
      stage: typeof run.stage === "string" ? run.stage : null,
      organisationRowAbsent,
      certificateExists: base.certificateExists,
      runCompleted,
    }),
  };
}

function emptyFailedState(
  base: Omit<
    FinalVerificationState,
    | "finalVerificationResult"
    | "blockingReasons"
    | "liveResiduals"
    | "boundSlice3Evidence"
    | "liveCommercial"
    | "storage"
    | "retainedCommercial"
    | "retainedSupportAudit"
    | "eligibleErasureClaim"
  >,
  blockingReasons: FinalVerificationBlockingReason[],
  result: FinalVerificationResult
): FinalVerificationState {
  return {
    ...base,
    finalVerificationResult: result,
    blockingReasons,
    liveResiduals: [],
    boundSlice3Evidence: TENANT_PURGE_RESIDUAL_SURFACES.filter(item =>
      BOUND_SLICE3_KINDS.has(tenantPurgeResidualAttribution(item) as TenantPurgeResidualAttributionKind)
    ).map(item => ({
      table: item.table,
      evidence: "bound_slice3_execution" as const,
      independentReverification: "not_available_parents_deleted" as const,
      liveJoinRemainingCount: 0,
      liveJoinPassed: false,
    })),
    liveCommercial: [...COMMERCIAL_LIVE_TABLES].map(table => ({
      table,
      remainingCount: 0,
      passed: false,
    })),
    storage: {
      bucket: AUTHORITATIVE_STORAGE_BUCKET,
      capturePerformed: false,
      explicitEmptyCapture: false,
      capturedCount: 0,
      verifiedAbsentCount: 0,
      pendingOrUnverifiedCount: 0,
      prefixRemainderCount: -1,
      prefixListed: false,
      passed: false,
    },
    retainedCommercial: {
      expectedTotal: null,
      actualTotal: 0,
      countsMatch: false,
      coachingContentAbsent: true,
      passed: false,
    },
    retainedSupportAudit: {
      supportPending: 0,
      supportMinimised: 0,
      supportNonMinimised: 0,
      auditPending: 0,
      auditMinimised: 0,
      auditNonMinimised: 0,
      passed: false,
    },
    eligibleErasureClaim: null,
  };
}

async function countSnapshotChildren(
  supabase: SupabaseClient,
  organisationId: string
): Promise<Record<string, { count: number; counted: boolean }>> {
  const { data: snapshots, error } = await supabase
    .from("organisation_intelligence_snapshots")
    .select("id")
    .eq("organisation_id", organisationId);
  const out: Record<string, { count: number; counted: boolean }> = {};
  const ids = (snapshots ?? [])
    .map(row => (row as { id?: unknown }).id)
    .filter((id): id is string => typeof id === "string");
  for (const table of tenantPurgeResidualTables("snapshot_children")) {
    if (error) {
      out[table] = { count: 0, counted: false };
      continue;
    }
    if (ids.length === 0) {
      out[table] = { count: 0, counted: true };
      continue;
    }
    const { count, error: childError } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .in("snapshot_id", ids);
    out[table] = { count: count ?? 0, counted: !childError };
  }
  return out;
}

async function countBackupForClientIds(
  supabase: SupabaseClient,
  clientIds: string[]
): Promise<{ count: number; counted: boolean }> {
  if (clientIds.length === 0) return { count: 0, counted: true };
  const { count, error } = await supabase
    .from("sessions_workflow_backup_20260726")
    .select("*", { count: "exact", head: true })
    .in("client_id", clientIds);
  if (error) {
    if (isMissingRelation(error.message)) return { count: 0, counted: true };
    return { count: 0, counted: false };
  }
  return { count: count ?? 0, counted: true };
}

export function finalVerificationSourceIsReadOnly(source: string): boolean {
  return (
    !/\.insert\s*\(/.test(source) &&
    !/\.update\s*\(/.test(source) &&
    !/\.upsert\s*\(/.test(source) &&
    !/\.delete\s*\(/.test(source) &&
    !/\.rpc\s*\(/.test(source) &&
    !/\.remove\s*\(/.test(source) &&
    !/\.download\s*\(/.test(source) &&
    !/auth\.admin\.deleteUser/.test(source) &&
    !/insert\s+into\s+public\.organisation_deletion_certificates/i.test(source) &&
    !/status\s*=\s*'completed'/.test(source)
  );
}

void ORGANISATION_PURGE_MANIFEST;
