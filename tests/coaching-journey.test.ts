import { describe, expect, it } from "vitest";
import {
  COACHING_JOURNEY_STAGE_IDS,
  COACHING_JOURNEY_STAGES,
  buildCoachingJourneyEvidence,
  buildCurrentPositionCardModel,
  deriveAllCoachingJourneyStates,
  deriveCoachingJourneyState,
  getCurrentPositionSnapshot,
  getRelationshipPrimaryAction,
  legacyTabToStage,
  STAGE_TO_LEGACY_TAB,
} from "@/lib/coaching-journey";
import { createBlankSession } from "@/lib/sessions";
import type { Client } from "@/lib/types";

function makeSession(
  overrides: Partial<ReturnType<typeof createBlankSession>> = {}
) {
  return {
    ...createBlankSession({
      id: "session-1",
      clientId: "client-1",
      coachId: "coach-1",
      sessionNumber: 3,
      status: overrides.status,
      title: overrides.title,
      focus: overrides.focus,
      date: overrides.date,
    }),
    ...overrides,
  };
}

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: "client-1",
    name: "John Smith",
    initials: "JS",
    organisation: "ABC Consultants",
    role: "Manager",
    email: "",
    status: "Active",
    nextSession: "",
    currentFocus: "Establish authority through practical leadership.",
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
    ...overrides,
  };
}

describe("COACHING_JOURNEY_STAGES", () => {
  it("defines exactly six stages in order", () => {
    expect(COACHING_JOURNEY_STAGE_IDS).toEqual([
      "current_position",
      "prepare",
      "session_notes",
      "summary_insights",
      "development",
      "reports",
    ]);
    expect(COACHING_JOURNEY_STAGES.map(stage => stage.label)).toEqual([
      "Current Position",
      "Prepare",
      "Session Notes",
      "Summary & Insights",
      "Development",
      "Reports",
    ]);
  });

  it("marks Summary & Insights as optional", () => {
    const insights = COACHING_JOURNEY_STAGES.find(
      stage => stage.id === "summary_insights"
    );
    expect(insights?.optional).toBe(true);
  });

  it("maps stages to legacy SPA tabs", () => {
    expect(STAGE_TO_LEGACY_TAB.current_position).toBe("overview");
    expect(STAGE_TO_LEGACY_TAB.prepare).toBe("prepare");
    expect(STAGE_TO_LEGACY_TAB.session_notes).toBe("sessions");
    expect(STAGE_TO_LEGACY_TAB.summary_insights).toBe("summary");
    expect(legacyTabToStage("intelligence")).toBe("development");
  });
});

describe("deriveCoachingJourneyState", () => {
  it("keeps Current Position available once a relationship exists", () => {
    const evidence = buildCoachingJourneyEvidence(makeClient());
    expect(
      deriveCoachingJourneyState("current_position", evidence, "prepare")
    ).toBe("completed");
  });

  it("marks Prepare unavailable with no sessions", () => {
    const evidence = buildCoachingJourneyEvidence(makeClient());
    expect(
      deriveCoachingJourneyState("prepare", evidence, "current_position")
    ).toBe("unavailable");
  });

  it("marks Prepare available when a next session is planned", () => {
    const client = makeClient({
      sessions: [makeSession({ status: "planned" })],
    });
    const evidence = buildCoachingJourneyEvidence(client);
    expect(
      deriveCoachingJourneyState("prepare", evidence, "current_position")
    ).toBe("available");
  });

  it("marks Session Notes completed when notes exist", () => {
    const client = makeClient({
      sessions: [
        makeSession({
          status: "awaiting_completion",
          notes: "What stood out was a shift in ownership.",
        }),
      ],
    });
    const evidence = buildCoachingJourneyEvidence(client);
    expect(
      deriveCoachingJourneyState("session_notes", evidence, "current_position")
    ).toBe("completed");
  });

  it("keeps Summary & Insights optional when notes exist but unapproved", () => {
    const client = makeClient({
      sessions: [
        makeSession({
          status: "awaiting_completion",
          reflectWhatSurprised: "Clarity",
          summaryStatus: "draft",
          summary: "Draft summary",
        }),
      ],
    });
    const evidence = buildCoachingJourneyEvidence(client);
    expect(
      deriveCoachingJourneyState(
        "summary_insights",
        evidence,
        "session_notes"
      )
    ).toBe("optional");
  });

  it("marks Summary & Insights completed when approved", () => {
    const client = makeClient({
      sessions: [
        makeSession({
          status: "completed",
          notes: "Notes",
          summary: "Approved",
          summaryStatus: "approved",
          aiSummaryApproved: true,
        }),
      ],
    });
    const evidence = buildCoachingJourneyEvidence(client);
    expect(
      deriveCoachingJourneyState(
        "summary_insights",
        evidence,
        "development"
      )
    ).toBe("completed");
  });

  it("keeps Development available for the relationship", () => {
    const evidence = buildCoachingJourneyEvidence(makeClient());
    expect(
      deriveCoachingJourneyState("development", evidence, "current_position")
    ).toBe("available");
  });

  it("marks Reports available when report-capable records exist", () => {
    const client = makeClient({
      sessions: [
        makeSession({
          status: "completed",
          summaryStatus: "approved",
          aiSummaryApproved: true,
        }),
      ],
    });
    const evidence = buildCoachingJourneyEvidence(client);
    expect(
      deriveCoachingJourneyState("reports", evidence, "current_position")
    ).toBe("available");
  });

  it("returns current for the active stage", () => {
    const evidence = buildCoachingJourneyEvidence(makeClient());
    const states = deriveAllCoachingJourneyStates(evidence, "development");
    expect(states.development).toBe("current");
  });
});

describe("getCurrentPositionSnapshot", () => {
  it("normalises the management-role narrative without mutating source meaning", () => {
    const source =
      "John is adjusting to a management position leading 10 staff, where the team appear resistant following his appointment. He reports feeling isolated, unable to deliver current objectives, and has lost confidence in his ability to manage. Although he has considered returning to his previous role to escape the situation, he also expressed a wish to make the role work and began exploring possible options.";

    const snapshot = getCurrentPositionSnapshot(source, {
      clientName: "John Smith",
    });

    expect(snapshot).toContain("adjusting to a new management role");
    expect(snapshot).toContain("team resistance");
    expect(snapshot).toContain("making the role work");
    expect(snapshot.length).toBeLessThanOrEqual(280);
  });

  it("builds a display card model with progressive detail", () => {
    const model = buildCurrentPositionCardModel({
      narrative:
        "John is adjusting to a management position leading 10 staff, where the team appear resistant following his appointment. He reports feeling isolated.",
      currentFocus: "Establish authority through practical leadership.",
      clientName: "John Smith",
      nextSessionLabel: "Session 3 · Date not set",
      outstandingCommitment: "Speak with two team members.",
    });

    expect(model.statement.length).toBeGreaterThan(20);
    expect(model.currentFocus).toContain("authority");
    expect(model.nextConversation).toContain("Session 3");
    expect(model.outstandingCommitment).toContain("team members");
  });
});

describe("getRelationshipPrimaryAction", () => {
  it("prefers Prepare when a planned session exists", () => {
    const action = getRelationshipPrimaryAction({
      relationship: makeClient({
        sessions: [makeSession({ status: "planned", sessionNumber: 3 })],
      }),
    });
    expect(action?.kind).toBe("prepare_session");
    expect(action?.label).toBe("Prepare conversation");
  });

  it("prefers Continue conversation when a conversation is in progress", () => {
    const action = getRelationshipPrimaryAction({
      relationship: makeClient({
        sessions: [makeSession({ status: "in_progress", sessionNumber: 2 })],
      }),
    });
    expect(action?.kind).toBe("continue_session_notes");
    expect(action?.label).toBe("Continue conversation");
  });

  it("prefers Review Summary & Insights when notes exist and summary is draft", () => {
    const action = getRelationshipPrimaryAction({
      relationship: makeClient({
        sessions: [
          makeSession({
            status: "awaiting_completion",
            notes: "Useful shift",
            summary: "Draft",
            summaryStatus: "draft",
          }),
        ],
      }),
    });
    expect(action?.kind).toBe("review_summary_insights");
  });

  it("offers schedule when no sessions exist", () => {
    const action = getRelationshipPrimaryAction({
      relationship: makeClient({ sessions: [] }),
    });
    expect(action?.kind).toBe("schedule_conversation");
  });
});
