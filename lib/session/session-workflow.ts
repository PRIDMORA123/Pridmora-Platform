import { hasPreparationContent } from "@/lib/session-workflow";
import type { Session, SessionStatus } from "@/lib/types";

/**
 * Coach journey stages within one coherent session workspace.
 * Internal SPA stage ids remain mapped via workspaceStageFromWorkflow / workflowStageFromWorkspace.
 * Visible labels: Brief → Conversation → Debrief → Summary → Next Steps.
 */
export type SessionWorkflowStage =
  | "brief"
  | "live"
  | "debrief"
  | "summary"
  | "next_steps";

export type SessionStageAvailability =
  | "current"
  | "completed"
  | "available"
  | "unavailable";

export const SESSION_WORKFLOW_STAGES = [
  {
    id: "brief",
    label: "Session Brief",
    shortLabel: "Brief",
  },
  {
    id: "live",
    label: "Conversation",
    shortLabel: "Conversation",
  },
  {
    id: "debrief",
    label: "Session Debrief",
    shortLabel: "Debrief",
  },
  {
    id: "summary",
    label: "Session Summary",
    shortLabel: "Summary",
  },
  {
    id: "next_steps",
    label: "Next Steps",
    shortLabel: "Next Steps",
  },
] as const satisfies ReadonlyArray<{
  id: SessionWorkflowStage;
  label: string;
  shortLabel: string;
}>;

/** Existing SessionWorkspace stage ids — keep for SPA routing safety. */
export type WorkspaceStageId =
  | "overview"
  | "prepare"
  | "coach"
  | "reflect"
  | "summary"
  | "actions";

const WORKFLOW_TO_WORKSPACE: Record<SessionWorkflowStage, WorkspaceStageId> = {
  brief: "prepare",
  live: "coach",
  debrief: "reflect",
  summary: "summary",
  next_steps: "actions",
};

const WORKSPACE_TO_WORKFLOW: Partial<
  Record<WorkspaceStageId, SessionWorkflowStage>
> = {
  prepare: "brief",
  coach: "live",
  reflect: "debrief",
  summary: "summary",
  actions: "next_steps",
};

const DEFAULT_FORWARD: Record<SessionWorkflowStage, SessionWorkflowStage | null> =
  {
    brief: "live",
    live: "debrief",
    debrief: "summary",
    summary: "next_steps",
    next_steps: null,
  };

export function workspaceStageFromWorkflow(
  stage: SessionWorkflowStage
): WorkspaceStageId {
  return WORKFLOW_TO_WORKSPACE[stage];
}

export function workflowStageFromWorkspace(
  stage: WorkspaceStageId
): SessionWorkflowStage | null {
  return WORKSPACE_TO_WORKFLOW[stage] ?? null;
}

export function sessionWorkflowStageLabel(stage: SessionWorkflowStage): string {
  return (
    SESSION_WORKFLOW_STAGES.find(item => item.id === stage)?.label ?? stage
  );
}

export function nextWorkflowStage(
  stage: SessionWorkflowStage
): SessionWorkflowStage | null {
  return DEFAULT_FORWARD[stage];
}

/** Stage completion derived from saved session state — not route visits. */
export type SessionStageCompletion = Record<SessionWorkflowStage, boolean>;

export function hasDebriefEvidence(session: Session): boolean {
  return [
    session.reflectWhatShifted,
    session.reflectWhatSurprised,
    session.reflectWhatWorked,
    session.reflectDifferently,
    session.notes,
    session.commitments,
    session.agreedActions,
  ].some(value => value.trim().length > 0);
}

export function hasNextStepsEvidence(session: Session): boolean {
  return [
    session.agreedActions,
    session.commitments,
    session.suggestedFocus,
    session.outcomes,
  ].some(value => value.trim().length > 0);
}

/**
 * Active sessions still before or during conversation must not show later
 * stages as completed from stray evidence. Historical records may retain
 * evidence-based completion when the session has already progressed.
 */
function isPreConversationActive(session: Session): boolean {
  if (session.sessionStartedAt) return false;
  return session.status === "planned" || session.status === "prepared";
}

function isActiveConversation(session: Session): boolean {
  return session.status === "in_progress" || session.status === "paused";
}

/**
 * Historical / restored records: session completed or awaiting completion,
 * or an approved summary exists without normal progression metadata.
 * Stray debrief notes on a planned session alone are not historical.
 */
export function isHistoricalSessionRecord(session: Session): boolean {
  if (session.status === "completed") return true;
  if (session.status === "awaiting_completion") return true;
  if (
    (session.status === "planned" || session.status === "prepared") &&
    (session.summaryStatus === "approved" || session.aiSummaryApproved)
  ) {
    return true;
  }
  return false;
}

export function deriveSessionStageCompletion(
  session: Session,
  options?: { startedWithoutBrief?: boolean }
): SessionStageCompletion {
  // Active pre-conversation: only brief may be complete.
  if (
    isPreConversationActive(session) &&
    !options?.startedWithoutBrief &&
    !isHistoricalSessionRecord(session)
  ) {
    return {
      brief: hasPreparationContent(session),
      live: false,
      debrief: false,
      summary: false,
      next_steps: false,
    };
  }

  // Active conversation in progress: brief done, conversation current (not complete).
  if (isActiveConversation(session)) {
    return {
      brief: true,
      live: false,
      debrief: false,
      summary: false,
      next_steps: false,
    };
  }

  const briefComplete =
    hasPreparationContent(session) ||
    Boolean(options?.startedWithoutBrief) ||
    session.status === "in_progress" ||
    session.status === "paused" ||
    session.status === "awaiting_completion" ||
    session.status === "completed" ||
    Boolean(session.sessionStartedAt);

  const liveComplete =
    session.status === "awaiting_completion" ||
    session.status === "completed";

  let debriefComplete =
    hasDebriefEvidence(session) ||
    session.summaryStatus === "draft" ||
    session.summaryStatus === "approved" ||
    session.aiSummaryApproved;

  let summaryComplete =
    session.summaryStatus === "approved" || session.aiSummaryApproved;

  let nextStepsComplete =
    session.status === "completed" ||
    (summaryComplete && hasNextStepsEvidence(session));

  // Chronological gate for non-historical active flow: later stages cannot
  // complete before earlier stages unless this is a historical record.
  if (!isHistoricalSessionRecord(session)) {
    if (!liveComplete) {
      debriefComplete = false;
      summaryComplete = false;
      nextStepsComplete = false;
    } else if (!debriefComplete) {
      summaryComplete = false;
      nextStepsComplete = false;
    } else if (!summaryComplete) {
      nextStepsComplete = false;
    }
  } else {
    // Historical: still require prior completion flags when evidence is absent
    // for a stage, but allow reading stages that have saved content.
    if (!liveComplete && !stageHasHistoricalEvidence("live", session)) {
      // Keep evidence-based debrief/summary if present (restored records).
    } else if (!liveComplete) {
      // live evidence exists historically — treat live as complete for gating
    }
  }

  return {
    brief: briefComplete,
    live: liveComplete,
    debrief: debriefComplete,
    summary: summaryComplete,
    next_steps: nextStepsComplete,
  };
}

/**
 * Historical sessions with incomplete metadata must still open safely.
 * Availability allows reading completed or historically present stages
 * even when earlier completion flags are missing.
 *
 * For active normal sessions, never show a later stage as completed while
 * an earlier stage appears unstarted.
 */
export function getStageAvailability(
  stage: SessionWorkflowStage,
  currentStage: SessionWorkflowStage,
  completion: SessionStageCompletion,
  session: Session
): SessionStageAvailability {
  if (stage === currentStage) return "current";

  const stageIndex = SESSION_WORKFLOW_STAGES.findIndex(item => item.id === stage);
  const currentIndex = SESSION_WORKFLOW_STAGES.findIndex(
    item => item.id === currentStage
  );

  if (completion[stage]) {
    // Credible chronology: do not mark later stages completed while earlier
    // stages are incomplete, unless historical evidence justifies the bypass.
    const priorIncomplete = SESSION_WORKFLOW_STAGES.slice(0, stageIndex).some(
      item => !completion[item.id] && item.id !== currentStage
    );

    if (priorIncomplete && stageIndex > currentIndex) {
      if (
        isHistoricalSessionRecord(session) &&
        stageHasHistoricalEvidence(stage, session)
      ) {
        return "completed";
      }
      // Active session with out-of-order completion claim — hide as unavailable.
      return "unavailable";
    }

    return "completed";
  }

  // Allow backwards navigation to any earlier stage.
  if (stageIndex < currentIndex) return "available";

  // Historical / partial records: if evidence exists for this stage, allow access.
  if (
    isHistoricalSessionRecord(session) &&
    stageHasHistoricalEvidence(stage, session)
  ) {
    return "available";
  }

  // Forward transition: previous stage must be complete, or session already progressed.
  const previous = SESSION_WORKFLOW_STAGES[stageIndex - 1];
  if (!previous) return "available";

  if (completion[previous.id]) return "available";

  // Conversation may be entered when starting from brief without saved prep
  // (coach deliberately starts). Callers should set startedWithoutBrief.
  if (stage === "live" && (completion.brief || session.status !== "planned")) {
    return "available";
  }

  // Summary & Insights: after the conversation has ended, allow entry when
  // notes exist even before a draft is generated (or after skip).
  if (
    stage === "summary" &&
    completion.live &&
    hasDebriefEvidence(session)
  ) {
    return "available";
  }

  // Summary accessible when any summary content already exists (historical).
  if (
    stage === "summary" &&
    isHistoricalSessionRecord(session) &&
    (session.summary.trim() ||
      session.emergingThemes.trim() ||
      session.summaryStatus !== "not_generated")
  ) {
    return "available";
  }

  // Next steps when summary approved or session completed / has commitments.
  if (
    stage === "next_steps" &&
    (completion.summary ||
      session.status === "completed" ||
      hasNextStepsEvidence(session))
  ) {
    return "available";
  }

  return "unavailable";
}

function stageHasHistoricalEvidence(
  stage: SessionWorkflowStage,
  session: Session
): boolean {
  switch (stage) {
    case "brief":
      return hasPreparationContent(session);
    case "live":
      return Boolean(
        session.sessionStartedAt ||
          session.notes.trim() ||
          session.status === "in_progress" ||
          session.status === "paused" ||
          session.status === "awaiting_completion" ||
          session.status === "completed"
      );
    case "debrief":
      return hasDebriefEvidence(session);
    case "summary":
      return (
        session.summary.trim().length > 0 ||
        session.summaryStatus !== "not_generated" ||
        session.aiSummaryApproved
      );
    case "next_steps":
      return hasNextStepsEvidence(session) || session.status === "completed";
  }
}

export function unavailableStageExplanation(
  stage: SessionWorkflowStage
): string {
  switch (stage) {
    case "brief":
      return "Open the session brief to prepare for this conversation.";
    case "live":
      return "Complete or start from the session brief before entering the conversation.";
    case "debrief":
      return "End the conversation before capturing the session debrief.";
    case "summary":
      return "Session notes are needed before Summary & Insights can be created.";
    case "next_steps":
      return "Approve the session summary before confirming next steps.";
  }
}

export function canTransitionToStage(
  from: SessionWorkflowStage,
  to: SessionWorkflowStage,
  completion: SessionStageCompletion,
  session: Session
): { ok: true } | { ok: false; reason: string } {
  if (from === to) return { ok: true };

  const availability = getStageAvailability(to, from, completion, session);
  if (availability === "unavailable") {
    return { ok: false, reason: unavailableStageExplanation(to) };
  }
  return { ok: true };
}

/** Sensible default stage from persisted session status. */
export function deriveCurrentWorkflowStage(
  session: Session
): SessionWorkflowStage {
  switch (session.status as SessionStatus) {
    case "in_progress":
    case "paused":
      return "live";
    case "awaiting_completion":
      if (
        session.summaryStatus === "approved" ||
        session.aiSummaryApproved
      ) {
        return "next_steps";
      }
      if (
        session.summary.trim() ||
        session.summaryStatus === "draft"
      ) {
        return "summary";
      }
      return "debrief";
    case "completed":
      // Completed conversations open on the session record (Summary & Insights),
      // matching overviewPrimaryAction — not Next Steps ("Carry forward…").
      return "summary";
    case "prepared":
      return "brief";
    case "planned":
    default:
      return "brief";
  }
}

export function nextLogicalActionLabel(
  stage: SessionWorkflowStage,
  completion: SessionStageCompletion,
  session: Session
): string {
  if (session.status === "completed") {
    return "Return to journey";
  }

  switch (stage) {
    case "brief":
      return "Start conversation";
    case "live":
      return session.status === "awaiting_completion"
        ? "Continue to debrief"
        : "End conversation";
    case "debrief":
      return completion.debrief || hasDebriefEvidence(session)
        ? "Create session summary"
        : "Capture the session";
    case "summary":
      return completion.summary ? "Continue to next steps" : "Approve summary";
    case "next_steps":
      return "Complete conversation";
  }
}
