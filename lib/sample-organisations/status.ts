import type { SupabaseClient } from "@supabase/supabase-js";
import { isSampleOrganisationIntelligenceGenerationAvailable } from "@/lib/sample-organisations/organisation-intelligence";
import {
  isSampleInstallationStage,
  isSampleInstallationStatus,
  progressPercentForStage,
  stageLabel,
} from "@/lib/sample-organisations/progress";
import type {
  SampleInstallationStage,
  SampleInstallationStatus,
  SampleInstallationView,
} from "@/lib/sample-organisations/types";

type InstallationRow = {
  id: string;
  organisation_id: string;
  source_organisation_id: string | null;
  pack_key: string;
  pack_version: string;
  status: string;
  stage: string;
  installed_by: string;
  installed_at: string | null;
  updated_at: string;
  relationship_count: number;
  session_count: number;
  action_count: number;
  development_update_count: number;
  intelligence_item_count: number;
  error_summary: string | null;
  failure_category: string | null;
};

export function mapInstallationRow(
  row: InstallationRow,
  installedByName: string | null = null
): SampleInstallationView {
  const status: SampleInstallationStatus = isSampleInstallationStatus(row.status)
    ? row.status
    : "failed";
  const stage: SampleInstallationStage = isSampleInstallationStage(row.stage)
    ? row.stage
    : "failed";

  return {
    id: row.id,
    organisationId: row.organisation_id,
    sourceOrganisationId: row.source_organisation_id,
    packKey: row.pack_key,
    packVersion: row.pack_version,
    status,
    stage,
    stageLabel: stageLabel(stage),
    installedBy: row.installed_by,
    installedByName,
    installedAt: row.installed_at,
    updatedAt: row.updated_at,
    counts: {
      relationships: row.relationship_count,
      sessions: row.session_count,
      actions: row.action_count,
      developmentUpdates: row.development_update_count,
      intelligenceItems: row.intelligence_item_count,
    },
    errorSummary: row.error_summary,
    failureCategory: row.failure_category,
    progressPercent: progressPercentForStage(stage, status),
    canRetryIntelligence:
      status === "intelligence_pending" &&
      isSampleOrganisationIntelligenceGenerationAvailable(),
  };
}

export async function getInstallationById(
  supabase: SupabaseClient,
  installationId: string
): Promise<SampleInstallationView | null> {
  const { data, error } = await supabase
    .from("sample_organisation_installations")
    .select("*")
    .eq("id", installationId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as InstallationRow;

  let installedByName: string | null = null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", row.installed_by)
    .maybeSingle();
  if (profile?.full_name) {
    installedByName = String(profile.full_name);
  }

  return mapInstallationRow(row, installedByName);
}

export async function getActiveInstallationForPack(
  supabase: SupabaseClient,
  userId: string,
  packKey: string
): Promise<SampleInstallationView | null> {
  const { data, error } = await supabase
    .from("sample_organisation_installations")
    .select("*")
    .eq("installed_by", userId)
    .eq("pack_key", packKey)
    .in("status", [
      "installing",
      "ready",
      "resetting",
      "removing",
      "intelligence_pending",
    ])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mapInstallationRow(data as InstallationRow);
}

export async function updateInstallationStage(input: {
  supabase: SupabaseClient;
  installationId: string;
  stage: SampleInstallationStage;
  status?: SampleInstallationStatus;
  counts?: Partial<{
    relationships: number;
    sessions: number;
    actions: number;
    developmentUpdates: number;
    intelligenceItems: number;
  }>;
  errorSummary?: string | null;
  failureCategory?: string | null;
  markInstalled?: boolean;
}): Promise<void> {
  const patch: Record<string, unknown> = {
    stage: input.stage,
    updated_at: new Date().toISOString(),
  };

  if (input.status) patch.status = input.status;
  if (input.counts?.relationships != null) {
    patch.relationship_count = input.counts.relationships;
  }
  if (input.counts?.sessions != null) {
    patch.session_count = input.counts.sessions;
  }
  if (input.counts?.actions != null) {
    patch.action_count = input.counts.actions;
  }
  if (input.counts?.developmentUpdates != null) {
    patch.development_update_count = input.counts.developmentUpdates;
  }
  if (input.counts?.intelligenceItems != null) {
    patch.intelligence_item_count = input.counts.intelligenceItems;
  }
  if (input.errorSummary !== undefined) {
    patch.error_summary = input.errorSummary;
  }
  if (input.failureCategory !== undefined) {
    patch.failure_category = input.failureCategory;
  }
  if (input.markInstalled) {
    patch.installed_at = new Date().toISOString();
  }

  const { error } = await input.supabase
    .from("sample_organisation_installations")
    .update(patch)
    .eq("id", input.installationId);

  if (error) {
    throw new Error("Unable to update installation progress.");
  }
}

export type InstalledDatasetVerification = {
  ok: boolean;
  issues: string[];
  counts: {
    relationships: number;
    confidentialRelationships: number;
    sessions: number;
    actions: number;
    developmentUpdates: number;
    intelligenceItems: number;
    snapshots: number;
  };
};

export async function verifyInstalledDataset(input: {
  supabase: SupabaseClient;
  organisationId: string;
  installationId: string;
  expected: {
    relationships: number;
    confidentialRelationships: number;
    sessions: number;
    actions: number;
    developmentUpdates: number;
    intelligenceItems: number;
  };
  requireIntelligenceSnapshot?: boolean;
}): Promise<InstalledDatasetVerification> {
  const issues: string[] = [];
  const requireSnapshot = input.requireIntelligenceSnapshot !== false;

  const { data: mappedRelationships } = await input.supabase
    .from("sample_organisation_records")
    .select("record_id")
    .eq("installation_id", input.installationId)
    .eq("record_type", "relationship");

  const relationshipIds = (mappedRelationships ?? []).map(r => r.record_id as string);

  const { data: clients } = await input.supabase
    .from("clients")
    .select("id, identity_mode, email, ai_name_allowed, confidential_reference, display_label")
    .eq("organisation_id", input.organisationId)
    .in("id", relationshipIds.length ? relationshipIds : ["00000000-0000-0000-0000-000000000000"]);

  const clientRows = clients ?? [];
  if (clientRows.length !== input.expected.relationships) {
    issues.push(
      `Expected ${input.expected.relationships} relationships, found ${clientRows.length}`
    );
  }

  const confidential = clientRows.filter(c => c.identity_mode === "confidential");
  if (confidential.length !== input.expected.confidentialRelationships) {
    issues.push(
      `Expected ${input.expected.confidentialRelationships} confidential relationships`
    );
  }

  for (const row of confidential) {
    if (row.email) {
      issues.push("Confidential public record contains email.");
    }
    if (row.ai_name_allowed) {
      issues.push("Confidential relationship allows AI name use.");
    }
    if (!row.display_label) {
      issues.push("Confidential relationship missing display label.");
    }
  }

  const { count: sessionCount } = await input.supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", input.organisationId);

  const { count: actionCount } = await input.supabase
    .from("client_items")
    .select("id", { count: "exact", head: true })
    .eq("item_type", "action")
    .in("client_id", relationshipIds.length ? relationshipIds : ["00000000-0000-0000-0000-000000000000"]);

  const { count: updateCount } = await input.supabase
    .from("development_updates")
    .select("id", { count: "exact", head: true })
    .in("client_id", relationshipIds.length ? relationshipIds : ["00000000-0000-0000-0000-000000000000"]);

  const { count: intelligenceCount } = await input.supabase
    .from("intelligence_items")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved")
    .in("client_id", relationshipIds.length ? relationshipIds : ["00000000-0000-0000-0000-000000000000"]);

  let snapshots = 0;
  const snapshotQuery = await input.supabase
    .from("organisation_intelligence_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", input.organisationId)
    .eq("status", "ready");

  if (snapshotQuery.error) {
    // Table may be absent until Organisation Intelligence is released.
    if (requireSnapshot) {
      issues.push("Organisation Intelligence snapshot missing.");
    }
  } else {
    snapshots = snapshotQuery.count ?? 0;
    if (requireSnapshot && snapshots < 1) {
      issues.push("Organisation Intelligence snapshot missing.");
    }
  }

  const sessions = sessionCount ?? 0;
  const actions = actionCount ?? 0;
  const updates = updateCount ?? 0;
  const intelligence = intelligenceCount ?? 0;

  if (sessions !== input.expected.sessions) {
    issues.push(`Expected ${input.expected.sessions} sessions, found ${sessions}`);
  }
  if (actions !== input.expected.actions) {
    issues.push(`Expected ${input.expected.actions} actions, found ${actions}`);
  }
  if (updates !== input.expected.developmentUpdates) {
    issues.push(
      `Expected ${input.expected.developmentUpdates} development updates, found ${updates}`
    );
  }
  if (intelligence !== input.expected.intelligenceItems) {
    issues.push(
      `Expected ${input.expected.intelligenceItems} intelligence items, found ${intelligence}`
    );
  }

  // Every relationship should have an active primary assignment.
  for (const clientId of relationshipIds) {
    const { count } = await input.supabase
      .from("relationship_assignments")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("organisation_id", input.organisationId)
      .eq("assignment_role", "primary")
      .eq("status", "active");
    if ((count ?? 0) < 1) {
      issues.push("Relationship missing active primary assignment.");
      break;
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    counts: {
      relationships: clientRows.length,
      confidentialRelationships: confidential.length,
      sessions,
      actions,
      developmentUpdates: updates,
      intelligenceItems: intelligence,
      snapshots,
    },
  };
}
