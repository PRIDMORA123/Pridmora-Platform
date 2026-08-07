import { describe, expect, it } from "vitest";
import {
  buildClientJourneySnapshot,
  buildJourneyPageViewModel,
  buildJourneyTimeline,
  conversationDisplayTitle,
  conversationFocus,
  conversationKeyInsight,
  deriveJourneyStage,
  derivePrimaryAction,
  getCoachingPurpose,
  isTechnicalSessionLabel,
  recommendedCoachingFocus,
  synthesiseEmergingPattern,
} from "@/lib/client-journey";
import type { Client, Session } from "@/lib/types";
import type { DevelopmentProfile, DevelopmentUpdate } from "@/lib/development-updates/types";

function session(partial: Partial<Session> & Pick<Session, "id" | "sessionNumber" | "status">): Session {
  return {
    clientId: "client-1",
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

function client(partial: Partial<Client> = {}): Client {
  return {
    id: "client-1",
    name: "Sarah Example",
    initials: "SE",
    organisation: "Acme",
    role: "Director",
    email: "sarah@example.com",
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
    createdAt: "2026-07-01T10:00:00.000Z",
    ...partial,
  };
}

function update(
  partial: Partial<DevelopmentUpdate> & Pick<DevelopmentUpdate, "id" | "sessionId" | "status">
): DevelopmentUpdate {
  return {
    clientId: "client-1",
    coachId: "coach-1",
    conversationSummary: "Meaningful change noted.",
    proposedChanges: {},
    editedChanges: null,
    appliedChanges: null,
    evidenceSummary: [],
    hasMeaningfulChanges: true,
    coachNote: "",
    generatedAt: null,
    reviewedAt: null,
    appliedAt: null,
    discardedAt: null,
    createdAt: "2026-07-25T12:00:00.000Z",
    updatedAt: "2026-07-25T12:00:00.000Z",
    ...partial,
  };
}

describe("coaching purpose mapping", () => {
  it("reads coaching purpose from currentFocus", () => {
    expect(getCoachingPurpose(client())).toBe("Build confidence in delegation");
    expect(getCoachingPurpose(client({ currentFocus: "  " }))).toBe("");
  });
});

describe("journey stage derivation", () => {
  it("newly created client with purpose and no sessions", () => {
    const stage = deriveJourneyStage(client({ sessions: [] }));
    expect(stage.id).toBe("relationship_established");
    expect(stage.label).toBe("Development relationship established");
  });

  it("completed session awaiting review", () => {
    const stage = deriveJourneyStage(
      client({
        sessions: [
          session({
            id: "s1",
            sessionNumber: 1,
            status: "completed",
            summaryStatus: "draft",
            aiSummaryApproved: false,
          }),
        ],
      })
    );
    expect(stage.id).toBe("session_review_in_progress");
  });

  it("reviewed session with pending development update", () => {
    const stage = deriveJourneyStage(
      client({
        sessions: [
          session({
            id: "s1",
            sessionNumber: 1,
            status: "completed",
            summaryStatus: "approved",
            aiSummaryApproved: true,
          }),
        ],
      }),
      [update({ id: "u1", sessionId: "s1", status: "ready_for_review" })]
    );
    expect(stage.id).toBe("development_update_awaiting_review");
  });

  it("applied development update and no future session", () => {
    const stage = deriveJourneyStage(
      client({
        sessions: [
          session({
            id: "s1",
            sessionNumber: 1,
            status: "completed",
            summaryStatus: "approved",
            aiSummaryApproved: true,
          }),
        ],
      }),
      [update({ id: "u1", sessionId: "s1", status: "applied" })]
    );
    expect(stage.id).toBe("reflecting_between_sessions");
    expect(stage.label).toBe("Reflecting between conversations");
  });

  it("upcoming scheduled session", () => {
    const stage = deriveJourneyStage(
      client({
        sessions: [
          session({
            id: "s1",
            sessionNumber: 1,
            status: "completed",
            summaryStatus: "approved",
            aiSummaryApproved: true,
          }),
          session({
            id: "s2",
            sessionNumber: 2,
            status: "planned",
            date: "2026-08-01",
          }),
        ],
      }),
      [update({ id: "u1", sessionId: "s1", status: "applied" })]
    );
    expect(stage.id).toBe("preparing_for_session");
    expect(stage.label).toBe("Ready for preparation");
  });

  it("multiple completed sessions", () => {
    const snapshot = buildClientJourneySnapshot(
      client({
        sessions: [
          session({
            id: "s1",
            sessionNumber: 1,
            status: "completed",
            summaryStatus: "approved",
            aiSummaryApproved: true,
            date: "2026-06-01",
          }),
          session({
            id: "s2",
            sessionNumber: 2,
            status: "completed",
            summaryStatus: "approved",
            aiSummaryApproved: true,
            date: "2026-07-25",
            suggestedFocus: "Review delegation experience",
          }),
        ],
      }),
      [
        update({ id: "u1", sessionId: "s1", status: "applied" }),
        update({ id: "u2", sessionId: "s2", status: "applied" }),
      ]
    );
    expect(snapshot.completedSessionCount).toBe(2);
    expect(snapshot.mostRecentCompleted?.sessionNumber).toBe(2);
    expect(snapshot.stage.id).toBe("reflecting_between_sessions");
    expect(snapshot.suggestedFutureFocus).toBe("Review delegation experience");
  });

  it("archived client shows journey completed", () => {
    expect(deriveJourneyStage(client({ status: "Archived" })).id).toBe("journey_completed");
  });
});

describe("primary action priority", () => {
  it("prioritises missing coaching purpose", () => {
    expect(derivePrimaryAction(client({ currentFocus: "" }))?.kind).toBe("add_coaching_purpose");
  });

  it("prioritises session review over scheduling", () => {
    const action = derivePrimaryAction(
      client({
        sessions: [
          session({
            id: "s1",
            sessionNumber: 1,
            status: "completed",
            summaryStatus: "not_generated",
          }),
        ],
      })
    );
    expect(action?.kind).toBe("complete_session_review");
  });

  it("prioritises development update review", () => {
    const action = derivePrimaryAction(
      client({
        sessions: [
          session({
            id: "s1",
            sessionNumber: 1,
            status: "completed",
            summaryStatus: "approved",
            aiSummaryApproved: true,
          }),
        ],
      }),
      [update({ id: "u1", sessionId: "s1", status: "ready_for_review" })]
    );
    expect(action?.kind).toBe("review_development_update");
  });

  it("returns no dominant action when reflecting between sessions", () => {
    const action = derivePrimaryAction(
      client({
        sessions: [
          session({
            id: "s1",
            sessionNumber: 1,
            status: "completed",
            summaryStatus: "approved",
            aiSummaryApproved: true,
          }),
        ],
      }),
      [update({ id: "u1", sessionId: "s1", status: "applied" })]
    );
    expect(action).toBeNull();
  });
});

describe("conversation focus and insight", () => {
  it("prefers meaningful focus over technical session labels", () => {
    expect(
      conversationFocus(
        session({
          id: "s1",
          sessionNumber: 1,
          status: "completed",
          title: "Seeion 1",
          focus: "Delegation and difficult conversations",
        })
      )
    ).toBe("Delegation and difficult conversations");
  });

  it("skips Seeion/Session placeholders and uses topics", () => {
    expect(
      conversationFocus(
        session({
          id: "s1",
          sessionNumber: 1,
          status: "completed",
          title: "Seeion 1",
          focus: "Session 1",
          prepTopics: "Building confidence beyond role identity",
        })
      )
    ).toBe("Building confidence beyond role identity");
  });

  it("treats Coaching Seeion 1.1 as a technical label", () => {
    expect(isTechnicalSessionLabel("Coaching Seeion 1.1")).toBe(true);
    expect(
      conversationFocus(
        session({
          id: "s1",
          sessionNumber: 1,
          status: "completed",
          title: "Coaching Seeion 1.1",
          focus: "Coaching Seeion 1.1",
          prepTopics: "Delegation and boundaries",
        })
      )
    ).toBe("Delegation and boundaries");
    expect(
      conversationDisplayTitle(
        session({
          id: "s1",
          sessionNumber: 1,
          status: "completed",
          title: "Coaching Seeion 1.1",
          focus: "Coaching Seeion 1.1",
          prepTopics: "Delegation and boundaries",
        })
      )
    ).toBe("Development Conversation 1 — Delegation and boundaries");
  });

  it("returns a concise key insight", () => {
    expect(
      conversationKeyInsight(
        session({
          id: "s1",
          sessionNumber: 1,
          status: "completed",
          professionalIdentityDevelopment:
            "Sarah is beginning to describe her experience as transferable value.",
          summary: "A longer summary that should not be preferred.",
        })
      )
    ).toContain("transferable value");
  });
});

describe("journey page view model", () => {
  const profile = (partial: Partial<DevelopmentProfile> = {}): DevelopmentProfile => ({
    id: "p1",
    clientId: "client-1",
    coachId: "coach-1",
    currentFocus: "Practise handing work on under pressure",
    strengths: [{ id: "s1", value: "Clear thinking under pressure", status: "supported" }],
    values: [],
    motivators: [],
    emergingThemes: [{ id: "t1", value: "Delegation under load", status: "emerging" }],
    growthAreas: [{ id: "g1", value: "Letting go of completed work", status: "emerging" }],
    coachingPreferences: [],
    beliefs: [],
    patterns: [],
    commitments: [
      { id: "c1", value: "Delegate one weekly report", dueDate: null, status: "open" },
      { id: "c2", value: "Done item", dueDate: null, status: "complete" },
    ],
    coachingPatterns: [],
    patternsEvidenceFingerprint: null,
    patternsGeneratedAt: null,
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-25T10:00:00.000Z",
    ...partial,
  });

  it("keeps purpose, stage and focus once without inventing conversation focus", () => {
    const model = buildJourneyPageViewModel(
      client({
        sessions: [
          session({
            id: "s1",
            sessionNumber: 1,
            status: "completed",
            summaryStatus: "approved",
            aiSummaryApproved: true,
            title: "Coaching Seeion 1.1",
            focus: "Delegation and boundaries",
            summary: "Approved summary of the conversation.",
            agreedActions: "Try one delegated task this week.",
            professionalIdentityDevelopment: "Sarah values delegation but still holds work closely.",
            suggestedFocus: "Review how pressure affects delegation",
          }),
        ],
      }),
      profile(),
      [],
      "Reflecting between conversations"
    );

    expect(model.coachingPurpose).toBe("Build confidence in delegation");
    expect(model.currentDevelopmentFocus).toBe("Practise handing work on under pressure");
    expect(model.journeyStage).toBe("Reflecting between conversations");
    expect(model.latestMeaningfulConversationDate).toBeTruthy();
    expect(model.latestConversation?.title).toBe(
      "Development Conversation 1 — Delegation and boundaries"
    );
    expect(model.latestConversation?.title).not.toMatch(/Seeion/i);
    expect(model.latestConversation?.approvedSummary).toBe("Approved summary of the conversation.");
    expect(model.latestConversation?.agreedCommitments).toBe(
      "Try one delegated task this week."
    );
    expect(model.currentPosition.hasApprovedEvidence).toBe(true);
    expect(model.currentPosition.narrative.split(/\s+/).length).toBeLessThanOrEqual(100);
    expect(model.currentPosition.evidence).toBeTruthy();
    expect(model.lookingAhead.commitments).toEqual(["Delegate one weekly report"]);
    expect(model.lookingAhead.commitments.length).toBeLessThanOrEqual(3);
    expect(model.lookingAhead.nextFocus).toBeTruthy();
    expect(model.milestones.length).toBeGreaterThan(0);
    expect(model.milestones.slice(0, 4).length).toBeLessThanOrEqual(4);
    expect(model.commitmentsToRevisit).toEqual(["Delegate one weekly report"]);
    expect(model.recommendedCoachingFocus).toMatch(/letting go of completed work/i);
    expect(model.suggestedNextFocus).toBe("Review how pressure affects delegation");
    expect(model.emergingPattern.toLowerCase()).toContain("delegation");
  });

  it("synthesises a cautious emerging pattern", () => {
    const pattern = synthesiseEmergingPattern({
      clientName: "Sarah Example",
      patterns: [],
      themes: [],
      strengths: ["Recognises the value of delegation"],
      developmentAreas: ["Completing work herself when pressure rises"],
      keyInsight: "",
    });
    expect(pattern).toMatch(/Sarah/);
    expect(pattern).toMatch(/appears|emerging|still/i);
  });

  it("does not repeat current focus as the recommended focus by default", () => {
    expect(
      recommendedCoachingFocus({
        suggestedFocus: "",
        currentDevelopmentFocus: "Build confidence in delegation",
        developmentAreas: [],
        emergingPattern: "A separate pattern about trust.",
      })
    ).toBe("");
  });
});

describe("timeline summary", () => {
  it("does not invent completed milestones", () => {
    const timeline = buildJourneyTimeline(client({ sessions: [], currentFocus: "" }));
    expect(timeline.find(item => item.id === "purpose")?.status).toBe("Current");
    expect(timeline.some(item => /Session \d+/.test(item.label) && item.status === "Complete")).toBe(
      false
    );
  });

  it("marks coaching purpose complete when present", () => {
    const timeline = buildJourneyTimeline(client({ sessions: [] }));
    expect(timeline.find(item => item.id === "purpose")?.status).toBe("Complete");
  });

  it("aggregates completed conversations instead of listing each session", () => {
    const timeline = buildJourneyTimeline(
      client({
        sessions: [
          session({
            id: "s1",
            sessionNumber: 1,
            status: "completed",
            summaryStatus: "approved",
            aiSummaryApproved: true,
          }),
          session({
            id: "s2",
            sessionNumber: 2,
            status: "completed",
            summaryStatus: "approved",
            aiSummaryApproved: true,
          }),
          session({
            id: "s3",
            sessionNumber: 3,
            status: "completed",
            summaryStatus: "approved",
            aiSummaryApproved: true,
          }),
          session({
            id: "s4",
            sessionNumber: 4,
            status: "completed",
            summaryStatus: "approved",
            aiSummaryApproved: true,
          }),
        ],
      }),
      [
        update({ id: "u1", sessionId: "s1", status: "applied", appliedAt: "2026-06-02T10:00:00Z" }),
        update({ id: "u4", sessionId: "s4", status: "applied", appliedAt: "2026-07-26T10:00:00Z" }),
      ]
    );

    expect(timeline.length).toBeLessThanOrEqual(6);
    expect(timeline.some(item => item.label === "4 development conversations completed")).toBe(true);
    expect(timeline.filter(item => /^Session \d+$/.test(item.label)).length).toBe(0);
    expect(timeline.find(item => item.id === "latest-reflection")?.label).toContain("Session 4");
    expect(timeline.find(item => item.id === "latest-development-update")?.label).toContain(
      "Session 4"
    );
  });

  it("omits conversations and updates that have not occurred", () => {
    const timeline = buildJourneyTimeline(client({ sessions: [] }));
    expect(timeline.find(item => item.id === "conversations")).toBeUndefined();
    expect(timeline.find(item => item.id === "latest-reflection")).toBeUndefined();
    expect(timeline.find(item => item.id === "latest-development-update")).toBeUndefined();
    expect(timeline.length).toBeLessThanOrEqual(6);
  });
});
