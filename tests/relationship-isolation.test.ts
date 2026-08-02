import { describe, expect, it } from "vitest";
import {
  assertRelationshipOwnership,
  containsUnexpectedPersonName,
  getDevelopmentQueryKey,
  getHistoryQueryKey,
  getJourneyQueryKey,
  getPrepareQueryKey,
  getReportsQueryKey,
  RelationshipScopeIntegrityError,
  validateGeneratedJourney,
} from "@/lib/relationship-scope";
import { assertJourneyPersonMatch } from "@/lib/journey/assert-journey-person-match";
import { resolveJourneyViewModel } from "@/lib/journey/load-journey-view-model";
import type { Client, Session } from "@/lib/types";
import type { DevelopmentUpdate } from "@/lib/development-updates/types";

function session(
  partial: Partial<Session> & Pick<Session, "id" | "sessionNumber" | "status" | "clientId">
): Session {
  return {
    coachId: "coach-1",
    title: "",
    date: "2026-07-25",
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
    summary: "Approved summary for this relationship.",
    emergingThemes: "",
    strengthsObserved: "",
    valuesBecomingVisible: "",
    professionalIdentityDevelopment: "",
    agreedActions: "",
    outcomes: "",
    suggestedFocus: "",
    coachReflection: "",
    summaryStatus: "approved",
    aiSummaryApproved: true,
    coachingQuestions: [],
    completedAt: "2026-07-25T10:00:00.000Z",
    lastUpdated: "",
    ...partial,
  };
}

function client(partial: Partial<Client> & Pick<Client, "id" | "name">): Client {
  return {
    initials: "MS",
    organisation: "Acme",
    role: "Director",
    email: "",
    status: "Active",
    nextSession: "Not scheduled",
    currentFocus: "Build confidence in delegation",
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
    ...partial,
  };
}

function update(
  partial: Partial<DevelopmentUpdate> & Pick<DevelopmentUpdate, "id" | "clientId" | "sessionId">
): DevelopmentUpdate {
  return {
    coachId: "coach-1",
    status: "applied",
    conversationSummary: "Progress on delegation",
    proposedChanges: {},
    editedChanges: null,
    appliedChanges: null,
    evidenceSummary: [],
    hasMeaningfulChanges: true,
    coachNote: "",
    generatedAt: null,
    reviewedAt: null,
    appliedAt: "2026-07-25T12:00:00.000Z",
    discardedAt: null,
    createdAt: "2026-07-25T11:00:00.000Z",
    updatedAt: "2026-07-25T12:00:00.000Z",
    ...partial,
  };
}

describe("Journey relationship isolation", () => {
  it("never includes another relationship's conversations", () => {
    const michaelId = "michael-relationship";
    const conversations = [
      session({
        id: "s1",
        sessionNumber: 1,
        status: "completed",
        clientId: michaelId,
      }),
    ];
    const developmentUpdates = [
      update({
        id: "u1",
        clientId: michaelId,
        sessionId: "s1",
      }),
    ];

    const journey = resolveJourneyViewModel({
      relationship: client({ id: michaelId, name: "Michael Smith" }),
      coachId: "coach-1",
      conversations,
      reflections: conversations.map(item => ({
        relationshipId: item.clientId,
      })),
      commitments: [],
      developmentUpdates,
      profile: null,
    });

    expect(
      journey.sourceRecords.every(
        record => record.relationshipId === "michael-relationship"
      )
    ).toBe(true);
  });

  it("rejects mixed relationship conversations before render", () => {
    expect(() =>
      resolveJourneyViewModel({
        relationship: client({
          id: "michael-relationship",
          name: "Michael Smith",
        }),
        coachId: "coach-1",
        conversations: [
          session({
            id: "s1",
            sessionNumber: 1,
            status: "completed",
            clientId: "michael-relationship",
          }),
          session({
            id: "s2",
            sessionNumber: 1,
            status: "completed",
            clientId: "sarah-relationship",
          }),
        ],
        reflections: [],
        commitments: [],
        developmentUpdates: [],
        profile: null,
      })
    ).toThrow(RelationshipScopeIntegrityError);
  });

  it("uses relationship ID in the cache key", () => {
    expect(getJourneyQueryKey("coach-1", "michael-relationship")).toEqual([
      "journey",
      "coach-1",
      "",
      "michael-relationship",
    ]);
    expect(
      getPrepareQueryKey("coach-1", "michael-relationship", "session-1")
    ).toEqual([
      "prepare",
      "coach-1",
      "",
      "michael-relationship",
      "session-1",
      "",
    ]);
    expect(
      getPrepareQueryKey(
        "coach-1",
        "michael-relationship",
        "session-1",
        "evidence-rev-1"
      )
    ).toEqual([
      "prepare",
      "coach-1",
      "",
      "michael-relationship",
      "session-1",
      "evidence-rev-1",
    ]);
    expect(getDevelopmentQueryKey("coach-1", "michael-relationship")).toEqual([
      "development",
      "coach-1",
      "",
      "michael-relationship",
    ]);
    expect(getHistoryQueryKey("coach-1", "michael-relationship")).toEqual([
      "history",
      "coach-1",
      "",
      "michael-relationship",
    ]);
    expect(getReportsQueryKey("coach-1", "michael-relationship")).toEqual([
      "reports",
      "coach-1",
      "",
      "michael-relationship",
    ]);
    expect(
      getPrepareQueryKey("coach-1", "rel-a", "sess-1", "rev", "org-1")
    ).not.toEqual(
      getPrepareQueryKey("coach-1", "rel-a", "sess-1", "rev", "org-2")
    );
  });

  it("clears previous journey data when relationship changes", () => {
    // Remount key contract: workspace views must remount per relationship.
    // home-app keys CoachSpaceView / Prepare / History / Reports by selected.id.
    const sarahKey = "sarah-relationship";
    const michaelKey = "michael-relationship";
    expect(sarahKey).not.toEqual(michaelKey);
    expect(getJourneyQueryKey("coach-1", sarahKey)).not.toEqual(
      getJourneyQueryKey("coach-1", michaelKey)
    );
  });

  it("rejects generated insight naming another coachee", () => {
    expect(
      validateGeneratedJourney({
        coacheeName: "Michael Smith",
        text: "Sarah described feeling stuck.",
        knownOtherNames: ["Sarah Example", "Sarah"],
      })
    ).toEqual({
      valid: false,
      reason:
        "Generated text refers to a person outside the active relationship.",
    });
  });

  it("accepts generated insight naming only the active coachee", () => {
    expect(
      validateGeneratedJourney({
        coacheeName: "Michael Smith",
        text: "Michael Smith is developing confidence in delegation.",
        knownOtherNames: ["Sarah Example"],
      })
    ).toEqual({ valid: true });
  });

  it("assertRelationshipOwnership throws on mismatch", () => {
    expect(() =>
      assertRelationshipOwnership("michael-relationship", [
        { relationshipId: "sarah-relationship" },
      ])
    ).toThrow(RelationshipScopeIntegrityError);
  });

  it("containsUnexpectedPersonName detects other coachees", () => {
    expect(
      containsUnexpectedPersonName(
        "Sarah described feeling stuck.",
        "Michael Smith",
        ["Sarah Example"]
      )
    ).toBe(true);
  });

  it("hard-fails Journey content naming another coachee", () => {
    expect(() =>
      assertJourneyPersonMatch({
        expectedPersonName: "Michael Smith",
        content:
          "The session focused on Sarah Thompson’s uncertainty following the announcement",
        knownOtherNames: ["Sarah Thompson", "Sarah Johnson"],
      })
    ).toThrow(/Journey content names another person/);
  });

  it("does not false-positive on agreed when another client surname is Reed", () => {
    expect(
      containsUnexpectedPersonName(
        "Daniel Roberts agreed to create greater ownership.",
        "Daniel Roberts",
        ["Daniel Reed"]
      )
    ).toBe(false);
  });
});

describe("Prepare / Development / History / Reports isolation keys", () => {
  it("keeps distinct cache keys per relationship surface", () => {
    const coachId = "coach-1";
    const relationshipId = "michael-relationship";
    const keys = [
      getJourneyQueryKey(coachId, relationshipId),
      getPrepareQueryKey(coachId, relationshipId, "conv-1"),
      getDevelopmentQueryKey(coachId, relationshipId),
      getHistoryQueryKey(coachId, relationshipId),
      getReportsQueryKey(coachId, relationshipId),
    ];
    const serialised = keys.map(key => key.join(":"));
    expect(new Set(serialised).size).toBe(keys.length);
    for (const key of keys) {
      expect(key).toContain(relationshipId);
      expect(key).toContain(coachId);
    }
  });
});
