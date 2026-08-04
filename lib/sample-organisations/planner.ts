import type { SupabaseClient } from "@supabase/supabase-js";
import type { ValidatedSamplePack } from "@/lib/sample-organisations/types";

export type InstallPlanStep =
  | { type: "organisation" }
  | { type: "relationships"; count: number }
  | { type: "assignments"; count: number }
  | { type: "sessions"; count: number }
  | { type: "actions"; count: number }
  | { type: "development_updates"; count: number }
  | { type: "intelligence_items"; count: number }
  | { type: "organisation_intelligence" }
  | { type: "verify" };

export type InstallPlan = {
  packKey: string;
  packVersion: string;
  steps: InstallPlanStep[];
  expectedCounts: ValidatedSamplePack["manifest"]["expectedCounts"];
};

export function buildInstallPlan(pack: ValidatedSamplePack): InstallPlan {
  return {
    packKey: pack.manifest.packKey,
    packVersion: pack.manifest.packVersion,
    expectedCounts: pack.manifest.expectedCounts,
    steps: [
      { type: "organisation" },
      { type: "relationships", count: pack.relationships.length },
      { type: "assignments", count: pack.assignments.length },
      { type: "sessions", count: pack.sessions.length },
      { type: "actions", count: pack.actions.length },
      {
        type: "development_updates",
        count: pack.developmentUpdates.length,
      },
      {
        type: "intelligence_items",
        count: pack.intelligenceItems.length,
      },
      { type: "organisation_intelligence" },
      { type: "verify" },
    ],
  };
}

/** Safety: confirm the target organisation looks like a sample install container. */
export async function assertSampleOrganisationSafe(input: {
  supabase: SupabaseClient;
  organisationId: string;
  installationId: string;
  installedBy: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { data: installation, error: installError } = await input.supabase
    .from("sample_organisation_installations")
    .select("id, organisation_id, installed_by, pack_key")
    .eq("id", input.installationId)
    .maybeSingle();

  if (installError || !installation) {
    return { ok: false, reason: "Installation not found." };
  }

  if (installation.organisation_id !== input.organisationId) {
    return { ok: false, reason: "Organisation mismatch." };
  }

  if (installation.installed_by !== input.installedBy) {
    // Permission layer may still allow another owner/admin of the sample org.
  }

  const { data: org, error: orgError } = await input.supabase
    .from("organisations")
    .select("id, created_by, organisation_type, licence_plan_name")
    .eq("id", input.organisationId)
    .maybeSingle();

  if (orgError || !org) {
    return { ok: false, reason: "Sample organisation not found." };
  }

  if (org.created_by !== installation.installed_by) {
    return { ok: false, reason: "Sample organisation ownership mismatch." };
  }

  return { ok: true };
}
