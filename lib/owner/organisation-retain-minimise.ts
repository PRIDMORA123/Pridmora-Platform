/**
 * DATA-LIFECYCLE DL-08 Slice 2 — retain_minimise for support_cases and
 * platform_audit_events.
 *
 * Preserves a minimum operational/compliance record. Does not delete tenant
 * rows, Storage, or Auth users, and does not advance a deletion run into purge.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadOpenOrganisationDeletionRun } from "@/lib/owner/organisation-deletion-initiation";
import {
  MINIMISED_SUPPORT_CASE_SUBJECT,
  PLATFORM_AUDIT_ENTITY_ID_RETAIN_TYPES,
  PLATFORM_AUDIT_FIELD_TREATMENT,
  PLATFORM_AUDIT_METADATA_ALLOWLIST,
  PLATFORM_AUDIT_SCHEMA_COLUMNS,
  SUPPORT_CASE_FIELD_TREATMENT,
  SUPPORT_CASE_SCHEMA_COLUMNS,
} from "@/lib/owner/organisation-purge-architecture";

export const OWNER_MINIMISE_ORGANISATION_RETAIN_RPC =
  "owner_minimise_organisation_retain_records";

export const MINIMISED_SUPPORT_DESCRIPTION = "";
export const PLATFORM_AUDIT_METADATA_MAX_STRING = 200;

const AUDIT_METADATA_ALLOWLIST = new Set<string>(
  PLATFORM_AUDIT_METADATA_ALLOWLIST
);
const NESTED_COUNT_KEYS = new Set(["sourceCounts", "retainedCounts"]);

export const OWNER_MINIMISE_RETAIN_ERROR_CODES = [
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
  "UNKNOWN_COLUMN",
  "UPDATE_FAILED",
] as const;

export type OwnerMinimiseRetainErrorCode =
  (typeof OWNER_MINIMISE_RETAIN_ERROR_CODES)[number];

export type MinimisedSupportCase = {
  id: unknown;
  organisation_id: null;
  former_organisation_id: unknown;
  user_id: null;
  category: unknown;
  subject: typeof MINIMISED_SUPPORT_CASE_SUBJECT;
  description: typeof MINIMISED_SUPPORT_DESCRIPTION;
  status: unknown;
  priority: unknown;
  assigned_to: null;
  resolution_notes: null;
  created_by: null;
  created_at: unknown;
  updated_at: unknown;
};

export type MinimisedPlatformAuditEvent = {
  id: unknown;
  actor_user_id: unknown;
  action: unknown;
  entity_type: unknown;
  entity_id: unknown;
  organisation_id: null;
  former_organisation_id: unknown;
  metadata: Record<string, unknown>;
  created_at: unknown;
};

export function ownerMinimiseRetainErrorMessage(
  code: OwnerMinimiseRetainErrorCode | string
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
      return "Personal workspaces cannot use retain_minimise.";
    case "SAMPLE_INSTALLATION":
      return "Sample installations cannot use this workflow.";
    case "SAMPLE_SOURCE_ORGANISATION":
      return "Sample pack source organisations cannot use this workflow.";
    case "UNDELETABLE_ORGANISATION":
      return "This organisation is listed as undeletable.";
    case "STATUS_NOT_ALLOWED":
      return "retain_minimise requires pending_closure.";
    case "INCONSISTENT_RUN":
      return "The deletion run does not match this organisation.";
    case "RUN_STATE_NOT_ALLOWED":
      return "The deletion run is not in a state that can minimise retained records.";
    case "ACKNOWLEDGEMENT_REQUIRED":
      return "Confirm that this minimises support and audit records only and does not delete tenant data.";
    case "UNKNOWN_COLUMN":
      return "A support or audit column is not in the retain_minimise allowlist.";
    default:
      return "Unable to minimise retained support and audit records.";
  }
}

function assertKnownColumns(
  row: Record<string, unknown>,
  allowed: readonly string[],
  table: string
): void {
  const extra = Object.keys(row).filter(key => !allowed.includes(key));
  if (extra.length > 0) {
    throw new Error(
      `UNKNOWN_COLUMN: ${table} has unmapped field(s) ${extra.join(", ")}`
    );
  }
}

export function minimiseSupportCase(
  row: Record<string, unknown>
): MinimisedSupportCase {
  assertKnownColumns(row, SUPPORT_CASE_SCHEMA_COLUMNS, "support_cases");
  const former =
    row.former_organisation_id ?? row.organisation_id ?? null;
  return {
    id: row.id,
    organisation_id: null,
    former_organisation_id: former,
    user_id: null,
    category: row.category,
    subject: MINIMISED_SUPPORT_CASE_SUBJECT,
    description: MINIMISED_SUPPORT_DESCRIPTION,
    status: row.status,
    priority: row.priority,
    assigned_to: null,
    resolution_notes: null,
    created_by: null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function isPrimitive(
  value: unknown
): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

export function minimisePlatformAuditMetadata(
  metadata: unknown
): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (!AUDIT_METADATA_ALLOWLIST.has(key)) continue;
    if (NESTED_COUNT_KEYS.has(key)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const counts: Record<string, number | null> = {};
      let safe = true;
      for (const [countKey, countValue] of Object.entries(
        value as Record<string, unknown>
      )) {
        if (countValue === null || typeof countValue === "number") {
          counts[countKey] = countValue;
          continue;
        }
        safe = false;
        break;
      }
      if (safe) out[key] = counts;
      continue;
    }
    if (key === "fields") {
      if (!Array.isArray(value)) continue;
      out[key] = value
        .filter(item => typeof item === "string" && item.length <= 80)
        .slice(0, 50);
      continue;
    }
    if (!isPrimitive(value)) continue;
    if (typeof value === "string" && value.length > PLATFORM_AUDIT_METADATA_MAX_STRING) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function minimisePlatformAuditEntityId(
  entityType: unknown,
  entityId: unknown
): unknown {
  return typeof entityType === "string" &&
    (PLATFORM_AUDIT_ENTITY_ID_RETAIN_TYPES as readonly string[]).includes(entityType)
    ? entityId
    : null;
}

export function minimisePlatformAuditEvent(
  row: Record<string, unknown>
): MinimisedPlatformAuditEvent {
  assertKnownColumns(row, PLATFORM_AUDIT_SCHEMA_COLUMNS, "platform_audit_events");
  const former =
    row.former_organisation_id ?? row.organisation_id ?? null;
  return {
    id: row.id,
    actor_user_id: row.actor_user_id,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: minimisePlatformAuditEntityId(row.entity_type, row.entity_id),
    organisation_id: null,
    former_organisation_id: former,
    metadata: minimisePlatformAuditMetadata(row.metadata),
    created_at: row.created_at,
  };
}

export function supportCaseFieldTreatmentsMatchSchema(): boolean {
  const treatmentKeys = Object.keys(SUPPORT_CASE_FIELD_TREATMENT).sort();
  const schema = [...SUPPORT_CASE_SCHEMA_COLUMNS].sort();
  return JSON.stringify(treatmentKeys) === JSON.stringify(schema);
}

export function platformAuditFieldTreatmentsMatchSchema(): boolean {
  const treatmentKeys = Object.keys(PLATFORM_AUDIT_FIELD_TREATMENT).sort();
  const schema = [...PLATFORM_AUDIT_SCHEMA_COLUMNS].sort();
  return JSON.stringify(treatmentKeys) === JSON.stringify(schema);
}

export function isSupportCaseMinimised(row: {
  organisation_id?: unknown;
  user_id?: unknown;
  subject?: unknown;
  description?: unknown;
  assigned_to?: unknown;
  resolution_notes?: unknown;
  created_by?: unknown;
}): boolean {
  return (
    row.organisation_id == null &&
    row.user_id == null &&
    row.assigned_to == null &&
    row.resolution_notes == null &&
    row.created_by == null &&
    row.subject === MINIMISED_SUPPORT_CASE_SUBJECT &&
    (row.description === "" || row.description == null)
  );
}

export type RetainMinimiseSurface = {
  table: "support_cases" | "platform_audit_events";
  pendingCount: number;
  minimisedCount: number;
  counted: boolean;
};

export type RetainMinimiseState = {
  organisationId: string;
  organisationStatus: string | null;
  deletionRunId: string | null;
  runStatus: string | null;
  stage: string | null;
  minimiseAvailable: boolean;
  alreadyMinimised: boolean;
  surfaces: RetainMinimiseSurface[];
  pendingTotal: number;
  minimisedTotal: number;
  runStatusUnchanged: true;
  tenantRowsDeleted: false;
  storageDeleted: false;
  authUsersDeleted: false;
  permanentDeletionOccurred: false;
};

function isMissingColumn(message: string): boolean {
  return (
    /former_organisation_id/i.test(message) ||
    /could not find the/i.test(message) ||
    /schema cache/i.test(message) ||
    /does not exist/i.test(message)
  );
}

async function countEq(
  supabase: SupabaseClient,
  table: string,
  column: string,
  value: string
): Promise<{ count: number; counted: boolean }> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, value);
  if (error) {
    if (isMissingColumn(error.message)) {
      return { count: 0, counted: false };
    }
    return { count: 0, counted: false };
  }
  return { count: count ?? 0, counted: true };
}

export async function loadRetainMinimiseState(input: {
  ownerSupabase: SupabaseClient;
  inventorySupabase: SupabaseClient;
  organisationId: string;
}): Promise<RetainMinimiseState> {
  const existing = await loadOpenOrganisationDeletionRun({
    supabase: input.ownerSupabase,
    organisationId: input.organisationId,
  });

  const supportPending = await countEq(
    input.inventorySupabase,
    "support_cases",
    "organisation_id",
    input.organisationId
  );
  const supportMinimised = await countEq(
    input.inventorySupabase,
    "support_cases",
    "former_organisation_id",
    input.organisationId
  );
  const auditPending = await countEq(
    input.inventorySupabase,
    "platform_audit_events",
    "organisation_id",
    input.organisationId
  );
  const auditMinimised = await countEq(
    input.inventorySupabase,
    "platform_audit_events",
    "former_organisation_id",
    input.organisationId
  );

  const surfaces: RetainMinimiseSurface[] = [
    {
      table: "support_cases",
      pendingCount: supportPending.count,
      minimisedCount: supportMinimised.count,
      counted: supportPending.counted && supportMinimised.counted,
    },
    {
      table: "platform_audit_events",
      pendingCount: auditPending.count,
      minimisedCount: auditMinimised.count,
      counted: auditPending.counted && auditMinimised.counted,
    },
  ];
  const pendingTotal = surfaces.reduce((sum, item) => sum + item.pendingCount, 0);
  const freezeEffective = existing.organisationStatus === "pending_closure";
  const runStatus = existing.openRun?.status ?? null;
  const runAllowsMinimise =
    runStatus === "frozen" || runStatus === "commercial_copied";

  return {
    organisationId: input.organisationId,
    organisationStatus: existing.organisationStatus,
    deletionRunId: existing.openRun?.id ?? null,
    runStatus,
    stage: existing.openRun?.stage ?? null,
    minimiseAvailable:
      freezeEffective &&
      Boolean(existing.openRun?.id) &&
      runAllowsMinimise &&
      existing.openRun?.organisationId === input.organisationId &&
      existing.openRun?.formerOrganisationId === input.organisationId,
    alreadyMinimised: pendingTotal === 0,
    surfaces,
    pendingTotal,
    minimisedTotal: surfaces.reduce((sum, item) => sum + item.minimisedCount, 0),
    runStatusUnchanged: true,
    tenantRowsDeleted: false,
    storageDeleted: false,
    authUsersDeleted: false,
    permanentDeletionOccurred: false,
  };
}

export type MinimiseRetainResult =
  | {
      ok: true;
      alreadyMinimised: boolean;
      deletionRunId: string;
      organisationId: string;
      organisationStatus: string;
      runStatus: string;
      stage: string;
      surfaces: Array<{
        table: string;
        pendingCount: number;
        minimisedCount: number;
      }>;
      pendingTotal: number;
      minimisedTotal: number;
      runStatusUnchanged: true;
      tenantRowsDeleted: false;
      storageDeleted: false;
      authUsersDeleted: false;
      permanentDeletionOccurred: false;
    }
  | {
      ok: false;
      code: string;
      error: string;
      permanentDeletionOccurred: false;
    };

function isErrorCode(value: unknown): value is OwnerMinimiseRetainErrorCode {
  return (
    typeof value === "string" &&
    (OWNER_MINIMISE_RETAIN_ERROR_CODES as readonly string[]).includes(value)
  );
}

export async function minimiseOrganisationRetainRecords(input: {
  ownerSupabase: SupabaseClient;
  inventorySupabase: SupabaseClient;
  organisationId: string;
  deletionRunId: string;
  minimiseAcknowledged: boolean;
}): Promise<MinimiseRetainResult> {
  if (!input.minimiseAcknowledged) {
    return {
      ok: false,
      code: "ACKNOWLEDGEMENT_REQUIRED",
      error: ownerMinimiseRetainErrorMessage("ACKNOWLEDGEMENT_REQUIRED"),
      permanentDeletionOccurred: false,
    };
  }

  const state = await loadRetainMinimiseState({
    ownerSupabase: input.ownerSupabase,
    inventorySupabase: input.inventorySupabase,
    organisationId: input.organisationId,
  });

  if (state.deletionRunId && state.deletionRunId !== input.deletionRunId) {
    return {
      ok: false,
      code: "INCONSISTENT_RUN",
      error: ownerMinimiseRetainErrorMessage("INCONSISTENT_RUN"),
      permanentDeletionOccurred: false,
    };
  }

  const { data, error } = await input.ownerSupabase.rpc(
    OWNER_MINIMISE_ORGANISATION_RETAIN_RPC,
    {
      p_organisation_id: input.organisationId,
      p_deletion_run_id: input.deletionRunId,
    }
  );

  if (error) {
    return {
      ok: false,
      code: "UPDATE_FAILED",
      error: error.message || ownerMinimiseRetainErrorMessage("UPDATE_FAILED"),
      permanentDeletionOccurred: false,
    };
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  if (payload.ok === false) {
    const code = isErrorCode(payload.code) ? payload.code : "UPDATE_FAILED";
    return {
      ok: false,
      code,
      error: ownerMinimiseRetainErrorMessage(code),
      permanentDeletionOccurred: false,
    };
  }

  const refreshed = await loadRetainMinimiseState({
    ownerSupabase: input.ownerSupabase,
    inventorySupabase: input.inventorySupabase,
    organisationId: input.organisationId,
  });

  return {
    ok: true,
    alreadyMinimised: Boolean(payload.alreadyMinimised) || refreshed.alreadyMinimised,
    deletionRunId: String(payload.deletionRunId ?? input.deletionRunId),
    organisationId: input.organisationId,
    organisationStatus: String(
      payload.organisationStatus ?? refreshed.organisationStatus ?? ""
    ),
    runStatus: String(payload.runStatus ?? refreshed.runStatus ?? ""),
    stage: String(payload.stage ?? refreshed.stage ?? ""),
    surfaces: refreshed.surfaces.map(item => ({
      table: item.table,
      pendingCount: item.pendingCount,
      minimisedCount: item.minimisedCount,
    })),
    pendingTotal: refreshed.pendingTotal,
    minimisedTotal: refreshed.minimisedTotal,
    runStatusUnchanged: true,
    tenantRowsDeleted: false,
    storageDeleted: false,
    authUsersDeleted: false,
    permanentDeletionOccurred: false,
  };
}
