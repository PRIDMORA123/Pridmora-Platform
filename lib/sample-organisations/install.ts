import type { SupabaseClient } from "@supabase/supabase-js";
import { writeSampleOrganisationAudit } from "@/lib/sample-organisations/audit";
import { generateSampleOrganisationIntelligenceSnapshot } from "@/lib/sample-organisations/organisation-intelligence";
import { buildInstallPlan } from "@/lib/sample-organisations/planner";
import { requireSamplePack } from "@/lib/sample-organisations/registry";
import {
  getActiveInstallationForPack,
  getInstallationById,
  updateInstallationStage,
  verifyInstalledDataset,
} from "@/lib/sample-organisations/status";
import type {
  SampleInstallationView,
  ValidatedSamplePack,
} from "@/lib/sample-organisations/types";
import { seedExistingSampleOrganisation } from "@/lib/sample-organisations/seed-content";


async function mapRecord(input: {
  supabase: SupabaseClient;
  installationId: string;
  recordType: string;
  recordId: string;
  packEntityKey?: string;
}): Promise<void> {
  const { error } = await input.supabase.rpc("map_sample_organisation_record", {
    p_installation_id: input.installationId,
    p_record_type: input.recordType,
    p_record_id: input.recordId,
    p_pack_entity_key: input.packEntityKey ?? null,
  });
  if (error) {
    throw new Error("Unable to map sample record.");
  }
}

export type InstallSampleOrganisationResult =
  | {
      ok: true;
      installation: SampleInstallationView;
      resumed: boolean;
    }
  | {
      ok: false;
      error: string;
      code?: string;
      installation?: SampleInstallationView | null;
    };

async function rollbackInstallation(input: {
  supabase: SupabaseClient;
  installationId: string;
  deleteOrganisation: boolean;
}): Promise<void> {
  await input.supabase.rpc("cleanup_sample_organisation_installation", {
    p_installation_id: input.installationId,
    p_delete_organisation: input.deleteOrganisation,
  });
}

async function failInstallation(input: {
  supabase: SupabaseClient;
  installationId: string;
  organisationId: string;
  actorUserId: string;
  packKey: string;
  packVersion: string;
  category: string;
  summary: string;
  deleteOrganisation: boolean;
}): Promise<void> {
  try {
    await rollbackInstallation({
      supabase: input.supabase,
      installationId: input.installationId,
      deleteOrganisation: input.deleteOrganisation,
    });
  } catch {
    // Compensating cleanup best-effort; still mark failed.
  }

  await updateInstallationStage({
    supabase: input.supabase,
    installationId: input.installationId,
    stage: "failed",
    status: "failed",
    errorSummary: input.summary,
    failureCategory: input.category,
  });

  await writeSampleOrganisationAudit({
    supabase: input.supabase,
    organisationId: input.organisationId,
    actorUserId: input.actorUserId,
    action: "sample_organisation_install_failed",
    installationId: input.installationId,
    packKey: input.packKey,
    packVersion: input.packVersion,
    failureCategory: input.category,
  });
}

async function generateSampleOrganisationIntelligence(input: {
  supabase: SupabaseClient;
  userId: string;
  organisationId: string;
  organisationName: string;
  installationId: string;
}): Promise<{ ok: true; snapshotId: string } | { ok: false; error: string }> {
  await updateInstallationStage({
    supabase: input.supabase,
    installationId: input.installationId,
    stage: "generating_organisation_intelligence",
    status: "installing",
  });

  const result = await generateSampleOrganisationIntelligenceSnapshot({
    supabase: input.supabase,
    userId: input.userId,
    organisationId: input.organisationId,
    organisationName: input.organisationName,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  await mapRecord({
    supabase: input.supabase,
    installationId: input.installationId,
    recordType: "intelligence_snapshot",
    recordId: result.snapshotId,
  });

  return { ok: true, snapshotId: result.snapshotId };
}

async function markIntelligencePending(input: {
  supabase: SupabaseClient;
  installationId: string;
  counts: {
    relationships: number;
    sessions: number;
    actions: number;
    developmentUpdates: number;
    intelligenceItems: number;
  };
  summary: string;
}): Promise<SampleInstallationView | null> {
  await updateInstallationStage({
    supabase: input.supabase,
    installationId: input.installationId,
    stage: "generating_organisation_intelligence",
    status: "intelligence_pending",
    counts: input.counts,
    errorSummary: input.summary,
    failureCategory: "intelligence_generation",
    markInstalled: true,
  });
  return getInstallationById(input.supabase, input.installationId);
}

/**
 * Install a sample organisation pack for the authenticated owner/admin.
 * Creates a separate fictional organisation; does not modify the source org.
 */
export async function installSampleOrganisation(input: {
  supabase: SupabaseClient;
  userId: string;
  sourceOrganisationId: string;
  packKey: string;
  idempotencyKey?: string | null;
}): Promise<InstallSampleOrganisationResult> {
  let pack: ValidatedSamplePack;
  try {
    pack = requireSamplePack(input.packKey);
  } catch {
    return { ok: false, error: "Sample pack could not be validated.", code: "INVALID_PACK" };
  }

  buildInstallPlan(pack);

  const existing = await getActiveInstallationForPack(
    input.supabase,
    input.userId,
    pack.manifest.packKey
  );
  if (existing?.status === "ready") {
    return { ok: true, installation: existing, resumed: true };
  }
  if (
    existing &&
    (existing.status === "installing" ||
      existing.status === "resetting" ||
      existing.status === "removing")
  ) {
    return { ok: true, installation: existing, resumed: true };
  }

  const { data: beginData, error: beginError } = await input.supabase.rpc(
    "begin_sample_organisation_installation",
    {
      p_source_organisation_id: input.sourceOrganisationId,
      p_pack_key: pack.manifest.packKey,
      p_pack_version: pack.manifest.packVersion,
      p_organisation_name: pack.organisation.name,
      p_organisation_type: pack.organisation.organisationType,
      p_slug: `${pack.organisation.slugHint}-${input.userId.replace(/-/g, "").slice(0, 10)}`,
      p_idempotency_key: input.idempotencyKey ?? null,
      p_seats_purchased: pack.organisation.licence.seatsPurchased,
    }
  );

  if (beginError) {
    return {
      ok: false,
      error: "Unable to start sample organisation installation.",
      code: "BEGIN_FAILED",
    };
  }

  const begin = (beginData ?? {}) as {
    ok?: boolean;
    code?: string;
    resumed?: boolean;
    installationId?: string;
    organisationId?: string;
    status?: string;
    stage?: string;
  };

  if (!begin.ok || !begin.installationId || !begin.organisationId) {
    return {
      ok: false,
      error:
        begin.code === "PERMISSION_DENIED"
          ? "Permission denied."
          : "Unable to start sample organisation installation.",
      code: begin.code ?? "BEGIN_FAILED",
    };
  }

  const installationId = begin.installationId;
  const organisationId = begin.organisationId;

  if (!begin.resumed) {
    await writeSampleOrganisationAudit({
      supabase: input.supabase,
      organisationId: input.sourceOrganisationId,
      actorUserId: input.userId,
      action: "sample_organisation_install_started",
      installationId,
      packKey: pack.manifest.packKey,
      packVersion: pack.manifest.packVersion,
    });
  }

  if (begin.resumed && begin.status === "ready") {
    const view = await getInstallationById(input.supabase, installationId);
    if (view) return { ok: true, installation: view, resumed: true };
  }

  if (begin.resumed && begin.status === "installing") {
    // Another request owns the in-progress install — return status only.
    const view = await getInstallationById(input.supabase, installationId);
    if (view) return { ok: true, installation: view, resumed: true };
  }

  // Fresh install continues seeding in this request.
  if (!begin.resumed) {
    try {
      const seeded = await seedExistingSampleOrganisation({
        supabase: input.supabase,
        userId: input.userId,
        organisationId,
        installationId,
        pack,
      });

      const intelligence = await generateSampleOrganisationIntelligence({
        supabase: input.supabase,
        userId: input.userId,
        organisationId,
        organisationName: pack.organisation.name,
        installationId,
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
          organisationId,
          installationId,
          expected: expectedCounts,
          requireIntelligenceSnapshot: false,
        });

        if (!pendingVerification.ok) {
          await failInstallation({
            supabase: input.supabase,
            installationId,
            organisationId: input.sourceOrganisationId,
            actorUserId: input.userId,
            packKey: pack.manifest.packKey,
            packVersion: pack.manifest.packVersion,
            category: "verification_failed",
            summary:
              "Installation checks did not pass. Sample records were removed.",
            deleteOrganisation: true,
          });
          return {
            ok: false,
            error:
              "Installation checks did not pass. Sample records were removed.",
            code: "VERIFICATION_FAILED",
          };
        }

        const pending = await markIntelligencePending({
          supabase: input.supabase,
          installationId,
          counts: seeded.counts,
          summary:
            "Sample data was created but Organisation Intelligence could not be generated.",
        });

        await writeSampleOrganisationAudit({
          supabase: input.supabase,
          organisationId,
          actorUserId: input.userId,
          action: "sample_organisation_installed",
          installationId,
          packKey: pack.manifest.packKey,
          packVersion: pack.manifest.packVersion,
          counts: seeded.counts,
          failureCategory: "intelligence_generation",
        });

        if (!pending) {
          return {
            ok: false,
            error: "Installation completed but status could not be loaded.",
            code: "STATUS_MISSING",
          };
        }

        // Dataset is installed; intelligence remains retryable.
        return { ok: true, installation: pending, resumed: false };
      }

      await updateInstallationStage({
        supabase: input.supabase,
        installationId,
        stage: "completing_checks",
        status: "installing",
        counts: seeded.counts,
      });

      const verification = await verifyInstalledDataset({
        supabase: input.supabase,
        organisationId,
        installationId,
        expected: expectedCounts,
        requireIntelligenceSnapshot: true,
      });

      if (!verification.ok) {
        await failInstallation({
          supabase: input.supabase,
          installationId,
          organisationId: input.sourceOrganisationId,
          actorUserId: input.userId,
          packKey: pack.manifest.packKey,
          packVersion: pack.manifest.packVersion,
          category: "verification_failed",
          summary: "Installation checks did not pass. Sample records were removed.",
          deleteOrganisation: true,
        });
        return {
          ok: false,
          error: "Installation checks did not pass. Sample records were removed.",
          code: "VERIFICATION_FAILED",
        };
      }

      await updateInstallationStage({
        supabase: input.supabase,
        installationId,
        stage: "ready",
        status: "ready",
        counts: seeded.counts,
        errorSummary: null,
        failureCategory: null,
        markInstalled: true,
      });

      await writeSampleOrganisationAudit({
        supabase: input.supabase,
        organisationId,
        actorUserId: input.userId,
        action: "sample_organisation_installed",
        installationId,
        packKey: pack.manifest.packKey,
        packVersion: pack.manifest.packVersion,
        counts: seeded.counts,
      });

      const view = await getInstallationById(input.supabase, installationId);
      if (!view) {
        return {
          ok: false,
          error: "Installation completed but status could not be loaded.",
          code: "STATUS_MISSING",
        };
      }
      return { ok: true, installation: view, resumed: false };
    } catch {
      await failInstallation({
        supabase: input.supabase,
        installationId,
        organisationId: input.sourceOrganisationId,
        actorUserId: input.userId,
        packKey: pack.manifest.packKey,
        packVersion: pack.manifest.packVersion,
        category: "install_failed",
        summary: "Sample organisation installation failed. Created records were removed.",
        deleteOrganisation: true,
      });
      return {
        ok: false,
        error:
          "Sample organisation installation failed. Created records were removed.",
        code: "INSTALL_FAILED",
      };
    }
  }

  const view = await getInstallationById(input.supabase, installationId);
  if (!view) {
    return {
      ok: false,
      error: "Unable to load installation status.",
      code: "STATUS_MISSING",
    };
  }
  return { ok: true, installation: view, resumed: true };
}

export async function retrySampleOrganisationIntelligence(input: {
  supabase: SupabaseClient;
  userId: string;
  installationId: string;
}): Promise<InstallSampleOrganisationResult> {
  const installation = await getInstallationById(
    input.supabase,
    input.installationId
  );
  if (!installation) {
    return { ok: false, error: "Installation not found.", code: "NOT_FOUND" };
  }
  if (installation.status !== "intelligence_pending") {
    return {
      ok: false,
      error: "Intelligence retry is not available for this installation.",
      code: "INVALID_STATE",
      installation,
    };
  }

  const pack = requireSamplePack(installation.packKey);
  const intelligence = await generateSampleOrganisationIntelligence({
    supabase: input.supabase,
    userId: input.userId,
    organisationId: installation.organisationId,
    organisationName: pack.organisation.name,
    installationId: installation.id,
  });

  if (!intelligence.ok) {
    return {
      ok: false,
      error: "Organisation Intelligence could not be generated.",
      code: "INTELLIGENCE_PENDING",
      installation,
    };
  }

  const verification = await verifyInstalledDataset({
    supabase: input.supabase,
    organisationId: installation.organisationId,
    installationId: installation.id,
    expected: {
      relationships: pack.manifest.expectedCounts.relationships,
      confidentialRelationships:
        pack.manifest.expectedCounts.confidentialRelationships,
      sessions: pack.manifest.expectedCounts.sessions,
      actions: pack.manifest.expectedCounts.actions,
      developmentUpdates: pack.manifest.expectedCounts.developmentUpdates,
      intelligenceItems: pack.manifest.expectedCounts.intelligenceItems,
    },
    requireIntelligenceSnapshot: true,
  });

  if (!verification.ok) {
    return {
      ok: false,
      error: "Checks did not pass after intelligence generation.",
      code: "VERIFICATION_FAILED",
      installation,
    };
  }

  await updateInstallationStage({
    supabase: input.supabase,
    installationId: installation.id,
    stage: "ready",
    status: "ready",
    errorSummary: null,
    failureCategory: null,
    markInstalled: true,
  });

  const view = await getInstallationById(input.supabase, installation.id);
  return {
    ok: true,
    installation: view!,
    resumed: false,
  };
}
