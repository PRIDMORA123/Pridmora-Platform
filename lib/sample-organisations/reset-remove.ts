import type { SupabaseClient } from "@supabase/supabase-js";
import { writeSampleOrganisationAudit } from "@/lib/sample-organisations/audit";
import {
  getInstallationById,
  updateInstallationStage,
} from "@/lib/sample-organisations/status";
import type { SampleInstallationView } from "@/lib/sample-organisations/types";

export type ResetSampleOrganisationResult =
  | { ok: true; installation: SampleInstallationView }
  | { ok: false; error: string; code?: string };

/**
 * Reset returns the sample organisation to the original pack state.
 * Removes only mapped sample records, preserves the organisation container,
 * then reinstalls from the same pack version.
 */
export async function resetSampleOrganisation(input: {
  supabase: SupabaseClient;
  userId: string;
  installationId: string;
}): Promise<ResetSampleOrganisationResult> {
  const installation = await getInstallationById(
    input.supabase,
    input.installationId
  );
  if (!installation) {
    return { ok: false, error: "Installation not found.", code: "NOT_FOUND" };
  }
  if (
    installation.status !== "ready" &&
    installation.status !== "intelligence_pending"
  ) {
    return {
      ok: false,
      error: "Only a ready sample organisation can be reset.",
      code: "INVALID_STATE",
    };
  }

  await updateInstallationStage({
    supabase: input.supabase,
    installationId: installation.id,
    stage: "creating_organisation",
    status: "resetting",
  });

  await writeSampleOrganisationAudit({
    supabase: input.supabase,
    organisationId: installation.organisationId,
    actorUserId: input.userId,
    action: "sample_organisation_reset_started",
    installationId: installation.id,
    packKey: installation.packKey,
    packVersion: installation.packVersion,
  });

  const { data: cleanup, error: cleanupError } = await input.supabase.rpc(
    "cleanup_sample_organisation_installation",
    {
      p_installation_id: installation.id,
      p_delete_organisation: false,
    }
  );

  if (cleanupError || !(cleanup as { ok?: boolean } | null)?.ok) {
    await updateInstallationStage({
      supabase: input.supabase,
      installationId: installation.id,
      stage: "ready",
      status: "ready",
      errorSummary: "Reset could not clear sample records.",
      failureCategory: "reset_cleanup_failed",
    });
    return {
      ok: false,
      error: "Reset could not clear sample records.",
      code: "CLEANUP_FAILED",
    };
  }

  await updateInstallationStage({
    supabase: input.supabase,
    installationId: installation.id,
    stage: "creating_relationships",
    status: "installing",
    counts: {
      relationships: 0,
      sessions: 0,
      actions: 0,
      developmentUpdates: 0,
      intelligenceItems: 0,
    },
    errorSummary: null,
    failureCategory: null,
  });

  const { reseedSampleOrganisation } = await import(
    "@/lib/sample-organisations/reseed"
  );

  const reseed = await reseedSampleOrganisation({
    supabase: input.supabase,
    userId: input.userId,
    installationId: installation.id,
    organisationId: installation.organisationId,
    packKey: installation.packKey,
  });

  if (!reseed.ok) {
    return {
      ok: false,
      error: reseed.error,
      code: reseed.code,
    };
  }

  await writeSampleOrganisationAudit({
    supabase: input.supabase,
    organisationId: installation.organisationId,
    actorUserId: input.userId,
    action: "sample_organisation_reset",
    installationId: installation.id,
    packKey: installation.packKey,
    packVersion: installation.packVersion,
    counts: reseed.installation.counts,
  });

  return { ok: true, installation: reseed.installation };
}

export async function removeSampleOrganisation(input: {
  supabase: SupabaseClient;
  userId: string;
  installationId: string;
  confirmation: string;
}): Promise<
  | {
      ok: true;
      sourceOrganisationId: string | null;
    }
  | { ok: false; error: string; code?: string }
> {
  if (input.confirmation.trim() !== "REMOVE") {
    return {
      ok: false,
      error: "Type REMOVE to confirm removal.",
      code: "CONFIRMATION_REQUIRED",
    };
  }

  const installation = await getInstallationById(
    input.supabase,
    input.installationId
  );
  if (!installation) {
    return { ok: false, error: "Installation not found.", code: "NOT_FOUND" };
  }

  if (
    installation.status !== "ready" &&
    installation.status !== "failed" &&
    installation.status !== "intelligence_pending"
  ) {
    return {
      ok: false,
      error: "This sample organisation cannot be removed in its current state.",
      code: "INVALID_STATE",
    };
  }

  await updateInstallationStage({
    supabase: input.supabase,
    installationId: installation.id,
    stage: "removed",
    status: "removing",
  });

  const { data: cleanup, error: cleanupError } = await input.supabase.rpc(
    "cleanup_sample_organisation_installation",
    {
      p_installation_id: installation.id,
      p_delete_organisation: true,
    }
  );

  if (cleanupError || !(cleanup as { ok?: boolean } | null)?.ok) {
    await updateInstallationStage({
      supabase: input.supabase,
      installationId: installation.id,
      stage: "ready",
      status: installation.status === "failed" ? "failed" : "ready",
      errorSummary: "Sample organisation could not be removed.",
      failureCategory: "remove_failed",
    });
    return {
      ok: false,
      error: "Sample organisation could not be removed.",
      code: "REMOVE_FAILED",
    };
  }

  await writeSampleOrganisationAudit({
    supabase: input.supabase,
    organisationId:
      installation.sourceOrganisationId ?? installation.organisationId,
    actorUserId: input.userId,
    action: "sample_organisation_removed",
    installationId: installation.id,
    packKey: installation.packKey,
    packVersion: installation.packVersion,
    counts: installation.counts,
  });

  return {
    ok: true,
    sourceOrganisationId: installation.sourceOrganisationId,
  };
}

/** Open sample organisation — switch preference + audit. */
export async function openSampleOrganisation(input: {
  supabase: SupabaseClient;
  userId: string;
  installationId: string;
}): Promise<
  | { ok: true; organisationId: string }
  | { ok: false; error: string; code?: string }
> {
  const installation = await getInstallationById(
    input.supabase,
    input.installationId
  );
  if (!installation || installation.status !== "ready") {
    return {
      ok: false,
      error: "Sample organisation is not ready.",
      code: "NOT_READY",
    };
  }

  const { setCurrentOrganisationPreference } = await import(
    "@/lib/organisations/repository"
  );

  await setCurrentOrganisationPreference(
    input.supabase,
    input.userId,
    installation.organisationId
  );

  await writeSampleOrganisationAudit({
    supabase: input.supabase,
    organisationId: installation.organisationId,
    actorUserId: input.userId,
    action: "sample_organisation_opened",
    installationId: installation.id,
    packKey: installation.packKey,
    packVersion: installation.packVersion,
  });

  return { ok: true, organisationId: installation.organisationId };
}
