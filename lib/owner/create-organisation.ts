import type { SupabaseClient } from "@supabase/supabase-js";

import type { CustomerOrgStartingRoute } from "@/lib/owner/create-organisation-schema";

export const OWNER_CREATE_ORG_ERROR_CODES = [
  "UNAUTHENTICATED",
  "PERMISSION_DENIED",
  "NAME_REQUIRED",
  "COUNTRY_REQUIRED",
  "NAME_TOO_LONG",
  "COUNTRY_TOO_LONG",
  "WEBSITE_TOO_LONG",
  "NOTES_TOO_LONG",
  "INVALID_SEATS",
  "INVALID_STARTING_ROUTE",
] as const;

export type OwnerCreateOrgErrorCode =
  (typeof OWNER_CREATE_ORG_ERROR_CODES)[number];

export type OwnerCreateOrganisationResult = {
  organisationId: string;
  trialId: string | null;
  name: string;
  country: string;
  seats: number;
  licenceStatus: "active" | "trial";
  licencePlanName: string;
  licenceStartsAt: string;
  licenceEndsAt: string | null;
  durationDays: number | null;
  startingRoute: CustomerOrgStartingRoute;
  organisationType: "business";
};

export function ownerCreateOrgErrorMessage(
  code: OwnerCreateOrgErrorCode
): string {
  switch (code) {
    case "UNAUTHENTICATED":
      return "You must be signed in.";
    case "PERMISSION_DENIED":
      return "Owner Console access denied.";
    case "NAME_REQUIRED":
      return "Organisation name is required.";
    case "COUNTRY_REQUIRED":
      return "Country is required.";
    case "NAME_TOO_LONG":
      return "Organisation name is too long.";
    case "COUNTRY_TOO_LONG":
      return "Country is too long.";
    case "WEBSITE_TOO_LONG":
      return "Website is too long.";
    case "NOTES_TOO_LONG":
      return "Notes are too long.";
    case "INVALID_SEATS":
      return "Seats must be between 1 and 100.";
    case "INVALID_STARTING_ROUTE":
      return "Choose Paid Pilot or 14-day Evaluation.";
    default:
      return "Unable to create organisation.";
  }
}

function isErrorCode(value: unknown): value is OwnerCreateOrgErrorCode {
  return (
    typeof value === "string" &&
    (OWNER_CREATE_ORG_ERROR_CODES as readonly string[]).includes(value)
  );
}

/**
 * Create a customer organisation (non-personal).
 *
 * Paid Pilot:
 * - active licence
 * - no trial row
 * - no trial end date
 *
 * Evaluation:
 * - trial licence
 * - trial row
 * - 14-day end date by current platform default
 *
 * No invitations or membership bootstrap.
 */
export async function createCustomerOrganisation(input: {
  supabase: SupabaseClient;
  name: string;
  country: string;
  website?: string | null;
  ownerNotes?: string | null;
  seats?: number | null;
  startingRoute?: CustomerOrgStartingRoute;
}): Promise<OwnerCreateOrganisationResult> {
  const startingRoute = input.startingRoute ?? "paid_pilot";

  const { data, error } = await input.supabase.rpc(
    "owner_create_customer_organisation",
    {
      p_name: input.name,
      p_country: input.country,
      p_website: input.website ?? null,
      p_owner_notes: input.ownerNotes ?? null,
      p_seats: input.seats ?? null,
      p_starting_route: startingRoute,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  const payload = (data ?? null) as {
    ok?: boolean;
    code?: string;
    organisationId?: string;
    trialId?: string | null;
    name?: string;
    country?: string;
    seats?: number;
    licenceStatus?: string;
    licencePlanName?: string;
    licenceStartsAt?: string;
    licenceEndsAt?: string | null;
    durationDays?: number | null;
    startingRoute?: string;
    organisationType?: string;
  } | null;

  if (!payload || payload.ok !== true) {
    const code = isErrorCode(payload?.code) ? payload.code : null;
    throw new Error(
      code ? ownerCreateOrgErrorMessage(code) : "Unable to create organisation."
    );
  }

  if (
    !payload.organisationId ||
    !payload.name ||
    !payload.country ||
    payload.seats === undefined ||
    !payload.licenceStartsAt
  ) {
    throw new Error("Unable to create organisation.");
  }

  const licenceStatus =
    payload.licenceStatus === "trial" ? "trial" : "active";

  return {
    organisationId: payload.organisationId,
    trialId: payload.trialId ?? null,
    name: payload.name,
    country: payload.country,
    seats: Number(payload.seats),
    licenceStatus,
    licencePlanName: payload.licencePlanName || "Pilot",
    licenceStartsAt: String(payload.licenceStartsAt),
    licenceEndsAt: payload.licenceEndsAt
      ? String(payload.licenceEndsAt)
      : null,
    durationDays:
      payload.durationDays === undefined || payload.durationDays === null
        ? null
        : Number(payload.durationDays),
    startingRoute:
      payload.startingRoute === "evaluation" ? "evaluation" : "paid_pilot",
    organisationType: "business",
  };
}
