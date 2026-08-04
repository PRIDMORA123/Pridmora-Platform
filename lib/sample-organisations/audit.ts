import type { SupabaseClient } from "@supabase/supabase-js";
import { writeOrganisationAudit } from "@/lib/organisations/repository";
import type {
  SampleAuditAction,
  SampleInstallationCounts,
} from "@/lib/sample-organisations/types";

/** Safe audit metadata only — never notes, identity, emails or raw errors. */
export async function writeSampleOrganisationAudit(input: {
  supabase: SupabaseClient;
  organisationId: string;
  actorUserId: string;
  action: SampleAuditAction;
  installationId: string;
  packKey: string;
  packVersion: string;
  counts?: Partial<SampleInstallationCounts>;
  failureCategory?: string | null;
}): Promise<void> {
  const metadata: Record<string, unknown> = {
    installationId: input.installationId,
    packKey: input.packKey,
    packVersion: input.packVersion,
  };

  if (input.counts) {
    metadata.counts = {
      relationships: input.counts.relationships ?? 0,
      sessions: input.counts.sessions ?? 0,
      actions: input.counts.actions ?? 0,
      developmentUpdates: input.counts.developmentUpdates ?? 0,
      intelligenceItems: input.counts.intelligenceItems ?? 0,
    };
  }

  if (input.failureCategory) {
    metadata.failureCategory = input.failureCategory;
  }

  await writeOrganisationAudit({
    supabase: input.supabase,
    organisationId: input.organisationId,
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: "sample_organisation_installation",
    entityId: input.installationId,
    metadata,
  });
}
