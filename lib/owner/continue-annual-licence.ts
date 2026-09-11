import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isCustomerLicencePlanName,
  managerCapacityForPlan,
  type CustomerLicencePlanName,
} from "@/lib/owner/customer-licence-plans";
import { loadPractitionerSeatUsage } from "@/lib/organisations/licence";

const OWNER_CONTINUE_ANNUAL_LICENCE_RPC =
  "owner_continue_annual_licence";

export const ANNUAL_CUSTOMER_LICENCE_PLANS = [
  "Core",
  "Growth",
  "Scale",
] as const;

export type AnnualCustomerLicencePlanName =
  (typeof ANNUAL_CUSTOMER_LICENCE_PLANS)[number];

const OWNER_CONTINUE_ANNUAL_LICENCE_ERROR_CODES = [
  "UNAUTHENTICATED",
  "PERMISSION_DENIED",
  "ORGANISATION_REQUIRED",
  "INVALID_ANNUAL_PLAN",
  "INVALID_PLAN_CAPACITY",
  "ANNUAL_DATES_REQUIRED",
  "INVALID_RENEWAL_DATE",
  "NOT_FOUND",
  "LICENCE_CAPACITY_BELOW_USAGE",
  "UPDATE_FAILED",
] as const;

export type OwnerContinueAnnualLicenceErrorCode =
  (typeof OWNER_CONTINUE_ANNUAL_LICENCE_ERROR_CODES)[number];

export function isAnnualCustomerLicencePlanName(
  value: string
): value is AnnualCustomerLicencePlanName {
  return (
    isCustomerLicencePlanName(value) &&
    value !== "Pilot"
  );
}

export function ownerContinueAnnualLicenceErrorMessage(
  code: OwnerContinueAnnualLicenceErrorCode
): string {
  switch (code) {
    case "UNAUTHENTICATED":
      return "You must be signed in.";

    case "PERMISSION_DENIED":
      return "Owner Console access denied.";

    case "ORGANISATION_REQUIRED":
      return "Organisation is required.";

    case "INVALID_ANNUAL_PLAN":
      return "Annual licence must be Core, Growth or Scale.";

    case "INVALID_PLAN_CAPACITY":
      return "The requested Manager capacity does not match the selected licence.";

    case "ANNUAL_DATES_REQUIRED":
      return "Annual licence start and renewal dates are required.";

    case "INVALID_RENEWAL_DATE":
      return "Renewal date must be after the annual licence start date.";

    case "NOT_FOUND":
      return "Organisation not found.";

    case "LICENCE_CAPACITY_BELOW_USAGE":
      return "The selected licence does not have enough capacity for the Managers currently using seats.";

    case "UPDATE_FAILED":
      return "Unable to continue the organisation onto an annual licence.";

    default:
      return "Unable to continue the organisation onto an annual licence.";
  }
}

function isErrorCode(
  value: unknown
): value is OwnerContinueAnnualLicenceErrorCode {
  return (
    typeof value === "string" &&
    (
      OWNER_CONTINUE_ANNUAL_LICENCE_ERROR_CODES as readonly string[]
    ).includes(value)
  );
}

export type ContinueAnnualLicenceResult =
  | {
      ok: true;
      organisationId: string;
      subscriptionId: string;
      licenceStatus: "active";
      licencePlanName: AnnualCustomerLicencePlanName;
      practitionerSeatsPurchased: number;
      licenceStartsAt: string;
      licenceEndsAt: string;
      billingFrequency: "annual";
    }
  | {
      ok: false;
      code: OwnerContinueAnnualLicenceErrorCode;
      error: string;
      seatsInUse?: number;
      requestedCapacity?: number;
    };

/**
 * Continue an existing organisation onto an annual Core, Growth or Scale
 * licence, or renew its annual term, without replacing the organisation.
 *
 * Manager-seat usage is calculated through the canonical application rule
 * before the atomic database mutation is called.
 */
export async function continueOrganisationAnnualLicence(input: {
  supabase: SupabaseClient;
  organisationId: string;
  planName: AnnualCustomerLicencePlanName;
  startsAt: string;
  renewalAt: string;
}): Promise<ContinueAnnualLicenceResult> {
  if (!isAnnualCustomerLicencePlanName(input.planName)) {
    return {
      ok: false,
      code: "INVALID_ANNUAL_PLAN",
      error: ownerContinueAnnualLicenceErrorMessage(
        "INVALID_ANNUAL_PLAN"
      ),
    };
  }

  const capacity = managerCapacityForPlan(
    input.planName as CustomerLicencePlanName
  );

  const seatUsage = await loadPractitionerSeatUsage(
    input.supabase,
    input.organisationId
  );

  if (capacity < seatUsage.summary.seatsInUse) {
    return {
      ok: false,
      code: "LICENCE_CAPACITY_BELOW_USAGE",
      error:
        `Cannot set ${input.planName} capacity to ${capacity} Managers because ` +
        `${seatUsage.summary.seatsInUse} Manager seats are currently in use. ` +
        "Deactivate Managers first or choose a licence tier with sufficient capacity.",
      seatsInUse: seatUsage.summary.seatsInUse,
      requestedCapacity: capacity,
    };
  }

  const { data, error } = await input.supabase.rpc(
    OWNER_CONTINUE_ANNUAL_LICENCE_RPC,
    {
      p_organisation_id: input.organisationId,
      p_plan_name: input.planName,
      p_seats: capacity,
      p_starts_at: input.startsAt,
      p_renewal_at: input.renewalAt,
    }
  );

  if (error) {
    console.error("Continue annual licence RPC failed:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });

    return {
      ok: false,
      code: "UPDATE_FAILED",
      error: ownerContinueAnnualLicenceErrorMessage(
        "UPDATE_FAILED"
      ),
    };
  }

  const payload = (data ?? null) as {
    ok?: boolean;
    code?: string;
    organisationId?: string;
    subscriptionId?: string;
    licenceStatus?: string;
    licencePlanName?: string;
    practitionerSeatsPurchased?: number;
    licenceStartsAt?: string;
    licenceEndsAt?: string;
    billingFrequency?: string;
  } | null;

  if (!payload || payload.ok !== true) {
    const code = isErrorCode(payload?.code)
      ? payload.code
      : "UPDATE_FAILED";

    return {
      ok: false,
      code,
      error: ownerContinueAnnualLicenceErrorMessage(code),
    };
  }

  const licencePlanName = payload.licencePlanName;

  if (
    !payload.organisationId ||
    !payload.subscriptionId ||
    !licencePlanName ||
    !isAnnualCustomerLicencePlanName(licencePlanName) ||
    !payload.licenceStartsAt ||
    !payload.licenceEndsAt
  ) {
    return {
      ok: false,
      code: "UPDATE_FAILED",
      error: ownerContinueAnnualLicenceErrorMessage(
        "UPDATE_FAILED"
      ),
    };
  }

  return {
    ok: true,
    organisationId: payload.organisationId,
    subscriptionId: payload.subscriptionId,
    licenceStatus: "active",
    licencePlanName,
    practitionerSeatsPurchased: Number(
      payload.practitionerSeatsPurchased ?? capacity
    ),
    licenceStartsAt: payload.licenceStartsAt,
    licenceEndsAt: payload.licenceEndsAt,
    billingFrequency: "annual",
  };
}
