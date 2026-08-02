/**
 * Safe oversight metric definitions.
 *
 * These helpers document and unit-test the counting rules used by
 * loadSafeOversightMetrics. They never include confidential coaching content.
 */

import type { AssignmentRole, MembershipRole } from "@/lib/organisations/types";

/** Roles that may access coaching content when also assigned. */
const CONTENT_CAPABLE_ROLES: ReadonlySet<MembershipRole> = new Set([
  "practitioner",
  "owner",
  "administrator",
]);

/** Assignment roles that grant operational coaching access. */
const CONTENT_ASSIGNMENT_ROLES: ReadonlySet<AssignmentRole> = new Set([
  "primary",
  "co_practitioner",
  "cover",
]);

export type MembershipMetricRow = {
  userId: string;
  role: MembershipRole;
  status: string;
};

export type AssignmentMetricRow = {
  userId: string;
  assignmentRole: AssignmentRole;
  status: string;
};

export type SessionMetricRow = {
  status: string;
  notesSavedAt: string | null;
  updatedAt?: string | null;
  archivedAt?: string | null;
  deletedAt?: string | null;
};

/**
 * Active practitioners
 *
 * Count distinct active members who:
 * - have membership role "practitioner"; or
 * - hold an active content-granting assignment (primary / co_practitioner / cover)
 *   and a content-capable membership role (practitioner, owner, administrator).
 *
 * This avoids showing "0 Practitioners" for a personal-workspace owner who is
 * actively practising through primary assignments, without changing permissions.
 */
export function countActivePractitioners(
  memberships: MembershipMetricRow[],
  assignments: AssignmentMetricRow[]
): number {
  const assignedUsers = new Set(
    assignments
      .filter(
        row =>
          row.status === "active" &&
          CONTENT_ASSIGNMENT_ROLES.has(row.assignmentRole)
      )
      .map(row => row.userId)
  );

  const practitioners = new Set<string>();
  for (const member of memberships) {
    if (member.status !== "active") continue;
    if (member.role === "practitioner") {
      practitioners.add(member.userId);
      continue;
    }
    if (
      CONTENT_CAPABLE_ROLES.has(member.role) &&
      assignedUsers.has(member.userId)
    ) {
      practitioners.add(member.userId);
    }
  }
  return practitioners.size;
}

/**
 * Awaiting session notes
 *
 * Count sessions that:
 * - have ended and require outcome notes (status = awaiting_completion);
 * - do not yet have completed outcome notes (notes_saved_at is null);
 * - are not archived or deleted.
 *
 * Excludes: planned, prepared, in_progress, paused, completed (with notes),
 * and any archived/deleted rows.
 */
export function isAwaitingSessionNotes(session: SessionMetricRow): boolean {
  if (session.archivedAt || session.deletedAt) return false;
  if (session.status !== "awaiting_completion") return false;
  return session.notesSavedAt == null;
}

export function countAwaitingSessionNotes(sessions: SessionMetricRow[]): number {
  return sessions.filter(isAwaitingSessionNotes).length;
}

/**
 * Conversations this month — operational activity count.
 * Includes in-progress, awaiting completion, and completed sessions updated
 * within the month window. Excludes planned/prepared/paused-only idle rows
 * and archived/deleted sessions.
 */
export function isConversationThisMonth(
  session: SessionMetricRow,
  monthStartIso: string
): boolean {
  if (session.archivedAt || session.deletedAt) return false;
  if (!session.updatedAt || session.updatedAt < monthStartIso) return false;
  return (
    session.status === "completed" ||
    session.status === "awaiting_completion" ||
    session.status === "in_progress"
  );
}

export const METRIC_DEFINITIONS = {
  activePractitioners:
    "Distinct active members with role practitioner, or content-capable members with an active primary/co-practitioner/cover assignment.",
  awaitingSessionNotes:
    "Sessions with status awaiting_completion and no notes_saved_at. Excludes planned, active, completed-with-notes, archived and deleted sessions.",
  conversationsThisMonth:
    "Sessions updated this month with status in_progress, awaiting_completion or completed.",
} as const;
