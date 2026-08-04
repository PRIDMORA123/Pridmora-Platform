import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Optional Organisation Intelligence integration for the Sample Organisation Installer.
 *
 * Intentionally does not import the Organisation Intelligence package.
 * That package is released separately. Importing it from the installer caused the
 * production build for commit 3e6f009 to fail when the WIP was not in git.
 *
 * When Organisation Intelligence is shipped:
 * 1. Set SAMPLE_ORGANISATION_INTELLIGENCE_GENERATION_AVAILABLE to true
 * 2. Wire the real generator into generateSampleOrganisationIntelligenceSnapshot
 */

/** Flip to true when the Organisation Intelligence generator is released and wired. */
export const SAMPLE_ORGANISATION_INTELLIGENCE_GENERATION_AVAILABLE = false;

export function isSampleOrganisationIntelligenceGenerationAvailable(): boolean {
  return SAMPLE_ORGANISATION_INTELLIGENCE_GENERATION_AVAILABLE;
}

export type SampleOrganisationIntelligenceResult =
  | { ok: true; snapshotId: string }
  | { ok: false; error: string; code?: string };

export async function generateSampleOrganisationIntelligenceSnapshot(_input: {
  supabase: SupabaseClient;
  userId: string;
  organisationId: string;
  organisationName: string;
}): Promise<SampleOrganisationIntelligenceResult> {
  if (!isSampleOrganisationIntelligenceGenerationAvailable()) {
    return {
      ok: false,
      error:
        "Organisation Intelligence generation is not available in this release.",
      code: "unavailable",
    };
  }

  return {
    ok: false,
    error:
      "Organisation Intelligence generation is not available in this release.",
    code: "unavailable",
  };
}
