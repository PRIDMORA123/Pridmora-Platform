import type {
  CoachingJourneyStageId,
  CoachingJourneyStageState,
} from "@/lib/coaching-journey/coaching-journey";
import { COACHING_JOURNEY_STAGE_IDS } from "@/lib/coaching-journey/coaching-journey";
import { hasPreparationContent } from "@/lib/session-workflow";
import type { Client, Session } from "@/lib/types";

/**
 * Persisted evidence used to derive journey stage availability.
 * Completion is never inferred from page visits alone.
 */
export type CoachingJourneyEvidence = {
  relationshipExists: boolean;
  activeSessionExists: boolean;
  preparationExists: boolean;
  conversationStarted: boolean;
  sessionNotesExist: boolean;
  summaryExists: boolean;
  summaryApproved: boolean;
  developmentEvidenceExists: boolean;
  reportsAvailable: boolean;
};

export function buildCoachingJourneyEvidence(
  client: Pick<Client, "id" | "sessions" | "identitySummary" | "themes" | "goals"> | null | undefined,
  options?: {
    reportsAvailable?: boolean;
    activeSession?: Session | null;
  }
): CoachingJourneyEvidence {
  if (!client) {
    return {
      relationshipExists: false,
      activeSessionExists: false,
      preparationExists: false,
      conversationStarted: false,
      sessionNotesExist: false,
      summaryExists: false,
      summaryApproved: false,
      developmentEvidenceExists: false,
      reportsAvailable: false,
    };
  }

  const sessions = client.sessions ?? [];
  const active =
    options?.activeSession ??
    sessions.find(
      session =>
        session.status === "planned" ||
        session.status === "prepared" ||
        session.status === "in_progress" ||
        session.status === "paused" ||
        session.status === "awaiting_completion"
    ) ??
    sessions.find(session => session.status === "completed") ??
    null;

  const notesSession =
    sessions.find(
      session =>
        session.status === "awaiting_completion" ||
        session.status === "in_progress" ||
        session.status === "paused"
    ) ?? active;

  const sessionNotesExist = Boolean(
    notesSession &&
      [
        notesSession.notes,
        notesSession.reflectWhatShifted,
        notesSession.reflectWhatSurprised,
        notesSession.reflectWhatWorked,
        notesSession.commitments,
        notesSession.agreedActions,
      ].some(value => value.trim().length > 0)
  );

  const summarySession =
    sessions.find(
      session =>
        session.summaryStatus === "draft" ||
        session.summaryStatus === "approved" ||
        session.summary.trim().length > 0
    ) ?? notesSession;

  return {
    relationshipExists: Boolean(client.id),
    activeSessionExists: sessions.length > 0,
    preparationExists: Boolean(active && hasPreparationContent(active)),
    conversationStarted: Boolean(
      active &&
        (active.sessionStartedAt ||
          active.status === "in_progress" ||
          active.status === "paused" ||
          active.status === "awaiting_completion" ||
          active.status === "completed")
    ),
    sessionNotesExist,
    summaryExists: Boolean(
      summarySession &&
        (summarySession.summary.trim() ||
          summarySession.summaryStatus !== "not_generated")
    ),
    summaryApproved: Boolean(
      summarySession &&
        (summarySession.summaryStatus === "approved" ||
          summarySession.aiSummaryApproved)
    ),
    developmentEvidenceExists: Boolean(
      client.identitySummary?.trim() ||
        client.themes?.length ||
        client.goals?.length ||
        sessions.some(
          session =>
            session.summaryStatus === "approved" || session.aiSummaryApproved
        )
    ),
    reportsAvailable:
      options?.reportsAvailable ??
      sessions.some(
        session =>
          session.summaryStatus === "approved" ||
          session.aiSummaryApproved ||
          session.status === "completed"
      ),
  };
}

export function deriveCoachingJourneyState(
  stageId: CoachingJourneyStageId,
  evidence: CoachingJourneyEvidence,
  currentStage: CoachingJourneyStageId
): CoachingJourneyStageState {
  if (stageId === currentStage) {
    return "current";
  }

  switch (stageId) {
    case "current_position":
      return evidence.relationshipExists ? "completed" : "unavailable";

    case "prepare":
      if (!evidence.activeSessionExists) {
        return "unavailable";
      }
      return evidence.preparationExists || evidence.conversationStarted
        ? "completed"
        : "available";

    case "session_notes":
      if (!evidence.activeSessionExists) {
        return "unavailable";
      }
      return evidence.sessionNotesExist ? "completed" : "available";

    case "summary_insights":
      if (!evidence.sessionNotesExist && !evidence.summaryExists) {
        return evidence.activeSessionExists ? "optional" : "unavailable";
      }
      return evidence.summaryApproved ? "completed" : "optional";

    case "development":
      return evidence.relationshipExists ? "available" : "unavailable";

    case "reports":
      return evidence.reportsAvailable ? "available" : "unavailable";

    default: {
      const exhaustiveCheck: never = stageId;
      return exhaustiveCheck;
    }
  }
}

export function deriveAllCoachingJourneyStates(
  evidence: CoachingJourneyEvidence,
  currentStage: CoachingJourneyStageId
): Record<CoachingJourneyStageId, CoachingJourneyStageState> {
  return COACHING_JOURNEY_STAGE_IDS.reduce(
    (acc, stageId) => {
      acc[stageId] = deriveCoachingJourneyState(stageId, evidence, currentStage);
      return acc;
    },
    {} as Record<CoachingJourneyStageId, CoachingJourneyStageState>
  );
}
