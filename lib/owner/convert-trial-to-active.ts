import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountStatus } from "@/lib/owner/types";

export const CONVERT_TRIAL_CONFIRMATION =
  "Convert this trial to a permanent active organisation? Existing users and development data will be preserved and the trial end date will be removed.";

export const OWNER_CONVERT_TRIAL_RPC =
  "owner_convert_trial_organisation_to_active";

export const OWNER_CONVERT_TRIAL_ERROR_CODES = [
  "UNAUTHENTICATED",
  "PERMISSION_DENIED",
  "ORGANISATION_REQUIRED",
  "NOT_FOUND",
  "NOT_TRIAL",
  "UPDATE_FAILED",
] as const;

export type OwnerConvertTrialErrorCode =
  (typeof OWNER_CONVERT_TRIAL_ERROR_CODES)[number];

/**
 * Which Settings actions to show for the current licence/account status.
 * Trial must not show "Reactivate"; Active must not show "Reactivate".
 */
export function ownerOrganisationSettingsActions(status: AccountStatus): {
  showConvertTrial: boolean;
  showSuspend: boolean;
  showReactivate: boolean;
} {
  if (status === "trial") {
    return {
      showConvertTrial: true,
      showSuspend: true,
      showReactivate: false,
    };
  }
  if (status === "suspended") {
    return {
      showConvertTrial: false,
      showSuspend: false,
      showReactivate: true,
    };
  }
  if (status === "active") {
    return {
      showConvertTrial: false,
      showSuspend: true,
      showReactivate: false,
    };
  }
  // expired / cancelled — allow reactivate to restore usable licence
  return {
    showConvertTrial: false,
    showSuspend: false,
    showReactivate: true,
  };
}

export function ownerConvertTrialErrorMessage(
  code: OwnerConvertTrialErrorCode
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
    case "NOT_TRIAL":
      return "Only trial organisations can be converted to active.";
    case "UPDATE_FAILED":
      return "Unable to convert trial organisation.";
    default:
      return "Unable to convert trial organisation.";
  }
}

function isErrorCode(value: unknown): value is OwnerConvertTrialErrorCode {
  return (
    typeof value === "string" &&
    (OWNER_CONVERT_TRIAL_ERROR_CODES as readonly string[]).includes(value)
  );
}

export type ConvertTrialResult =
  | {
      ok: true;
      organisationId: string;
      alreadyConverted: boolean;
      licenceStatus: "active";
      licenceEndsAt: null;
    }
  | { ok: false; code: string; error: string };

/**
 * Convert a trial organisation to permanent active on the same organisation ID.
 * Delegates to atomic Postgres RPC (single transaction).
 */
export async function convertTrialOrganisationToActive(input: {
  supabase: SupabaseClient;
  organisationId: string;
  /** Retained for call-site compatibility; audit actor is auth.uid() inside the RPC. */
  actorUserId: string;
}): Promise<ConvertTrialResult> {
  const { data, error } = await input.supabase.rpc(OWNER_CONVERT_TRIAL_RPC, {
    p_organisation_id: input.organisationId,
  });

  if (error) {
    console.error("Convert trial to active RPC failed:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return {
      ok: false,
      code: "UPDATE_FAILED",
      error: "Unable to convert trial organisation.",
    };
  }

  const payload = (data ?? null) as {
    ok?: boolean;
    code?: string;
    organisationId?: string;
    alreadyConverted?: boolean;
    licenceStatus?: string;
    licenceEndsAt?: string | null;
  } | null;

  if (!payload || payload.ok !== true) {
    const code = isErrorCode(payload?.code) ? payload.code : "UPDATE_FAILED";
    return {
      ok: false,
      code,
      error: ownerConvertTrialErrorMessage(code),
    };
  }

  if (!payload.organisationId) {
    return {
      ok: false,
      code: "UPDATE_FAILED",
      error: "Unable to convert trial organisation.",
    };
  }

  return {
    ok: true,
    organisationId: payload.organisationId,
    alreadyConverted: Boolean(payload.alreadyConverted),
    licenceStatus: "active",
    licenceEndsAt: null,
  };
}
