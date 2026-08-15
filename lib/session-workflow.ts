import { extractVisibleCoachNotes } from "@/lib/coach-notes";
import { hasPreparationAiContent } from "@/lib/preparation-brief";
import type { Client, CoachingAction, Session, SessionStatus, SummaryStatus } from "@/lib/types";

export type SessionWorkspaceStage =
  | "overview"
  | "prepare"
  | "coach"
  | "reflect"
  | "summary"
  | "actions";

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  planned: "Planned",
  prepared: "Prepared",
  in_progress: "In progress",
  paused: "Paused",
  awaiting_completion: "Awaiting completion",
  completed: "Completed",
};

export const SUMMARY_STATUS_LABELS: Record<SummaryStatus, string> = {
  not_generated: "Not generated",
  draft: "Draft",
  approved: "Approved",
};

/** Client-facing journey steps for profile / overview. */
export const COACHING_JOURNEY_STEPS = [
  "Schedule",
  "Prepare",
  "Coach",
  "Reflect",
  "Complete",
  "Next session",
] as const;

export function coachingJourneyStepIndex(status: SessionStatus): number {
  switch (status) {
    case "planned":
      return 1; // Prepare
    case "prepared":
      return 2; // Coach
    case "in_progress":
    case "paused":
      return 2;
    case "awaiting_completion":
      return 3; // Reflect / Complete
    case "completed":
      return 5; // Next session
  }
}

export function isOpenSessionStatus(status: SessionStatus): boolean {
  return status !== "completed";
}

export function sessionDisplayTitle(session: Pick<Session, "title" | "focus" | "sessionNumber">): string {
  const title = session.title.trim() || session.focus.trim();
  return title || `Development Conversation ${session.sessionNumber}`;
}

export function formatSessionDateTime(session: Pick<Session, "date" | "time">): string {
  const date = session.date.trim();
  const time = session.time.trim();
  if (date && time) return `${date} · ${time}`;
  if (date) return date;
  if (time) return time;
  return "Date not set";
}

function parseSessionInstant(session: Pick<Session, "date" | "time">): number | null {
  const date = session.date.trim();
  if (!date || /not scheduled|schedule/i.test(date)) return null;

  const time = session.time.trim();
  const timeMatch = time.match(/^(\d{1,2}):(\d{2})$/);
  const candidate = timeMatch
    ? `${date} ${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`
    : date;
  const parsed = Date.parse(candidate);
  return Number.isNaN(parsed) ? null : parsed;
}

function pickOpenSessionByPriority(
  sessions: Session[],
  priority: Record<SessionStatus, number>
): Session | undefined {
  const open = sessions.filter(session => isOpenSessionStatus(session.status));
  if (open.length === 0) return undefined;

  return [...open].sort((a, b) => {
    const byStatus = priority[a.status] - priority[b.status];
    if (byStatus !== 0) return byStatus;
    // Prefer the most recent session when status matches so Session N
    // remains the current workspace after notes / summary work.
    if (a.sessionNumber !== b.sessionNumber) {
      return b.sessionNumber - a.sessionNumber;
    }
    const aTime = parseSessionInstant(a) ?? Number.MAX_SAFE_INTEGER;
    const bTime = parseSessionInstant(b) ?? Number.MAX_SAFE_INTEGER;
    return bTime - aTime;
  })[0];
}

/**
 * Next actionable session for general workspace / attention flows.
 * Live work and awaiting completion remain ahead of future planned sessions
 * so Managers can still finish Session N notes and Complete Session.
 */
export function getNextOpenSession(sessions: Session[]): Session | undefined {
  return pickOpenSessionByPriority(sessions, {
    in_progress: 0,
    paused: 0,
    awaiting_completion: 1,
    prepared: 2,
    planned: 3,
    completed: 9,
  });
}

export function getFutureOrOpenSession(sessions: Session[]): Session | undefined {
  return getNextOpenSession(sessions);
}

/**
 * Session selection for Prepare with Aurelia.
 * Prefer a future planned/prepared conversation over an earlier
 * awaiting_completion session so Prepare does not reopen Session N-1.
 * Live in-progress/paused sessions still win when present.
 *
 * For established relationships (completed sessions exist), prefer an open
 * session after the latest completed session rather than a stale historical
 * Session 1 prepared/planned row.
 */
export function getSessionForPrepare(sessions: Session[]): Session | undefined {
  const preparePriority: Record<SessionStatus, number> = {
    in_progress: 0,
    paused: 0,
    prepared: 1,
    planned: 2,
    awaiting_completion: 3,
    completed: 9,
  };

  const inFlight = sessions.filter(
    session => session.status === "in_progress" || session.status === "paused"
  );
  if (inFlight.length > 0) {
    return pickOpenSessionByPriority(inFlight, preparePriority);
  }

  const completedNumbers = sessions
    .filter(session => session.status === "completed")
    .map(session => session.sessionNumber)
    .filter(number => number > 0);
  const maxCompleted =
    completedNumbers.length > 0 ? Math.max(...completedNumbers) : 0;

  if (maxCompleted > 0) {
    const nextOpen = sessions.filter(
      session =>
        isOpenSessionStatus(session.status) &&
        session.sessionNumber > maxCompleted
    );
    if (nextOpen.length > 0) {
      return pickOpenSessionByPriority(nextOpen, preparePriority);
    }
    // Established relationship with no next open session — do not reopen a
    // stale historical prepared/planned row at or before the latest completed.
    const open = sessions.filter(session => isOpenSessionStatus(session.status));
    if (
      open.length > 0 &&
      open.every(session => session.sessionNumber <= maxCompleted)
    ) {
      return undefined;
    }
  }

  return pickOpenSessionByPriority(sessions, preparePriority);
}

export function previousCompletedSession(
  sessions: Session[],
  current: Pick<Session, "id" | "sessionNumber">
): Session | undefined {
  return [...sessions]
    .filter(
      session =>
        session.id !== current.id &&
        (session.status === "completed" || session.aiSummaryApproved) &&
        session.sessionNumber < current.sessionNumber
    )
    .sort((a, b) => b.sessionNumber - a.sessionNumber)[0];
}

export function unresolvedActions(actions: CoachingAction[]): CoachingAction[] {
  return actions.filter(action => action.status !== "Complete");
}

export function unresolvedActionsForPreparation(
  client: Pick<Client, "actions">,
  sessionId?: string
): CoachingAction[] {
  return unresolvedActions(client.actions).filter(action => {
    if (!action.sessionId) return true;
    if (!sessionId) return true;
    return action.sessionId !== sessionId;
  });
}

/**
 * Temporally coherent open actions for Prepare Session N:
 * only unresolved actions originating from sessions before N.
 */
export function unresolvedActionsBeforeSession(
  client: Pick<Client, "actions" | "sessions">,
  current: Pick<Session, "id" | "sessionNumber">,
  options?: { allowUndatedOpenActions?: boolean }
): CoachingAction[] {
  const sessionNumbers = new Map(
    client.sessions.map(session => [session.id, session.sessionNumber] as const)
  );
  const allowUndated = options?.allowUndatedOpenActions !== false;
  return unresolvedActions(client.actions).filter(action => {
    if (action.sessionId === current.id) return false;
    const linked = action.sessionId?.trim() || "";
    if (!linked) return allowUndated;
    const number = sessionNumbers.get(linked);
    return typeof number === "number" && number < current.sessionNumber;
  });
}

export function hasPreparationContent(session: Session): boolean {
  if (
    [
      session.prepPurpose,
      session.prepTopics,
      session.prepQuestions,
      session.prepCommitmentsReview,
      session.prepRisks,
      session.prepPrivateNotes,
      session.preparation,
    ].some(value => value.trim().length > 0)
  ) {
    return true;
  }
  return hasPreparationAiContent(session.prepAiBrief);
}

export function preparationCompletionLabel(session: Session): string {
  return hasPreparationContent(session) ? "Preparation saved" : "Not started";
}

export function overviewPrimaryAction(session: Session): {
  label: string;
  stage: SessionWorkspaceStage;
  action?: "complete";
} {
  switch (session.status) {
    case "planned":
      return { label: "Open session brief", stage: "prepare" };
    case "prepared":
      return { label: "Start conversation", stage: "coach" };
    case "in_progress":
    case "paused":
      return { label: "Continue conversation", stage: "coach" };
    case "awaiting_completion":
      return { label: "Complete session", stage: "actions", action: "complete" };
    case "completed":
      return { label: "View session summary", stage: "summary" };
  }
}

export function canCompleteSession(session: Session): { ok: true } | { ok: false; reason: string } {
  if (
    session.status !== "awaiting_completion" &&
    session.status !== "in_progress" &&
    session.status !== "paused"
  ) {
    if (session.status === "completed") {
      return { ok: false, reason: "This development conversation is already completed." };
    }
    return { ok: false, reason: "Finish the live conversation before completing it." };
  }
  if (session.status === "in_progress" || session.status === "paused") {
    return { ok: false, reason: "Finish the live conversation before completing it." };
  }

  const hasLiveNotes = Boolean(session.notes.trim() && session.notesSavedAt);
  const hasDebrief = [
    session.reflectWhatShifted,
    session.reflectWhatSurprised,
    session.reflectWhatWorked,
    session.reflectDifferently,
    session.commitments,
    session.agreedActions,
  ].some(value => value.trim().length > 0);
  const hasSummary =
    session.summaryStatus === "approved" ||
    session.aiSummaryApproved ||
    session.summary.trim().length > 0;

  if (!hasLiveNotes && !hasDebrief && !hasSummary) {
    return {
      ok: false,
      reason:
        "Capture a short debrief, commitment, or summary before completing this development conversation.",
    };
  }
  return { ok: true };
}

/** Optional intelligence review gate — not required for session completion. */
export function canEnterIntelligenceReview(session: Session): { ok: true } | { ok: false; reason: string } {
  if (session.status !== "awaiting_completion") {
    return { ok: false, reason: "Finish the live session before reviewing intelligence." };
  }
  if (!session.notes.trim() || !session.notesSavedAt) {
    return { ok: false, reason: "Save live notes before reviewing intelligence." };
  }
  return { ok: true };
}

export function buildPreparationText(session: Session): string {
  const purpose = extractVisibleCoachNotes(session.prepPurpose);
  const topics = extractVisibleCoachNotes(session.prepTopics);
  const questions = extractVisibleCoachNotes(session.prepQuestions);
  const commitments = extractVisibleCoachNotes(session.prepCommitmentsReview);
  const outcome = extractVisibleCoachNotes(session.prepRisks);
  const notes = extractVisibleCoachNotes(session.prepPrivateNotes);

  const blocks: string[] = [];
  if (purpose) blocks.push(`Purpose\n${purpose}`);
  if (topics) blocks.push(`Topics\n${topics}`);
  if (questions) blocks.push(`Questions\n${questions}`);
  if (commitments) blocks.push(`Previous commitments\n${commitments}`);
  if (outcome) blocks.push(`Desired outcome\n${outcome}`);
  if (notes) blocks.push(`Private notes\n${notes}`);
  return blocks.join("\n\n");
}

export function deriveSummaryStatus(session: Pick<Session, "summary" | "emergingThemes" | "agreedActions" | "aiSummaryApproved" | "summaryStatus">): SummaryStatus {
  if (session.summaryStatus === "approved" || session.aiSummaryApproved) return "approved";
  if (session.summaryStatus === "draft") return "draft";
  const hasContent = [session.summary, session.emergingThemes, session.agreedActions].some(
    value => value.trim().length > 0
  );
  return hasContent ? "draft" : "not_generated";
}
