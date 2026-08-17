import type { OrganisationType } from "@/lib/organisations/types";

/**
 * FIX-2: Resolve the organisation name to show on Manager Home.
 * Uses only authorised organisation context — never query-string or client invent.
 * Personal / synthetic / missing context → null (no misleading label).
 */
export function resolveManagerHomeOrganisationIdentity(
  input: {
    organisationName?: string | null;
    organisationType?: OrganisationType | string | null;
    multiOrganisation?: boolean;
  } | null | undefined
): { name: string; multiOrganisation: boolean } | null {
  if (!input) return null;

  const name = input.organisationName?.trim() ?? "";
  if (!name) return null;

  if (input.organisationType === "personal") return null;
  if (name.toLowerCase() === "personal workspace") return null;

  return {
    name,
    multiOrganisation: Boolean(input.multiOrganisation),
  };
}
