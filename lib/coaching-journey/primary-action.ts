import type { DevelopmentUpdate } from "@/lib/development-updates/types";
import {
  getCoachingPurpose,
  isSessionCompleted,
  pendingDevelopmentUpdate,
} from "@/lib/client-journey";
import {
  getFutureOrOpenSession,
  hasPreparationContent,
} from "@/lib/session-workflow";
import type { Client, Session } from "@/lib/types";
import type { CoachingJourneyStageId } from "@/lib/coaching-journey/coaching-journey";

export type RelationshipPrimaryActionKind =
  | "prepare_session"
  | "continue_session_notes"
  | "review_summary_insights"
  | "view_development"
  | "schedule_conversation"
  | "start_conversation"
  | "approve_summary"
  | "none";

export type RelationshipPrimaryAction = {
  kind: RelationshipPrimaryActionKind;
  label: string;
  stage: CoachingJourneyStageId;
  sessionId?: string;
  updateId?: string;
};

function sessionsChronological(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => a.sessionNumber - b.sessionNumber);
}

function hasNotesEvidence(session: Session): boolean {
  return [
    session.notes,
    session.reflectWhatShifted,
    session.reflectWhatSurprised,
    session.reflectWhatWorked,
    session.commitments,
    session.agreedActions,
  ].some(value => value.trim().length > 0);
}

function summaryOutstanding(session: Session): boolean {
  if (session.summaryStatus === "approved" || session.aiSummaryApproved) {
    return false;
  }
  return (
    session.status === "awaiting_completion" ||
    session.status === "completed" ||
    hasNotesEvidence(session) ||
    session.summaryStatus === "draft" ||
    Boolean(session.summary.trim())
  );
}

/**
 * One dominant next action for Current Position and related surfaces.
 */
export function getRelationshipPrimaryAction(input: {
  relationship: Pick<Client, "currentFocus" | "sessions" | "status">;
  currentSession?: Session | null;
  updates?: DevelopmentUpdate[];
}): RelationshipPrimaryAction | null {
  const { relationship } = input;
  if (relationship.status === "Archived") return null;

  const sessions = relationship.sessions;
  const inProgress =
    input.currentSession &&
    (input.currentSession.status === "in_progress" ||
      input.currentSession.status === "paused")
      ? input.currentSession
      : sessions.find(
          session =>
            session.status === "in_progress" || session.status === "paused"
        );

  if (inProgress) {
    return {
      kind: "continue_session_notes",
      label: "Continue conversation",
      stage: "session_notes",
      sessionId: inProgress.id,
    };
  }

  const awaitingCandidates = sessionsChronological(sessions).filter(
    session => session.status === "awaiting_completion"
  );
  const awaiting =
    input.currentSession?.status === "awaiting_completion"
      ? input.currentSession
      : awaitingCandidates[awaitingCandidates.length - 1];
  if (awaiting) {
    if (summaryOutstanding(awaiting) && hasNotesEvidence(awaiting)) {
      if (
        awaiting.summaryStatus === "draft" ||
        awaiting.summary.trim() ||
        awaiting.summaryStatus === "approved"
      ) {
        return {
          kind: "review_summary_insights",
          label: "Review Summary & Insights",
          stage: "summary_insights",
          sessionId: awaiting.id,
        };
      }
      // Notes saved — Summary & Insights is optional but available now.
      return {
        kind: "review_summary_insights",
        label: "Create Summary & Insights",
        stage: "summary_insights",
        sessionId: awaiting.id,
      };
    }
    return {
      kind: "continue_session_notes",
      label: "Capture session notes",
      stage: "session_notes",
      sessionId: awaiting.id,
    };
  }

  const completed = sessionsChronological(sessions).filter(isSessionCompleted);
  const mostRecent = completed[completed.length - 1];
  if (
    mostRecent &&
    summaryOutstanding(mostRecent) &&
    (hasNotesEvidence(mostRecent) || mostRecent.summaryStatus === "draft")
  ) {
    return {
      kind: "review_summary_insights",
      label: "Review Summary & Insights",
      stage: "summary_insights",
      sessionId: mostRecent.id,
    };
  }

  const pending = pendingDevelopmentUpdate(input.updates ?? []);
  if (pending) {
    return {
      kind: "view_development",
      label: "View Development",
      stage: "development",
      updateId: pending.id,
    };
  }

  const future =
    input.currentSession &&
    (input.currentSession.status === "planned" ||
      input.currentSession.status === "prepared")
      ? input.currentSession
      : getFutureOrOpenSession(sessions);

  if (future && (future.status === "planned" || future.status === "prepared")) {
    if (future.status === "prepared") {
      return {
        kind: "start_conversation",
        label: "Start conversation",
        stage: "prepare",
        sessionId: future.id,
      };
    }
    if (hasPreparationContent(future)) {
      return {
        kind: "prepare_session",
        label: "Continue preparation",
        stage: "prepare",
        sessionId: future.id,
      };
    }
    return {
      kind: "prepare_session",
      label: "Prepare conversation",
      stage: "prepare",
      sessionId: future.id,
    };
  }

  if (!getCoachingPurpose(relationship) && sessions.length === 0) {
    return {
      kind: "schedule_conversation",
      label: "Plan next conversation",
      stage: "current_position",
    };
  }

  if (sessions.length === 0 || !future) {
    return {
      kind: "schedule_conversation",
      label: "Plan next conversation",
      stage: "current_position",
    };
  }

  return {
    kind: "view_development",
    label: "View Development",
    stage: "development",
  };
}
