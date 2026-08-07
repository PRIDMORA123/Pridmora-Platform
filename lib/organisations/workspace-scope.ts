/**
 * Active organisation / workspace scoping helpers.
 * Every relationship-sensitive query must be scoped to the active organisation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Return client IDs that belong to the active organisation.
 * Clients with a different organisation_id are excluded.
 * Legacy rows with null organisation_id are included only when
 * allowLegacyPersonalNull is true (personal workspace fallback).
 */
export async function listOrganisationClientIds(
  supabase: SupabaseClient,
  input: {
    organisationId: string;
    coachId: string;
    /** Include coach-owned rows with null organisation_id (legacy personal). */
    allowLegacyPersonalNull?: boolean;
  }
): Promise<string[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, organisation_id, coach_id")
    .eq("organisation_id", input.organisationId);

  if (error) {
    throw new Error(error.message);
  }

  const ids = new Set<string>(
    (data ?? []).map(row => row.id as string)
  );

  if (input.allowLegacyPersonalNull) {
    const { data: legacy, error: legacyError } = await supabase
      .from("clients")
      .select("id")
      .eq("coach_id", input.coachId)
      .is("organisation_id", null);

    if (legacyError) {
      throw new Error(legacyError.message);
    }

    for (const row of legacy ?? []) {
      ids.add(row.id as string);
    }
  }

  return [...ids];
}

/**
 * Filter an arbitrary list of client IDs down to those in the active organisation.
 */
export async function filterClientIdsToOrganisation(
  supabase: SupabaseClient,
  organisationId: string,
  clientIds: string[]
): Promise<Set<string>> {
  const unique = [...new Set(clientIds.filter(Boolean))];
  if (unique.length === 0) return new Set();

  const { data, error } = await supabase
    .from("clients")
    .select("id")
    .in("id", unique)
    .eq("organisation_id", organisationId);

  if (error) {
    throw new Error(error.message);
  }

  return new Set((data ?? []).map(row => row.id as string));
}

/**
 * True when a stored client organisation matches the active workspace.
 */
export function clientBelongsToOrganisation(
  clientOrganisationId: string | null | undefined,
  activeOrganisationId: string
): boolean {
  if (!clientOrganisationId) return false;
  return clientOrganisationId === activeOrganisationId;
}
