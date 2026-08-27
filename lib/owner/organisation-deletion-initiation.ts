/**
 * DATA-LIFECYCLE DL-05 — authorise closure, create one deletion run, freeze access.
 * Does not purge, copy commercial records, delete storage, or create certificates.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadOrganisationDeletionPreflight,
  type DeletionPreflightReason,
  type OrganisationDeletionPreflight,
} from "@/lib/owner/organisation-deletion-preflight";

export const OWNER_INITIATE_ORGANISATION_CLOSURE_RPC =
  "owner_initiate_organisation_closure";

export const ORGANISATION_CLOSURE_INITIATION_STAGE = "access_frozen";
export const ORGANISATION_CLOSURE_INITIATION_RUN_STATUS = "frozen";

export const INSTRUCTION_REFERENCE_MAX_LENGTH = 200;

export const OWNER_INITIATE_CLOSURE_ERROR_CODES = [
  "UNAUTHENTICATED",
  "PERMISSION_DENIED",
  "ORGANISATION_REQUIRED",
  "NOT_FOUND",
  "PERSONAL_ORGANISATION",
  "SAMPLE_INSTALLATION",
  "SAMPLE_SOURCE_ORGANISATION",
  "UNDELETABLE_ORGANISATION",
  "ARCHIVED_ORGANISATION",
  "STATUS_NOT_ALLOWED",
  "CONFIRMATION_MISMATCH",
  "INSTRUCTION_REQUIRED",
  "PREFLIGHT_NOT_ELIGIBLE",
  "ACKNOWLEDGEMENT_REQUIRED",
  "ALREADY_STARTED",
  "INCONSISTENT_RUN",
  "INCONSISTENT_CLOSURE",
  "UPDATE_FAILED",
] as const;

export type OwnerInitiateClosureErrorCode =
  (typeof OWNER_INITIATE_CLOSURE_ERROR_CODES)[number];

export type OrganisationDeletionRunSummary = {
  id: string;
  organisationId: string | null;
  formerOrganisationId: string;
  organisationNameSnapshot: string;
  status: string;
  stage: string;
  instructionReference: string | null;
  authorizedBy: string | null;
  requestedAt: string;
  startedAt: string | null;
  permanentDeletionOccurred: false;
};

export type InitiateOrganisationClosureSuccess = {
  ok: true;
  alreadyStarted: boolean;
  deletionRunId: string;
  organisationId: string;
  formerOrganisationId: string;
  organisationStatus: "pending_closure";
  runStatus: string;
  stage: string;
  requestedAt: string;
  authorisedBy: string | null;
  instructionReference: string | null;
  permanentDeletionOccurred: false;
  preflight?: OrganisationDeletionPreflight;
};

export type InitiateOrganisationClosureFailure = {
  ok: false;
  code: string;
  error: string;
  eligibility?: OrganisationDeletionPreflight["eligibility"];
  reasons?: DeletionPreflightReason[];
  preflight?: OrganisationDeletionPreflight;
};

export function confirmationNameMatches(
  organisationName: string,
  typedConfirmation: string
): boolean {
  return organisationName.trim() === typedConfirmation.trim();
}

export function normalisedInstructionReference(
  value: string
): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > INSTRUCTION_REFERENCE_MAX_LENGTH) {
    return null;
  }
  return trimmed;
}

export function ownerInitiateClosureErrorMessage(
  code: OwnerInitiateClosureErrorCode | string
): string {
  switch (code) {
    case "UNAUTHENTICATED":
      return "You must be signed in.";
    case "PERMISSION_DENIED":
      return "Owner Console access denied.";
    case "ORGANISATION_REQUIRED":
      return "Organisation is required.";
    case "NOT_FOUND":
      return "Organisation not found.";
    case "PERSONAL_ORGANISATION":
      return "Personal workspaces cannot be closed through this workflow.";
    case "SAMPLE_INSTALLATION":
      return "Sample installations cannot be closed through this workflow.";
    case "SAMPLE_SOURCE_ORGANISATION":
      return "Sample pack source organisations cannot be closed until source handling is defined.";
    case "UNDELETABLE_ORGANISATION":
      return "This organisation is listed as undeletable.";
    case "ARCHIVED_ORGANISATION":
      return "Archived organisations cannot be closed through this workflow.";
    case "STATUS_NOT_ALLOWED":
      return "This organisation status cannot start closure.";
    case "CONFIRMATION_MISMATCH":
      return "The typed organisation name does not match exactly.";
    case "INSTRUCTION_REQUIRED":
      return "An instruction or authority reference is required.";
    case "PREFLIGHT_NOT_ELIGIBLE":
      return "Fresh deletion preflight is not eligible. Closure was not started.";
    case "ACKNOWLEDGEMENT_REQUIRED":
      return "Confirm that organisation access will be frozen before continuing.";
    case "INCONSISTENT_RUN":
    case "INCONSISTENT_CLOSURE":
      return "Existing closure state is inconsistent. No additional run was created.";
    default:
      return "Unable to authorise organisation closure.";
  }
}

function isErrorCode(value: unknown): value is OwnerInitiateClosureErrorCode {
  return (
    typeof value === "string" &&
    (OWNER_INITIATE_CLOSURE_ERROR_CODES as readonly string[]).includes(value)
  );
}

export function buildClosureInventorySnapshot(
  preflight: OrganisationDeletionPreflight
): Record<string, unknown> {
  return {
    eligibility: preflight.eligibility,
    surfaces: preflight.inventory.map(item => ({
      key: item.key,
      table: item.table,
      count: item.count,
      counted: item.counted,
    })),
    storage: {
      bucket: preflight.storage.bucket,
      authoritativePathCount: preflight.storage.authoritativePathCount,
      prefixListed: preflight.storage.prefixListed,
      ownership: preflight.storage.ownership,
    },
    commercial: preflight.commercial.map(item => ({
      key: item.key,
      table: item.table,
      count: item.count,
      counted: item.counted,
    })),
    sharedUserCounts: {
      membershipCount: preflight.sharedUsers.membershipCount,
      soleTenantUserCount: preflight.sharedUsers.soleTenantUserCount,
      sharedTenantUserCount: preflight.sharedUsers.sharedTenantUserCount,
      platformOwnerMemberCount: preflight.sharedUsers.platformOwnerMemberCount,
      authUsersAreNotDeleted: true,
    },
    residualCounts: preflight.residuals.map(item => ({
      location: item.location,
      attributedCount: item.attributedCount,
      attribution: item.attribution,
    })),
    permanentDeletionOccurred: false,
  };
}

function mapRunRow(row: Record<string, unknown>): OrganisationDeletionRunSummary | null {
  const id = row.id;
  const formerOrganisationId = row.former_organisation_id;
  const requestedAt = row.requested_at;
  if (
    typeof id !== "string" ||
    typeof formerOrganisationId !== "string" ||
    typeof requestedAt !== "string"
  ) {
    return null;
  }
  return {
    id,
    organisationId: typeof row.organisation_id === "string" ? row.organisation_id : null,
    formerOrganisationId,
    organisationNameSnapshot:
      typeof row.organisation_name_snapshot === "string"
        ? row.organisation_name_snapshot
        : "",
    status: typeof row.status === "string" ? row.status : "",
    stage: typeof row.stage === "string" ? row.stage : "",
    instructionReference:
      typeof row.instruction_reference === "string" ? row.instruction_reference : null,
    authorizedBy: typeof row.authorized_by === "string" ? row.authorized_by : null,
    requestedAt,
    startedAt: typeof row.started_at === "string" ? row.started_at : null,
    permanentDeletionOccurred: false,
  };
}

export async function loadOpenOrganisationDeletionRun(input: {
  supabase: SupabaseClient;
  organisationId: string;
}): Promise<{
  organisationStatus: string | null;
  organisationName: string | null;
  openRun: OrganisationDeletionRunSummary | null;
}> {
  const { data: org } = await input.supabase
    .from("organisations")
    .select("id, name, status")
    .eq("id", input.organisationId)
    .maybeSingle();

  const { data: run } = await input.supabase
    .from("organisation_deletion_runs")
    .select(
      "id, organisation_id, former_organisation_id, organisation_name_snapshot, status, stage, instruction_reference, authorized_by, requested_at, started_at"
    )
    .eq("former_organisation_id", input.organisationId)
    .neq("status", "completed")
    .neq("status", "blocked")
    .maybeSingle();

  return {
    organisationStatus: typeof org?.status === "string" ? org.status : null,
    organisationName: typeof org?.name === "string" ? org.name : null,
    openRun: run ? mapRunRow(run as Record<string, unknown>) : null,
  };
}

export async function initiateOrganisationClosure(input: {
  ownerSupabase: SupabaseClient;
  inventorySupabase: SupabaseClient;
  organisationId: string;
  confirmationName: string;
  instructionReference: string;
  freezeAcknowledged: boolean;
}): Promise<InitiateOrganisationClosureSuccess | InitiateOrganisationClosureFailure> {
  const instruction = normalisedInstructionReference(input.instructionReference);
  if (!instruction) {
    return {
      ok: false,
      code: "INSTRUCTION_REQUIRED",
      error: ownerInitiateClosureErrorMessage("INSTRUCTION_REQUIRED"),
    };
  }

  if (!input.freezeAcknowledged) {
    return {
      ok: false,
      code: "ACKNOWLEDGEMENT_REQUIRED",
      error: ownerInitiateClosureErrorMessage("ACKNOWLEDGEMENT_REQUIRED"),
    };
  }

  const existing = await loadOpenOrganisationDeletionRun({
    supabase: input.ownerSupabase,
    organisationId: input.organisationId,
  });
  if (
    existing.openRun &&
    existing.organisationStatus === "pending_closure"
  ) {
    if (
      existing.organisationName &&
      !confirmationNameMatches(existing.organisationName, input.confirmationName)
    ) {
      return {
        ok: false,
        code: "CONFIRMATION_MISMATCH",
        error: ownerInitiateClosureErrorMessage("CONFIRMATION_MISMATCH"),
      };
    }
    return {
      ok: true,
      alreadyStarted: true,
      deletionRunId: existing.openRun.id,
      organisationId: input.organisationId,
      formerOrganisationId: existing.openRun.formerOrganisationId,
      organisationStatus: "pending_closure",
      runStatus: existing.openRun.status,
      stage: existing.openRun.stage,
      requestedAt: existing.openRun.requestedAt,
      authorisedBy: existing.openRun.authorizedBy,
      instructionReference: existing.openRun.instructionReference ?? instruction,
      permanentDeletionOccurred: false,
    };
  }

  const preflight = await loadOrganisationDeletionPreflight({
    supabase: input.inventorySupabase,
    organisationId: input.organisationId,
  });

  if (preflight.eligibility !== "eligible") {
    return {
      ok: false,
      code: "PREFLIGHT_NOT_ELIGIBLE",
      error: ownerInitiateClosureErrorMessage("PREFLIGHT_NOT_ELIGIBLE"),
      eligibility: preflight.eligibility,
      reasons: preflight.reasons,
      preflight,
    };
  }

  if (!preflight.organisation) {
    return {
      ok: false,
      code: "NOT_FOUND",
      error: ownerInitiateClosureErrorMessage("NOT_FOUND"),
      eligibility: "blocked",
      preflight,
    };
  }

  if (preflight.organisation.status === "archived") {
    return {
      ok: false,
      code: "ARCHIVED_ORGANISATION",
      error: ownerInitiateClosureErrorMessage("ARCHIVED_ORGANISATION"),
      preflight,
    };
  }

  if (
    !confirmationNameMatches(
      preflight.organisation.name,
      input.confirmationName
    )
  ) {
    return {
      ok: false,
      code: "CONFIRMATION_MISMATCH",
      error: ownerInitiateClosureErrorMessage("CONFIRMATION_MISMATCH"),
      preflight,
    };
  }

  const { data, error } = await input.ownerSupabase.rpc(
    OWNER_INITIATE_ORGANISATION_CLOSURE_RPC,
    {
      p_organisation_id: input.organisationId,
      p_confirmation_name: input.confirmationName.trim(),
      p_instruction_reference: instruction,
      p_inventory: buildClosureInventorySnapshot(preflight),
    }
  );

  if (error) {
    console.error("Organisation closure initiation RPC failed:", {
      message: error.message,
      code: error.code,
    });
    return {
      ok: false,
      code: "UPDATE_FAILED",
      error: ownerInitiateClosureErrorMessage("UPDATE_FAILED"),
      preflight,
    };
  }

  const payload = (data ?? null) as {
    ok?: boolean;
    code?: string;
    alreadyStarted?: boolean;
    deletionRunId?: string;
    organisationId?: string;
    formerOrganisationId?: string;
    organisationStatus?: string;
    runStatus?: string;
    stage?: string;
    requestedAt?: string;
    authorisedBy?: string | null;
    instructionReference?: string | null;
    permanentDeletionOccurred?: boolean;
  } | null;

  if (!payload || payload.ok !== true) {
    const code = isErrorCode(payload?.code) ? payload.code : "UPDATE_FAILED";
    return {
      ok: false,
      code,
      error: ownerInitiateClosureErrorMessage(code),
      preflight,
    };
  }

  if (
    !payload.deletionRunId ||
    !payload.organisationId ||
    payload.organisationStatus !== "pending_closure" ||
    payload.permanentDeletionOccurred === true
  ) {
    return {
      ok: false,
      code: "UPDATE_FAILED",
      error: ownerInitiateClosureErrorMessage("UPDATE_FAILED"),
      preflight,
    };
  }

  return {
    ok: true,
    alreadyStarted: Boolean(payload.alreadyStarted),
    deletionRunId: payload.deletionRunId,
    organisationId: payload.organisationId,
    formerOrganisationId: payload.formerOrganisationId ?? payload.organisationId,
    organisationStatus: "pending_closure",
    runStatus: payload.runStatus ?? ORGANISATION_CLOSURE_INITIATION_RUN_STATUS,
    stage: payload.stage ?? ORGANISATION_CLOSURE_INITIATION_STAGE,
    requestedAt: payload.requestedAt ?? new Date().toISOString(),
    authorisedBy: payload.authorisedBy ?? null,
    instructionReference: payload.instructionReference ?? instruction,
    permanentDeletionOccurred: false,
    preflight,
  };
}
