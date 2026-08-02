import type { Client } from "@/lib/types";
import type { DevelopmentUpdate } from "@/lib/development-updates/types";
import type { JourneyStep } from "@/components/identity/journey-path";
import {
  buildClientJourneySnapshot,
  getCoachingPurpose,
  pendingDevelopmentUpdate,
} from "@/lib/client-journey";
import { getFutureOrOpenSession, hasPreparationContent } from "@/lib/session-workflow";
import { coachingStageLabels } from "@/lib/identity-language";

/**
 * Map real coaching workflow state onto the restrained Identity Path steps.
 * Does not invent progress — steps stay upcoming until evidence exists.
 */
export function buildIdentityJourneyPath(
  client: Client,
  updates: DevelopmentUpdate[] = []
): JourneyStep[] {
  const journey = buildClientJourneySnapshot(client, updates);
  const purposeAgreed = Boolean(getCoachingPurpose(client));
  const hasConversations = journey.completedSessionCount > 0;
  const hasReflection =
    journey.completedSessions.some(
      session =>
        Boolean(session.coachReflection?.trim()) ||
        Boolean(session.reflectWhatShifted?.trim()) ||
        Boolean(session.reflectWhatSurprised?.trim()) ||
        session.summaryStatus === "approved" ||
        session.aiSummaryApproved
    ) || Boolean(pendingDevelopmentUpdate(updates));
  const hasPatterns =
    updates.some(update => update.status === "applied") ||
    Boolean(client.identitySummary?.trim()) ||
    Boolean(client.coachInsight?.trim());
  const sustained =
    journey.stage.id === "journey_completed" ||
    (hasPatterns && journey.completedSessionCount >= 3);

  const future = getFutureOrOpenSession(client.sessions);
  const preparing = future
    ? future.status === "planned" ||
      future.status === "prepared" ||
      future.status === "in_progress" ||
      future.status === "paused" ||
      hasPreparationContent(future)
    : false;

  function statusFor(reached: boolean, current: boolean): JourneyStep["status"] {
    if (reached && !current) return "complete";
    if (current) return "current";
    return "upcoming";
  }

  let currentIndex = 0;
  if (!purposeAgreed) currentIndex = 0;
  else if (!hasConversations) currentIndex = preparing ? 1 : 1;
  else if (!hasReflection) currentIndex = 2;
  else if (!hasPatterns) currentIndex = 3;
  else if (!sustained) currentIndex = 4;
  else currentIndex = 4;

  const definitions: Array<{ id: string; label: string; description: string; reached: boolean }> =
    [
      {
        id: "purpose",
        label: "Purpose agreed",
        description: "The coaching purpose that gives this relationship direction.",
        reached: purposeAgreed,
      },
      {
        id: "conversations",
        label: "Development conversations",
        description: "Live coaching conversations that generate evidence.",
        reached: hasConversations,
      },
      {
        id: "reflection",
        label: "Reflection and application",
        description: "What stood out and what should carry forward.",
        reached: hasReflection,
      },
      {
        id: "patterns",
        label: "Emerging patterns",
        description: "Strengths, themes and development focus across conversations.",
        reached: hasPatterns,
      },
      {
        id: "change",
        label: "Sustained change",
        description: "Development that holds beyond a single conversation.",
        reached: sustained,
      },
    ];

  return definitions.map((step, index) => ({
    id: step.id,
    label: step.label,
    description: step.description,
    status: statusFor(step.reached, index === currentIndex && !sustained),
  }));
}

export function coachingStatusLabel(client: Client, updates: DevelopmentUpdate[] = []): string {
  const journey = buildClientJourneySnapshot(client, updates);
  const pending = pendingDevelopmentUpdate(updates);
  const future = getFutureOrOpenSession(client.sessions);

  if (journey.stage.id === "journey_completed") {
    return coachingStageLabels.relationshipComplete;
  }
  if (pending) return coachingStageLabels.developmentUpdateAvailable;
  if (future?.status === "awaiting_completion") {
    return coachingStageLabels.readyForReflection;
  }
  if (future?.status === "in_progress") {
    return coachingStageLabels.conversationInProgress;
  }
  if (future?.status === "prepared") {
    return coachingStageLabels.readyForConversation;
  }
  if (future?.status === "planned") {
    return hasPreparationContent(future)
      ? coachingStageLabels.preparationInProgress
      : coachingStageLabels.readyForPreparation;
  }
  if (!getCoachingPurpose(client)) return coachingStageLabels.purposeRequired;
  return journey.stage.label;
}
