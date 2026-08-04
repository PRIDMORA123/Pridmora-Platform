import type { SupabaseClient } from "@supabase/supabase-js";
import { generateSampleOrganisationIntelligenceSnapshot } from "@/lib/sample-organisations/organisation-intelligence";
import { requireSamplePack } from "@/lib/sample-organisations/registry";
import {
  getInstallationById,
  updateInstallationStage,
  verifyInstalledDataset,
} from "@/lib/sample-organisations/status";
import type { SampleInstallationView } from "@/lib/sample-organisations/types";

/**
 * Reseed an existing sample organisation container from the pack.
 * Used by reset. Does not create a new organisation.
 */
export async function reseedSampleOrganisation(input: {
  supabase: SupabaseClient;
  userId: string;
  installationId: string;
  organisationId: string;
  packKey: string;
}): Promise<
  | { ok: true; installation: SampleInstallationView }
  | { ok: false; error: string; code?: string; installation?: SampleInstallationView }
> {
  const pack = requireSamplePack(input.packKey);

  const { seedExistingSampleOrganisation } = await import(
    "@/lib/sample-organisations/seed-content"
  );

  try {
    const seeded = await seedExistingSampleOrganisation({
      supabase: input.supabase,
      userId: input.userId,
      organisationId: input.organisationId,
      installationId: input.installationId,
      pack,
    });

    await updateInstallationStage({
      supabase: input.supabase,
      installationId: input.installationId,
      stage: "generating_organisation_intelligence",
      status: "installing",
      counts: seeded.counts,
    });

    const intelligence = await generateSampleOrganisationIntelligenceSnapshot({
      supabase: input.supabase,
      organisationId: input.organisationId,
      organisationName: pack.organisation.name,
      userId: input.userId,
    });

    const expectedCounts = {
      relationships: pack.manifest.expectedCounts.relationships,
      confidentialRelationships:
        pack.manifest.expectedCounts.confidentialRelationships,
      sessions: pack.manifest.expectedCounts.sessions,
      actions: pack.manifest.expectedCounts.actions,
      developmentUpdates: pack.manifest.expectedCounts.developmentUpdates,
      intelligenceItems: pack.manifest.expectedCounts.intelligenceItems,
    };

    if (!intelligence.ok) {
      const pendingVerification = await verifyInstalledDataset({
        supabase: input.supabase,
        organisationId: input.organisationId,
        installationId: input.installationId,
        expected: expectedCounts,
        requireIntelligenceSnapshot: false,
      });
      if (!pendingVerification.ok) {
        return {
          ok: false,
          error: "Reset checks did not pass.",
          code: "VERIFICATION_FAILED",
        };
      }

      await updateInstallationStage({
        supabase: input.supabase,
        installationId: input.installationId,
        stage: "generating_organisation_intelligence",
        status: "intelligence_pending",
        counts: seeded.counts,
        errorSummary:
          "Sample data was restored but Organisation Intelligence could not be generated.",
        failureCategory: "intelligence_generation",
        markInstalled: true,
      });
      const pending = await getInstallationById(
        input.supabase,
        input.installationId
      );
      if (!pending) {
        return {
          ok: false,
          error: "Reset completed but status could not be loaded.",
          code: "STATUS_MISSING",
        };
      }
      return { ok: true, installation: pending };
    }

    await input.supabase.rpc("map_sample_organisation_record", {
      p_installation_id: input.installationId,
      p_record_type: "intelligence_snapshot",
      p_record_id: intelligence.snapshotId,
      p_pack_entity_key: null,
    });

    const verification = await verifyInstalledDataset({
      supabase: input.supabase,
      organisationId: input.organisationId,
      installationId: input.installationId,
      expected: expectedCounts,
      requireIntelligenceSnapshot: true,
    });

    if (!verification.ok) {
      return {
        ok: false,
        error: "Reset checks did not pass.",
        code: "VERIFICATION_FAILED",
      };
    }

    await updateInstallationStage({
      supabase: input.supabase,
      installationId: input.installationId,
      stage: "ready",
      status: "ready",
      counts: seeded.counts,
      errorSummary: null,
      failureCategory: null,
      markInstalled: true,
    });

    const view = await getInstallationById(
      input.supabase,
      input.installationId
    );
    if (!view) {
      return {
        ok: false,
        error: "Reset completed but status could not be loaded.",
        code: "STATUS_MISSING",
      };
    }
    return { ok: true, installation: view };
  } catch {
    return {
      ok: false,
      error: "Sample organisation reset failed.",
      code: "RESET_FAILED",
    };
  }
}
