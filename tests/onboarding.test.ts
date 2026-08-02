import { describe, expect, it } from "vitest";
import {
  onboardingFocusPerson,
  onboardingInputsFromClients,
  resolveOnboardingStage,
  resolveOnboardingStageFromClients,
} from "@/lib/onboarding";
import {
  pilotClientA,
  pilotClientB,
  pilotClientF,
  pilotFixtures,
} from "@/lib/pilot-fixtures";
import type { Client } from "@/lib/types";
import { coachingStageLabels, identityLanguage, identityMessages } from "@/lib/identity-language";
import { coachingStatusLabel } from "@/lib/identity-journey-path";
import { overviewPrimaryAction } from "@/lib/session-workflow";

describe("resolveOnboardingStage", () => {
  it("returns welcome when there are no people", () => {
    expect(
      resolveOnboardingStage({
        personCount: 0,
        peopleWithPurposeCount: 0,
        preparationCount: 0,
      })
    ).toBe("welcome");
  });

  it("returns define_purpose when people exist without purpose", () => {
    expect(
      resolveOnboardingStage({
        personCount: 1,
        peopleWithPurposeCount: 0,
        preparationCount: 0,
      })
    ).toBe("define_purpose");
  });

  it("returns prepare when purpose exists but preparation does not", () => {
    expect(
      resolveOnboardingStage({
        personCount: 1,
        peopleWithPurposeCount: 1,
        preparationCount: 0,
      })
    ).toBe("prepare");
  });

  it("returns complete when preparation exists", () => {
    expect(
      resolveOnboardingStage({
        personCount: 2,
        peopleWithPurposeCount: 2,
        preparationCount: 1,
      })
    ).toBe("complete");
  });
});

describe("onboarding from live client data", () => {
  it("treats an empty practice as welcome", () => {
    expect(resolveOnboardingStageFromClients([])).toBe("welcome");
  });

  it("moves a purpose-only relationship to prepare", () => {
    const client: Client = {
      ...pilotClientA,
      sessions: [
        {
          ...pilotClientA.sessions[0],
          preparation: "",
          prepPurpose: "",
          prepTopics: "",
          prepQuestions: "",
          prepCommitmentsReview: "",
          prepRisks: "",
          prepPrivateNotes: "",
          prepAiBriefConfirmedAt: "",
          status: "planned",
        },
      ],
    };
    expect(resolveOnboardingStageFromClients([client])).toBe("prepare");
    expect(onboardingFocusPerson([client], "prepare")?.id).toBe(client.id);
  });

  it("completes onboarding once preparation exists", () => {
    expect(resolveOnboardingStageFromClients([pilotClientB])).toBe("complete");
    expect(onboardingInputsFromClients([pilotClientB]).preparationCount).toBe(1);
  });

  it("ignores archived relationships for onboarding progress", () => {
    const archived: Client = { ...pilotClientA, status: "Archived" };
    expect(resolveOnboardingStageFromClients([archived])).toBe("welcome");
  });
});

describe("pilot fixtures", () => {
  it("provides the six representative pilot personas", () => {
    expect(pilotFixtures).toHaveLength(6);
    expect(pilotClientA.currentFocus.trim().length).toBeGreaterThan(0);
    expect(pilotClientB.sessions[0]?.status).toBe("prepared");
    expect(pilotClientF.sessions.filter(session => session.status === "completed")).toHaveLength(
      3
    );
  });
});

describe("identity language", () => {
  it("exposes calm coaching terminology", () => {
    expect(identityLanguage.conversation.singular).toBe("development conversation");
    expect(identityLanguage.preparation.update).toBe("Update Preparation Brief");
    expect(identityMessages.conversationCompleted).toContain("Reflection can now begin");
    expect(coachingStageLabels.betweenConversations).toBe(
      "Reflecting between conversations"
    );
  });

  it("surfaces standard stage labels for prepared and planned relationships", () => {
    expect(coachingStatusLabel(pilotClientA)).toBe(coachingStageLabels.readyForPreparation);
    expect(coachingStatusLabel(pilotClientB)).toBe(
      coachingStageLabels.readyForConversation
    );
    expect(overviewPrimaryAction(pilotClientB.sessions[0]!).label).toBe(
      "Start conversation"
    );
  });
});
