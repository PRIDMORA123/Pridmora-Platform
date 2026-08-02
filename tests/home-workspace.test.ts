import { describe, expect, it } from "vitest";
import {
  collectHomePriorityCandidates,
  getGreeting,
  resolveHomeWorkspaceViewModel,
} from "@/lib/home-workspace";
import type { Client, Session } from "@/lib/types";

function baseSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    clientId: "client-1",
    coachId: "coach-1",
    sessionNumber: 1,
    title: "",
    date: "2026-07-20",
    time: "10:00",
    durationMinutes: 60,
    location: "",
    status: "planned",
    focus: "",
    preparation: "",
    prepPurpose: "",
    prepTopics: "",
    prepQuestions: "",
    prepCommitmentsReview: "",
    prepRisks: "",
    prepPrivateNotes: "",
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
    lastUpdated: "2026-07-20T10:00:00.000Z",
    ...overrides,
  };
}

function baseClient(overrides: Partial<Client> = {}): Client {
  return {
    id: "client-1",
    name: "ID-010 Test Client",
    initials: "TC",
    organisation: "Test Org",
    role: "Test Role",
    email: "",
    status: "Active",
    nextSession: "",
    currentFocus: "Strengthen leadership presence",
    identitySummary: "",
    coachInsight: "",
    preparationStyleOverride: null,
    strengths: [],
    values: [],
    themes: [],
    goals: [],
    actions: [],
    quotes: [],
    sessions: [baseSession()],
    journey: [],
    ...overrides,
  };
}

describe("home workspace view model", () => {
  it("returns a time-based greeting without hard-coding morning", () => {
    const greeting = getGreeting();
    expect(["Good morning", "Good afternoon", "Good evening"]).toContain(greeting);
  });

  it("prioritises in-progress conversation over preparation", () => {
    const clients = [
      baseClient({
        id: "a",
        name: "Prep Person",
        sessions: [baseSession({ id: "s-prep", status: "planned" })],
      }),
      baseClient({
        id: "b",
        name: "Live Person",
        sessions: [baseSession({ id: "s-live", status: "in_progress", clientId: "b" })],
      }),
    ];

    const candidates = collectHomePriorityCandidates(clients);
    expect(candidates[0]?.personName).toBe("Live Person");
    expect(candidates[0]?.actionKind).toBe("continue_conversation");
  });

  it("builds a next best action for relationships ready for preparation", () => {
    const vm = resolveHomeWorkspaceViewModel({
      clients: [baseClient()],
      coachName: "Barry",
    });

    expect(vm.emptyKind).toBe("none");
    expect(vm.nextBestAction?.title).toMatch(/Prepare for the next development conversation/i);
    expect(vm.nextBestAction?.actionLabel).toBe("Prepare conversation");
    expect(vm.overview.activeRelationships).toBe(1);
    expect(vm.overview.awaitingPreparation).toBe(1);
    expect(vm.relationships).toHaveLength(1);
    expect(vm.relationships[0]?.stage).toBeTruthy();
  });

  it("surfaces an up-to-date state when no immediate action exists", () => {
    const vm = resolveHomeWorkspaceViewModel({
      clients: [
        baseClient({
          sessions: [
            baseSession({
              status: "completed",
              summaryStatus: "approved",
              aiSummaryApproved: true,
              completedAt: "2026-07-01T10:00:00.000Z",
              professionalIdentityDevelopment:
                "Growing confidence in senior stakeholder conversations.",
            }),
          ],
        }),
      ],
      coachName: "Barry",
    });

    expect(vm.nextBestAction).toBeNull();
    expect(vm.emptyKind).toBe("up_to_date");
    expect(vm.workspaceSummary).toMatch(/up to date/i);
    expect(vm.recentDevelopment[0]?.change).toMatch(/Growing confidence/i);
  });

  it("limits conversations in progress and relationships on the homepage", () => {
    const clients = Array.from({ length: 6 }, (_, index) =>
      baseClient({
        id: `client-${index}`,
        name: `Person ${index}`,
        sessions: [
          baseSession({
            id: `session-${index}`,
            clientId: `client-${index}`,
            status: index < 4 ? "prepared" : "planned",
          }),
        ],
      })
    );

    const vm = resolveHomeWorkspaceViewModel({
      clients,
      coachName: "Barry",
    });

    expect(vm.conversationsInProgress).toHaveLength(3);
    expect(vm.overview.conversationsInProgress).toBe(4);
    expect(vm.relationships).toHaveLength(4);
  });

  it("returns onboarding empty state when there are no relationships", () => {
    const vm = resolveHomeWorkspaceViewModel({
      clients: [],
      coachName: "Barry",
    });

    expect(vm.emptyKind).toBe("no_relationships");
    expect(vm.nextBestAction?.actionKind).toBe("create_person");
  });
});
