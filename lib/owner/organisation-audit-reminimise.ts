/**
 * DATA-LIFECYCLE — last-mile re-minimise of retained platform_audit_events
 * after tenant purge. Works without the organisations row. Does not create a
 * certificate, change the deletion run, or mutate Storage/Auth/commercial data.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isPlatformAuditEventMinimised,
  minimisePlatformAuditMetadata,
} from "@/lib/owner/organisation-retain-minimise";
import {
  PLATFORM_AUDIT_METADATA_ALLOWLIST,
  WRITE_MINIMISED_DELETION_LIFECYCLE_AUDIT_SQL,
} from "@/lib/owner/organisation-purge-architecture";

export const OWNER_REMINIMISE_ORGANISATION_AUDIT_RPC =
  "owner_reminimise_organisation_audit_events";

export const POST_PURGE_AUDIT_REMINIMISE_ERROR_CODES = [
  "UNAUTHENTICATED",
  "PERMISSION_DENIED",
  "ORGANISATION_REQUIRED",
  "RUN_NOT_FOUND",
  "INCONSISTENT_RUN",
  "RUN_STATE_NOT_ALLOWED",
  "ACKNOWLEDGEMENT_REQUIRED",
  "UPDATE_FAILED",
] as const;

export type PostPurgeAuditReminimiseErrorCode =
  (typeof POST_PURGE_AUDIT_REMINIMISE_ERROR_CODES)[number];

export type AuditReminimiseState = {
  formerOrganisationId: string;
  organisationRowAbsent: boolean;
  deletionRunId: string | null;
  runStatus: string | null;
  stage: string | null;
  auditPending: number;
  auditMinimised: number;
  auditNonMinimised: number;
  reminimiseAvailable: boolean;
  runStatusUnchanged: true;
  certificateCreated: false;
  authUsersDeleted: false;
  storageDeleted: false;
  tenantRowsDeleted: false;
};

export function ownerAuditReminimiseErrorMessage(
  code: PostPurgeAuditReminimiseErrorCode | string
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
      return "Audit re-minimise is only available after tenant purge and before completion.";
    case "ACKNOWLEDGEMENT_REQUIRED":
      return "Confirm that this re-minimises retained audit events only.";
    default:
      return "Unable to re-minimise retained audit events.";
  }
}

export function postPurgeAuditMetadataOmitsAuthUsersDeleted(
  metadata: Record<string, unknown>
): boolean {
  if ((PLATFORM_AUDIT_METADATA_ALLOWLIST as readonly string[]).includes("authUsersDeleted")) {
    return true;
  }
  return !Object.prototype.hasOwnProperty.call(metadata, "authUsersDeleted");
}

export function minimisedPostPurgeLifecycleAuditMetadata(input: {
  formerOrganisationId: string;
  deletionRunId: string;
  runStatus: string;
  stage: string;
}): Record<string, unknown> {
  return minimisePlatformAuditMetadata({
    formerOrganisationId: input.formerOrganisationId,
    deletionRunId: input.deletionRunId,
    runStatus: input.runStatus,
    stage: input.stage,
    permanentDeletionOccurred: true,
    authUsersDeleted: false,
  });
}

async function countEq(
  supabase: SupabaseClient,
  table: string,
  column: string,
  value: string
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, value);
  if (error) return -1;
  return count ?? 0;
}

export async function loadAuditReminimiseState(input: {
  ownerSupabase: SupabaseClient;
  inventorySupabase: SupabaseClient;
  formerOrganisationId: string;
}): Promise<AuditReminimiseState> {
  const { data: orgRow } = await input.inventorySupabase
    .from("organisations")
    .select("id")
    .eq("id", input.formerOrganisationId)
    .maybeSingle();

  const { data: run } = await input.ownerSupabase
    .from("organisation_deletion_runs")
    .select("id, former_organisation_id, status, stage")
    .eq("former_organisation_id", input.formerOrganisationId)
    .neq("status", "completed")
    .neq("status", "blocked")
    .maybeSingle();

  const auditPending = await countEq(
    input.inventorySupabase,
    "platform_audit_events",
    "organisation_id",
    input.formerOrganisationId
  );
  const { data: auditRows } = await input.inventorySupabase
    .from("platform_audit_events")
    .select("organisation_id, former_organisation_id, entity_type, entity_id, metadata")
    .eq("former_organisation_id", input.formerOrganisationId);
  const nonMinimised = (auditRows ?? []).filter(
    row => !isPlatformAuditEventMinimised(row as Record<string, unknown>)
  ).length;

  const runStatus = typeof run?.status === "string" ? run.status : null;
  const reminimiseAvailable =
    Boolean(run?.id) &&
    (runStatus === "purged" ||
      runStatus === "storage_cleaning" ||
      runStatus === "verifying" ||
      runStatus === "failed");

  return {
    formerOrganisationId: input.formerOrganisationId,
    organisationRowAbsent: !orgRow,
    deletionRunId: typeof run?.id === "string" ? run.id : null,
    runStatus,
    stage: typeof run?.stage === "string" ? run.stage : null,
    auditPending: auditPending < 0 ? 0 : auditPending,
    auditMinimised: (auditRows ?? []).length - nonMinimised,
    auditNonMinimised: nonMinimised,
    reminimiseAvailable,
    runStatusUnchanged: true,
    certificateCreated: false,
    authUsersDeleted: false,
    storageDeleted: false,
    tenantRowsDeleted: false,
  };
}

export type ReminimiseAuditResult =
  | {
      ok: true;
      formerOrganisationId: string;
      deletionRunId: string;
      runStatus: string | null;
      stage: string | null;
      auditEventsUpdated: number;
      auditNonMinimised: number;
      runStatusUnchanged: true;
      certificateCreated: false;
      authUsersDeleted: false;
      storageDeleted: false;
      tenantRowsDeleted: false;
    }
  | {
      ok: false;
      code: string;
      error: string;
      certificateCreated: false;
      authUsersDeleted: false;
    };

function isErrorCode(value: unknown): value is PostPurgeAuditReminimiseErrorCode {
  return (
    typeof value === "string" &&
    (POST_PURGE_AUDIT_REMINIMISE_ERROR_CODES as readonly string[]).includes(value)
  );
}

export async function reminimiseOrganisationAuditEvents(input: {
  ownerSupabase: SupabaseClient;
  inventorySupabase: SupabaseClient;
  formerOrganisationId: string;
  deletionRunId: string;
  reminimiseAcknowledged: boolean;
}): Promise<ReminimiseAuditResult> {
  if (!input.reminimiseAcknowledged) {
    return {
      ok: false,
      code: "ACKNOWLEDGEMENT_REQUIRED",
      error: ownerAuditReminimiseErrorMessage("ACKNOWLEDGEMENT_REQUIRED"),
      certificateCreated: false,
      authUsersDeleted: false,
    };
  }

  const state = await loadAuditReminimiseState({
    ownerSupabase: input.ownerSupabase,
    inventorySupabase: input.inventorySupabase,
    formerOrganisationId: input.formerOrganisationId,
  });
  if (state.deletionRunId && state.deletionRunId !== input.deletionRunId) {
    return {
      ok: false,
      code: "INCONSISTENT_RUN",
      error: ownerAuditReminimiseErrorMessage("INCONSISTENT_RUN"),
      certificateCreated: false,
      authUsersDeleted: false,
    };
  }

  const { data, error } = await input.ownerSupabase.rpc(
    OWNER_REMINIMISE_ORGANISATION_AUDIT_RPC,
    {
      p_former_organisation_id: input.formerOrganisationId,
      p_deletion_run_id: input.deletionRunId,
    }
  );

  if (error) {
    return {
      ok: false,
      code: "UPDATE_FAILED",
      error: error.message || ownerAuditReminimiseErrorMessage("UPDATE_FAILED"),
      certificateCreated: false,
      authUsersDeleted: false,
    };
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  if (payload.ok === false) {
    const code = isErrorCode(payload.code) ? payload.code : "UPDATE_FAILED";
    return {
      ok: false,
      code,
      error: ownerAuditReminimiseErrorMessage(code),
      certificateCreated: false,
      authUsersDeleted: false,
    };
  }

  const refreshed = await loadAuditReminimiseState({
    ownerSupabase: input.ownerSupabase,
    inventorySupabase: input.inventorySupabase,
    formerOrganisationId: input.formerOrganisationId,
  });

  return {
    ok: true,
    formerOrganisationId: input.formerOrganisationId,
    deletionRunId: String(payload.deletionRunId ?? input.deletionRunId),
    runStatus: refreshed.runStatus,
    stage: refreshed.stage,
    auditEventsUpdated: Number(payload.auditEventsUpdated ?? 0),
    auditNonMinimised: refreshed.auditNonMinimised,
    runStatusUnchanged: true,
    certificateCreated: false,
    authUsersDeleted: false,
    storageDeleted: false,
    tenantRowsDeleted: false,
  };
}

void WRITE_MINIMISED_DELETION_LIFECYCLE_AUDIT_SQL;
