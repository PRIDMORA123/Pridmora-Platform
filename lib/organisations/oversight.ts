import type { SupabaseClient } from "@supabase/supabase-js";
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

/**
 * Safe operational oversight metrics only.
 * Never includes private notes, summaries, themes, or client narrative.
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

  const [
    membersResult,
    membershipRowsResult,
    assignmentRowsResult,
    relationshipsResult,
    conversationsResult,
    awaitingNotesResult,
    awaitingSummaryResult,
    prepResult,
    developmentResult,
    reportsResult,
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
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", organisationId)
      .is("archived_at", null),
    supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", organisationId)
      .gte("updated_at", monthIso)
      .in("status", ["completed", "awaiting_completion", "in_progress"]),
    // Awaiting session notes: ended conversations that still require notes.
    // Excludes planned, in-progress, paused, completed, archived sessions.
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
    supabase
      .from("development_updates")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", organisationId)
      .eq("status", "applied"),
    supabase
      .from("development_reports")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", organisationId),
  ]);

  const countOf = (result: {
    count: number | null;
    error: { message: string } | null;
  }) => (result.error ? 0 : result.count ?? 0);

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

  const preparation = countOf(prepResult);
  const summaries = countOf(awaitingSummaryResult);
  const developmentUpdates = countOf(developmentResult);
  const reports = countOf(reportsResult);

  return {
    organisationName,
    organisationType: organisationType ?? null,
    activeMembers: countOf(membersResult),
    practitioners: countActivePractitioners(memberships, assignments),
    activeRelationships: countOf(relationshipsResult),
    conversationsThisMonth: countOf(conversationsResult),
    awaitingSessionNotes: countOf(awaitingNotesResult),
    summariesAwaitingReview: summaries,
    preparationUsageThisMonth: preparation,
    developmentUpdatesCompleted: developmentUpdates,
    reportsCount: reports,
    aiOperationCounts: {
      preparation,
      summaries,
      developmentUpdates,
      reports,
    },
  };
}
