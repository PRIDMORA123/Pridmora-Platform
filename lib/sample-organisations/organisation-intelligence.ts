import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Optional Organisation Intelligence integration for the Sample Organisation Installer.
 *
 * Intentionally does not import the Organisation Intelligence package.
 * That package is released separately. Importing it from the installer caused the
 * production build for commit 3e6f009 to fail when the WIP was not in git.
 *
 * When Organisation Intelligence is shipped, wire the real generator into this
 * module and return a successful snapshot id. Until then, installation completes
 * as intelligence_pending and the UI exposes Retry intelligence generation.
 */

export type SampleOrganisationIntelligenceResult =
  | { ok: true; snapshotId: string }
  | { ok: false; error: string; code?: string };

export async function generateSampleOrganisationIntelligenceSnapshot(_input: {
  supabase: SupabaseClient;
  userId: string;
  organisationId: string;
  organisationName: string;
}): Promise<SampleOrganisationIntelligenceResult> {
  return {
    ok: false,
    error:
      "Organisation Intelligence generation is not available in this release.",
    code: "unavailable",
  };
}
