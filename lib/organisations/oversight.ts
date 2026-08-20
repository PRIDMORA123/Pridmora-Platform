import type { SupabaseClient } from "@supabase/supabase-js";
import { isSelfDevelopmentClientRow } from "@/lib/my-development/self-development-identity";
import {
  countActivePractitioners,
  type AssignmentMetricRow,
  type MembershipMetricRow,
} from "@/lib/organisations/metric-definitions";
import type {
  AssignmentRole,
  MembershipRole,
  OrganisationType,
  SafeOversightMetrics,
} from "@/lib/organisations/types";

type CountResult = {
  count: number | null;
  error: { message: string } | null;
};

function requireCount(result: CountResult, label: string): number {
  if (result.error) {
    throw new Error(`Unable to load ${label}: ${result.error.message}`);
  }
  return result.count ?? 0;
}

async function listOrganisationPeopleClients(
  supabase: SupabaseClient,
  organisationId: string
): Promise<Array<{ id: string; archivedAt: string | null }>> {
  const withFlag = await supabase
    .from("clients")
    .select("id, role, is_self_development, archived_at")
    .eq("organisation_id", organisationId);

  let rows = withFlag.data as Array<{
    id: string;
    role?: string | null;
    is_self_development?: boolean | null;
    archived_at?: string | null;
  }> | null;
  let error = withFlag.error;

  if (error && /is_self_development|schema cache|could not find/i.test(error.message)) {
    const fallback = await supabase
      .from("clients")
      .select("id, role, archived_at")
      .eq("organisation_id", organisationId);
    rows = fallback.data as typeof rows;
    error = fallback.error;
  }

  if (error) {
    throw new Error(`Unable to load organisation clients: ${error.message}`);
  }

  return (rows ?? [])
    .filter(
      row =>
        !isSelfDevelopmentClientRow({
          is_self_development: row.is_self_development,
          role: row.role,
        })
    )
    .map(row => ({
      id: typeof row.id === "string" ? row.id : "",
      archivedAt: row.archived_at ?? null,
    }))
    .filter(row => Boolean(row.id));
}

/**
 * Count rows linked to organisation clients (by client_id).
 * Needed where organisation_id may be null on older development_update /
 * development_report rows while client tenancy remains reliable.
 */
async function countByOrganisationClientIds(
  supabase: SupabaseClient,
  clientIds: string[],
  table: "development_updates" | "development_reports",
  filters?: { status?: string }
): Promise<number> {
  if (clientIds.length === 0) return 0;

  let query = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .in("client_id", clientIds);

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { count, error } = await query;
  if (error) {
    throw new Error(`Unable to load ${table}: ${error.message}`);
  }
  return count ?? 0;
}

/**
 * Safe operational oversight metrics only.
 * Never includes private notes, summaries, themes, or client narrative.
 *
 * Call only after organisation.view_safe_oversight (or equivalent) is proven.
 * Pass a privileged server client: session/development_update RLS denies
 * unassigned Organisation Leads, which previously zeroed Usage silently.
 *
 * Metric definitions (see lib/organisations/metric-definitions.ts):
 * - Active practitioners: practitioner role OR content-capable role with an
 *   active primary/co_practitioner/cover assignment.
 * - Awaiting session notes: status = awaiting_completion AND notes_saved_at IS NULL.
 */
export async function loadSafeOversightMetrics(
  supabase: SupabaseClient,
  organisationId: string,
  organisationName: string,
  organisationType?: OrganisationType
): Promise<SafeOversightMetrics> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthIso = monthStart.toISOString();

  const peopleClients = await listOrganisationPeopleClients(
    supabase,
    organisationId
  );
  const organisationClientIds = peopleClients.map(row => row.id);
  const activeRelationships = peopleClients.filter(row => row.archivedAt == null)
    .length;

  const [
    membersResult,
    membershipRowsResult,
    assignmentRowsResult,
    conversationsResult,
    awaitingNotesResult,
    awaitingSummaryResult,
    prepResult,
    developmentUpdatesCompleted,
    reportsCount,
  ] = await Promise.all([
    supabase
      .from("organisation_memberships")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", organisationId)
      .eq("status", "active"),
    supabase
      .from("organisation_memberships")
      .select("user_id, role, status")
      .eq("organisation_id", organisationId)
      .eq("status", "active"),
    supabase
      .from("relationship_assignments")
      .select("user_id, assignment_role, status")
      .eq("organisation_id", organisationId)
      .eq("status", "active")
      .in("assignment_role", ["primary", "co_practitioner", "cover"]),
    supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", organisationId)
      .gte("updated_at", monthIso)
      .in("status", ["completed", "awaiting_completion", "in_progress"]),
    supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", organisationId)
      .eq("status", "awaiting_completion")
      .is("notes_saved_at", null),
    supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", organisationId)
      .eq("summary_status", "draft"),
    supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", organisationId)
      .gte("prep_ai_brief_generated_at", monthIso),
    countByOrganisationClientIds(
      supabase,
      organisationClientIds,
      "development_updates",
      { status: "applied" }
    ),
    countByOrganisationClientIds(
      supabase,
      organisationClientIds,
      "development_reports"
    ),
  ]);

  if (membershipRowsResult.error) {
    throw new Error(
      `Unable to load memberships: ${membershipRowsResult.error.message}`
    );
  }
  if (assignmentRowsResult.error) {
    throw new Error(
      `Unable to load assignments: ${assignmentRowsResult.error.message}`
    );
  }

  const memberships: MembershipMetricRow[] = (
    membershipRowsResult.data ?? []
  ).map(row => ({
    userId: row.user_id as string,
    role: row.role as MembershipRole,
    status: row.status as string,
  }));

  const assignments: AssignmentMetricRow[] = (
    assignmentRowsResult.data ?? []
  ).map(row => ({
    userId: row.user_id as string,
    assignmentRole: row.assignment_role as AssignmentRole,
    status: row.status as string,
  }));

  const preparation = requireCount(prepResult, "preparations");
  const summaries = requireCount(
    awaitingSummaryResult,
    "summaries awaiting review"
  );

  return {
    organisationName,
    organisationType: organisationType ?? null,
    activeMembers: requireCount(membersResult, "active members"),
    practitioners: countActivePractitioners(memberships, assignments),
    activeRelationships,
    conversationsThisMonth: requireCount(
      conversationsResult,
      "conversations this month"
    ),
    awaitingSessionNotes: requireCount(
      awaitingNotesResult,
      "awaiting session notes"
    ),
    summariesAwaitingReview: summaries,
    preparationUsageThisMonth: preparation,
    developmentUpdatesCompleted,
    reportsCount,
    aiOperationCounts: {
      preparation,
      summaries,
      developmentUpdates: developmentUpdatesCompleted,
      reports: reportsCount,
    },
  };
}
