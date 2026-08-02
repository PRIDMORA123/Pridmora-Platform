import type { Client } from "@/lib/types";
import type { DevelopmentUpdate } from "@/lib/development-updates/types";
import type { CoachingImpactMetrics } from "@/lib/reports/types";

function inPeriod(
  value: string | null | undefined,
  start: string | null | undefined,
  end: string | null | undefined
): boolean {
  if (!start && !end) return true;
  if (!value) return true;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return true;
  if (start) {
    const startTime = Date.parse(`${start}T00:00:00`);
    if (!Number.isNaN(startTime) && time < startTime) return false;
  }
  if (end) {
    const endTime = Date.parse(`${end}T23:59:59`);
    if (!Number.isNaN(endTime) && time > endTime) return false;
  }
  return true;
}

/**
 * Platform-supported engagement metrics only.
 * Never frames these as organisational results caused by coaching.
 */
export function buildCoachingImpactMetrics(input: {
  client: Client;
  updates: DevelopmentUpdate[];
  reportingPeriodStart: string | null;
  reportingPeriodEnd: string | null;
}): CoachingImpactMetrics {
  const { client, updates, reportingPeriodStart, reportingPeriodEnd } = input;

  const sessions = client.sessions.filter(session =>
    inPeriod(session.completedAt || session.date, reportingPeriodStart, reportingPeriodEnd)
  );

  const conversationsCompleted = sessions.filter(
    session =>
      session.status === "completed" ||
      session.aiSummaryApproved ||
      session.summaryStatus === "approved"
  ).length;

  const reflectionsCompleted = sessions.filter(
    session =>
      session.summaryStatus === "approved" || session.aiSummaryApproved
  ).length;

  const commitmentsCreated =
    client.actions.length +
    sessions.filter(session => session.commitments.trim()).length;

  const commitmentsCompleted = client.actions.filter(
    action => action.status === "Complete"
  ).length;

  const approvedDevelopmentUpdates = updates.filter(
    update =>
      update.status === "applied" &&
      inPeriod(
        update.appliedAt || update.updatedAt,
        reportingPeriodStart,
        reportingPeriodEnd
      )
  ).length;

  return {
    conversationsCompleted,
    reflectionsCompleted,
    commitmentsCreated,
    commitmentsCompleted,
    approvedDevelopmentUpdates,
    reportingPeriodStart: reportingPeriodStart ?? "",
    reportingPeriodEnd: reportingPeriodEnd ?? "",
  };
}
