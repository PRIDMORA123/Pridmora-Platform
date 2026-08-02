import type { Client } from "@/lib/types";
import { isClientArchived } from "@/lib/types";
import { getCoachingPurpose } from "@/lib/client-journey";
import { hasPreparationContent } from "@/lib/session-workflow";

export type OnboardingStage =
  | "welcome"
  | "create_person"
  | "define_purpose"
  | "prepare"
  | "complete";

export type OnboardingInputs = {
  personCount: number;
  peopleWithPurposeCount: number;
  preparationCount: number;
};

export function resolveOnboardingStage({
  personCount,
  peopleWithPurposeCount,
  preparationCount,
}: OnboardingInputs): OnboardingStage {
  if (personCount === 0) return "welcome";
  if (peopleWithPurposeCount === 0) return "define_purpose";
  if (preparationCount === 0) return "prepare";
  return "complete";
}

function clientHasPreparation(client: Client): boolean {
  return client.sessions.some(
    session =>
      hasPreparationContent(session) ||
      session.status === "prepared" ||
      session.status === "in_progress" ||
      session.status === "awaiting_completion" ||
      session.status === "completed" ||
      Boolean(session.prepAiBriefConfirmedAt?.trim())
  );
}

/** Derive onboarding progress from live coaching workflow data. */
export function onboardingInputsFromClients(clients: Client[]): OnboardingInputs {
  const active = clients.filter(client => !isClientArchived(client));
  return {
    personCount: active.length,
    peopleWithPurposeCount: active.filter(client =>
      Boolean(getCoachingPurpose(client))
    ).length,
    preparationCount: active.filter(clientHasPreparation).length,
  };
}

export function resolveOnboardingStageFromClients(clients: Client[]): OnboardingStage {
  return resolveOnboardingStage(onboardingInputsFromClients(clients));
}

/** First active person useful for the current continue-onboarding step. */
export function onboardingFocusPerson(
  clients: Client[],
  stage: Exclude<OnboardingStage, "welcome" | "complete">
): Client | undefined {
  const active = clients.filter(client => !isClientArchived(client));

  if (stage === "create_person") return undefined;

  if (stage === "define_purpose") {
    return active.find(client => !getCoachingPurpose(client)) ?? active[0];
  }

  if (stage === "prepare") {
    return (
      active.find(
        client => getCoachingPurpose(client) && !clientHasPreparation(client)
      ) ?? active.find(client => getCoachingPurpose(client)) ?? active[0]
    );
  }

  return active[0];
}
