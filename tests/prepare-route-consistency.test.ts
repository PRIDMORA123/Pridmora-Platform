import { describe, expect, it } from "vitest";
import { getPrepareRoute, isPrepareView, PREPARE_VIEW } from "@/lib/prepare-route";
import {
  buildPreparationWorkspaceViewModel,
  preparationPrimaryActionLabel,
} from "@/lib/preparation-workspace";
import type { Client, Session } from "@/lib/types";
import { EMPTY_PREPARATION_AI_BRIEF } from "@/lib/preparation-brief";

function person(partial: Partial<Client> = {}): Client {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Sarah Example",
    initials: "SE",
    organisation: "Acme",
    role: "Director",
    email: "sarah@example.com",
    status: "Active",
    nextSession: "Not scheduled",
    currentFocus: "Delegation",
    identitySummary: "",
    coachInsight: "",
    preparationStyleOverride: null,
    strengths: [],
    values: [],
    themes: [],
    goals: [],
    actions: [],
    quotes: [],
    sessions: [],
    journey: [],
    createdAt: "2026-07-01T10:00:00.000Z",
    ...partial,
  };
}

function prepSession(partial: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    clientId: person().id,
    coachId: "coach-1",
    sessionNumber: 2,
    status: "planned",
    title: "",
    date: "2026-07-28",
    time: "10:00",
    durationMinutes: 60,
    location: "",
    focus: "Delegation",
    preparation: "",
    prepPurpose: "",
    prepTopics: "",
    prepQuestions: "",
    prepCommitmentsReview: "",
    prepRisks: "",
    prepPrivateNotes: "Remember to check workload pressure.",
    prepAiBrief: null,
    prepAiBriefGeneratedAt: "",
    prepAiBriefStyle: "",
    prepAiBriefConfirmedAt: "",
    prepAiBriefSourceFingerprint: "",
    intelligenceMode: "",
    intelligenceStatus: "idle",
    intelligenceSources: [],
    intelligenceLastRefreshedAt: "",
    intelligenceErrorCode: "",
    notes: "",
    commitments: "",
    parkingLot: "",
    notesSavedAt: "",
    timerElapsedSeconds: 0,
    timerStartedAt: null,
    sessionStartedAt: null,
    reflection: "",
    reflectWhatShifted: "",
    reflectWhatSurprised: "",
    reflectWhatWorked: "",
    reflectDifferently: "",
    reflectProfessionalLearning: "",
    reflectPrivate: "",
    summary: "",
    emergingThemes: "",
    strengthsObserved: "",
    valuesBecomingVisible: "",
    professionalIdentityDevelopment: "",
    agreedActions: "",
    outcomes: "",
    suggestedFocus: "",
    coachReflection: "",
    summaryStatus: "not_generated",
    aiSummaryApproved: false,
    coachingQuestions: [],
    completedAt: "",
    lastUpdated: "",
    ...partial,
  };
}

const ENTRY_POINTS = [
  "Home priority item",
  "Home upcoming conversation",
  "People list",
  "Current Position primary action",
  "Client Prepare navigation tab",
  "Browser refresh while on Prepare",
  "Direct canonical URL",
] as const;

describe("canonical Prepare route", () => {
  it("returns one Prepare destination for a person", () => {
    const route = getPrepareRoute("11111111-1111-4111-8111-111111111111");
    expect(route.view).toBe(PREPARE_VIEW);
    expect(route.personId).toBe("11111111-1111-4111-8111-111111111111");
    expect(route.path).toBe(
      "/people/11111111-1111-4111-8111-111111111111/prepare"
    );
    expect(isPrepareView(route.view)).toBe(true);
  });

  it.each(ENTRY_POINTS)(
    "keeps the same canonical destination from %s",
    () => {
      const personId = "11111111-1111-4111-8111-111111111111";
      const fromHome = getPrepareRoute(personId);
      const fromProfile = getPrepareRoute(personId);
      expect(fromHome).toEqual(fromProfile);
      expect(fromHome.view).toBe("prepare");
    }
  );
});

describe("shared preparation workspace view model", () => {
  it("resolves Assisted support copy and create-brief state when no brief exists", () => {
    const model = buildPreparationWorkspaceViewModel({
      person: person(),
      session: prepSession(),
      coachPreparationStyle: "guided",
    });

    expect(model.effectiveApproach).toBe("guided");
    expect(model.displayApproach).toBe("Assisted");
    expect(model.aiSupportAvailable).toBe(true);
    expect(model.aiSectionsPresent).toBe(false);
    expect(model.generationStatus).toBe("not_generated");
    expect(model.nextAction).toBe("create_brief");
    expect(model.supportTitle).toBe("Assisted Brief");
    expect(model.supportDescription).toContain("proposes themes");
    expect(model.statusHeadline).toBe("Preparation support is ready.");
    expect(preparationPrimaryActionLabel(model.nextAction)).toBe(
      "Create Preparation Brief"
    );
  });

  it("hides proposed AI support for Manual", () => {
    const model = buildPreparationWorkspaceViewModel({
      person: person({ preparationStyleOverride: "minimal" }),
      session: prepSession(),
      coachPreparationStyle: "guided",
    });

    expect(model.effectiveApproach).toBe("minimal");
    expect(model.displayApproach).toBe("Manual");
    expect(model.aiSupportAvailable).toBe(false);
    expect(model.supportTitle).toBe("Manual Brief");
    expect(model.supportDescription).toContain("commitments and coach notes");
  });

  it("marks a current brief ready with proposed sections present", () => {
    const model = buildPreparationWorkspaceViewModel({
      person: person(),
      session: prepSession({
        prepAiBrief: {
          ...EMPTY_PREPARATION_AI_BRIEF,
          themes: [{ title: "Delegation under pressure", basis: "Recent summary" }],
          questions: ["What would make handing work on safer?"],
          reflectionPrompt: "Where does workload pressure pull you back in?",
        },
        prepAiBriefGeneratedAt: "2026-07-20T10:00:00.000Z",
        prepAiBriefStyle: "guided",
        prepAiBriefSourceFingerprint: "abc",
      }),
      coachPreparationStyle: "guided",
      currentFingerprint: "abc",
    });

    expect(model.briefExists).toBe(true);
    expect(model.aiSectionsPresent).toBe(true);
    expect(model.generationStatus).toBe("ready");
    expect(model.statusHeadline).toBe("Your Preparation Brief is current.");
    expect(model.nextAction).toBe("confirm_preparation");
  });

  it("keeps factual preparation available when AI is unavailable", () => {
    const model = buildPreparationWorkspaceViewModel({
      person: person(),
      session: prepSession(),
      coachPreparationStyle: "enhanced",
      aiUnavailable: true,
    });

    expect(model.displayApproach).toBe("Comprehensive");
    expect(model.generationStatus).toBe("unavailable");
    expect(model.statusHeadline).toBe(
      "Preparation support is temporarily unavailable."
    );
    expect(model.statusDetail).toContain("remain available below");
  });

  it("produces identical state for Home and profile entry inputs", () => {
    const input = {
      person: person({ preparationStyleOverride: "enhanced" as const }),
      session: prepSession({
        prepAiBrief: {
          ...EMPTY_PREPARATION_AI_BRIEF,
          patterns: [{ title: "Pressure returns tasks to self", basis: "Evidence" }],
          developmentDirection: "Build deliberate delegation habits.",
        },
        prepAiBriefGeneratedAt: "2026-07-21T09:00:00.000Z",
        prepAiBriefStyle: "enhanced",
        prepAiBriefSourceFingerprint: "fp-1",
        prepPrivateNotes: "Remember to check workload pressure.",
      }),
      coachPreparationStyle: "guided" as const,
      currentFingerprint: "fp-1",
    };

    const fromHome = buildPreparationWorkspaceViewModel(input);
    const fromProfile = buildPreparationWorkspaceViewModel(input);

    expect(fromHome).toEqual(fromProfile);
    expect(fromHome.effectiveApproach).toBe("enhanced");
    expect(fromHome.aiSectionsPresent).toBe(true);
    expect(fromHome.nextAction).toBe("confirm_preparation");
  });
});
