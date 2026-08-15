import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  approvedSessionsBefore,
  buildPreparationAdapterContext,
  hasMeaningfulPriorCoachingEvidence,
  isGenuineFirstSessionPreparation,
  isHistoricalSessionPreparation,
  isReviewedPatternForPrepare,
  patternEvidenceIsBeforeSession,
  selectCommitmentsForPrepare,
} from "@/lib/preparation/preparation-intelligence-adapter";
import { selectPatternsForPrepare } from "@/lib/patterns/prioritise";
import { previousCompletedSession } from "@/lib/session-workflow";
import { hasCoachAuthoredPreparation, mergePreparationWithDraft } from "@/lib/preparation/derive-coach-preparation";
import type { DevelopmentProfile } from "@/lib/development-updates/types";
import type { CoachingPattern } from "@/lib/patterns/types";
import type { Client, Session } from "@/lib/types";

function makeSession(
  overrides: Partial<Session> & Pick<Session, "id" | "sessionNumber">
): Session {
  return {
    clientId: "client-1",
    coachId: "coach-1",
    title: `Session ${overrides.sessionNumber}`,
    date: "2026-08-01",
    time: "",
    durationMinutes: 60,
    location: "",
    status: "completed",
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
    notes: "",
    strengthsObserved: "",
    valuesBecomingVisible: "",
    emergingThemes: "",
    commitments: "",
    agreedActions: "",
    coachReflection: "",
    professionalIdentityDevelopment: "",
    suggestedFocus: "",
    summary: "Approved summary",
    summaryStatus: "approved",
    aiSummaryApproved: true,
    lastUpdated: "2026-08-01T00:00:00.000Z",
    completedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  } as Session;
}

function makeProfile(
  overrides: Partial<DevelopmentProfile> = {}
): DevelopmentProfile {
  return {
    id: "profile-1",
    clientId: "client-1",
    coachId: "coach-1",
    currentFocus: "Strengthen project judgement under pressure",
    strengths: [
      { id: "s1", value: "Clearer stakeholder updates", status: "supported" },
    ],
    values: [],
    motivators: [],
    emergingThemes: [
      { id: "t1", value: "Project judgement under pressure", status: "supported" },
    ],
    growthAreas: [
      { id: "g1", value: "Earlier escalation conversations", status: "emerging" },
    ],
    coachingPreferences: [],
    beliefs: [],
    patterns: [],
    commitments: [],
    coachingPatterns: [],
    patternsEvidenceFingerprint: null,
    patternsGeneratedAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function makePattern(
  overrides: Partial<CoachingPattern> & Pick<CoachingPattern, "id" | "title">
): CoachingPattern {
  return {
    clientId: "client-1",
    description: "Across approved session records, judgement confidence recurs.",
    strength: "emerging",
    status: "active",
    evidenceCount: 2,
    evidence: [],
    firstObservedAt: "2026-08-01T00:00:00.000Z",
    lastObservedAt: "2026-08-08T00:00:00.000Z",
    coachReviewed: true,
    coachAccepted: true,
    suppressed: false,
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
    ...overrides,
  } as CoachingPattern;
}

describe("preparation intelligence adapter — temporal integrity", () => {
  const session1 = makeSession({
    id: "s1",
    sessionNumber: 1,
    summary: "Session 1 summary",
    commitments: "Try one escalation earlier",
  });
  const session2 = makeSession({
    id: "s2",
    sessionNumber: 2,
    summary: "Session 2 summary — later evidence",
    commitments: "State a clear recommendation in the next project discussion",
    professionalIdentityDevelopment: "Beginning to act on project judgement",
  });

  it("Session N cannot consume Session N+1 approved summaries", () => {
    const before = approvedSessionsBefore([session1, session2], 2);
    expect(before.map(item => item.id)).toEqual(["s1"]);
    expect(before.some(item => item.id === "s2")).toBe(false);

    const forSession1 = approvedSessionsBefore([session1, session2], 1);
    expect(forSession1).toEqual([]);
  });

  it("regenerating Session 1 after Session 2 does not import Session 2 intelligence", () => {
    const adapter = buildPreparationAdapterContext({
      client: {
        name: "Alex Morgan",
        role: "Project Coordinator",
        currentFocus: "Strengthen project judgement under pressure",
        actions: [
          {
            id: "a2",
            title: "State a clear recommendation in the next project discussion",
            status: "Open",
            sessionId: "s2",
          },
        ],
        sessions: [session1, session2],
      },
      currentSession: { id: "s1", sessionNumber: 1 },
      profile: makeProfile({
        currentFocus: "Strengthen project judgement under pressure",
        coachingPatterns: [
          makePattern({
            id: "p1",
            title: "Earlier ownership of delivery concerns",
            evidence: [
              {
                sourceType: "approved_summary",
                sourceId: "ev-2",
                sessionId: "s2",
                excerpt: "Session 2",
              },
            ],
          }),
        ],
      }),
    });

    expect(adapter.isHistoricalPreparation).toBe(true);
    expect(adapter.isFirstSession).toBe(false);
    expect(adapter.prompt.previousSessions).not.toMatch(/Session 2 summary/i);
    expect(adapter.prompt.latestConversation).not.toMatch(/later evidence/i);
    expect(adapter.previousCommitment).toBeNull();
    expect(adapter.relevantPatterns).toEqual([]);
    expect(adapter.prompt.developmentProfile).toMatch(/temporal boundary/i);
  });

  it("later commitments cannot appear as Previous commitment for an earlier session", () => {
    const commitments = selectCommitmentsForPrepare({
      actions: [
        {
          id: "a2",
          title: "State a clear recommendation in the next project discussion",
          status: "Open",
          sessionId: "s2",
        },
        {
          id: "a1",
          title: "Try one escalation earlier",
          status: "Open",
          sessionId: "s1",
        },
      ],
      sessions: [session1, session2],
      currentSessionId: "prep-s1",
      beforeSessionNumber: 1,
      allowUndatedOpenActions: false,
    });
    expect(commitments).toEqual([]);

    const forSession3 = selectCommitmentsForPrepare({
      actions: [
        {
          id: "a2",
          title: "State a clear recommendation in the next project discussion",
          status: "Open",
          sessionId: "s2",
        },
      ],
      sessions: [session1, session2],
      currentSessionId: "s3",
      beforeSessionNumber: 3,
      allowUndatedOpenActions: true,
    });
    expect(forSession3[0]).toMatch(/clear recommendation/i);
  });

  it("later pattern evidence cannot appear in earlier preparation", () => {
    const sessionNumbers = new Map([
      ["s1", 1],
      ["s2", 2],
    ]);
    const laterPattern = makePattern({
      id: "p1",
      title: "Earlier ownership of delivery concerns",
      evidence: [
        {
          sourceType: "approved_summary",
          sourceId: "ev-2",
          sessionId: "s2",
          excerpt: "Across the first two approved session records",
        },
      ],
    });
    expect(
      patternEvidenceIsBeforeSession(laterPattern, sessionNumbers, 1)
    ).toBe(false);
    expect(
      selectPatternsForPrepare([laterPattern], {
        beforeSessionNumber: 1,
        sessionNumbers,
      })
    ).toEqual([]);
  });

  it("preserves previousCompletedSession chronological bound", () => {
    const previous = previousCompletedSession(
      [session1, session2, makeSession({ id: "s3", sessionNumber: 3, status: "planned", summaryStatus: "not_generated", aiSummaryApproved: false })],
      { id: "s3", sessionNumber: 3 }
    );
    expect(previous?.id).toBe("s2");
  });
});

describe("preparation intelligence adapter — first vs continuing", () => {
  it("genuine Session 1 receives contracting preparation", () => {
    const planned = makeSession({
      id: "s1",
      sessionNumber: 1,
      status: "planned",
      summary: "",
      summaryStatus: "not_generated",
      aiSummaryApproved: false,
    });
    expect(
      isGenuineFirstSessionPreparation({
        sessions: [planned],
        profile: makeProfile({
          currentFocus: "",
          strengths: [],
          emergingThemes: [],
          growthAreas: [],
        }),
      })
    ).toBe(true);

    const adapter = buildPreparationAdapterContext({
      client: {
        name: "Alex Morgan",
        role: "Project Coordinator",
        currentFocus: "",
        actions: [],
        sessions: [planned],
      },
      currentSession: planned,
      profile: makeProfile({
        currentFocus: "",
        strengths: [],
        emergingThemes: [],
        growthAreas: [],
        coachingPatterns: [],
      }),
    });
    expect(adapter.isFirstSession).toBe(true);
    expect(adapter.primaryFocusSuggestion).toMatch(/coaching purpose/i);
    expect(adapter.areasToExplore.some(item => /ways of working/i.test(item))).toBe(
      true
    );
    expect(
      adapter.questions.some(item => /coaching space to help you/i.test(item))
    ).toBe(true);
  });

  it("continuing relationships receive development-aware preparation", () => {
    const session1 = makeSession({ id: "s1", sessionNumber: 1 });
    const session2 = makeSession({ id: "s2", sessionNumber: 2 });
    const planned3 = makeSession({
      id: "s3",
      sessionNumber: 3,
      status: "planned",
      summary: "",
      summaryStatus: "not_generated",
      aiSummaryApproved: false,
    });
    expect(
      hasMeaningfulPriorCoachingEvidence({
        sessions: [session1, session2, planned3],
        profile: makeProfile(),
      })
    ).toBe(true);

    const adapter = buildPreparationAdapterContext({
      client: {
        name: "Alex Morgan",
        role: "Project Coordinator",
        currentFocus: "Strengthen project judgement under pressure",
        actions: [
          {
            id: "a2",
            title: "State a clear recommendation in the next project discussion",
            status: "Open",
            sessionId: "s2",
          },
        ],
        sessions: [session1, session2, planned3],
      },
      currentSession: planned3,
      profile: makeProfile({
        coachingPatterns: [
          makePattern({
            id: "p1",
            title: "Earlier ownership of delivery concerns",
            evidence: [
              {
                sourceType: "approved_summary",
                sourceId: "ev-1",
                sessionId: "s1",
                excerpt: "Session 1",
              },
              {
                sourceType: "approved_summary",
                sourceId: "ev-2",
                sessionId: "s2",
                excerpt: "Session 2",
              },
            ],
          }),
        ],
      }),
    });

    expect(adapter.isFirstSession).toBe(false);
    expect(adapter.isHistoricalPreparation).toBe(false);
    expect(adapter.previousCommitment).toMatch(/clear recommendation/i);
    expect(adapter.primaryFocusSuggestion).toMatch(/commitment|Explore|Strengthen|judgement|escalation/i);
    expect(adapter.areasToExplore.join(" ")).not.toMatch(
      /Preferred ways of working/i
    );
    expect(adapter.relevantPatterns[0]?.title).toMatch(/ownership/i);
  });

  it("reopening historical Session 1 does not revert to first-session coaching", () => {
    const session1 = makeSession({ id: "s1", sessionNumber: 1 });
    const session2 = makeSession({ id: "s2", sessionNumber: 2 });
    expect(
      isGenuineFirstSessionPreparation({
        sessions: [session1, session2],
        profile: makeProfile(),
      })
    ).toBe(false);
    expect(
      isHistoricalSessionPreparation([session1, session2], {
        id: "s1",
        sessionNumber: 1,
      })
    ).toBe(true);

    const adapter = buildPreparationAdapterContext({
      client: {
        name: "Alex Morgan",
        role: "Project Coordinator",
        currentFocus: "Strengthen project judgement under pressure",
        actions: [],
        sessions: [session1, session2],
      },
      currentSession: { id: "s1", sessionNumber: 1 },
      profile: makeProfile(),
    });
    expect(adapter.isFirstSession).toBe(false);
    expect(adapter.primaryFocusSuggestion).not.toMatch(
      /define a clear coaching purpose/i
    );
    expect(adapter.questions.join(" ")).not.toMatch(
      /coaching space to help you/i
    );
  });
});

describe("preparation pattern eligibility", () => {
  it("unreviewed patterns are not presented as preparation intelligence", () => {
    const unreviewed = makePattern({
      id: "p-draft",
      title: "Draft hypothesis",
      coachReviewed: false,
      coachAccepted: null,
      evidence: [
        {
          sourceType: "approved_summary",
          sourceId: "ev-1",
          sessionId: "s1",
          excerpt: "One",
        },
      ],
    });
    expect(isReviewedPatternForPrepare(unreviewed)).toBe(false);
    expect(
      selectPatternsForPrepare([unreviewed], {
        beforeSessionNumber: 3,
        sessionNumbers: new Map([["s1", 1]]),
      })
    ).toEqual([]);
  });
});

describe("coach-authored preparation remains protected", () => {
  it("merge keeps existing coach purpose/topics/questions", () => {
    const merged = mergePreparationWithDraft(
      {
        purpose: "Coach authored focus",
        topics: ["Coach topic"],
        questions: ["Coach question?"],
        desiredOutcome: "",
        reminders: "",
      },
      {
        purpose: "Generated focus",
        topics: ["Generated topic"],
        questions: ["Generated question?"],
        desiredOutcome: "Generated outcome",
        reminders: "",
      }
    );
    expect(merged.purpose).toBe("Coach authored focus");
    expect(merged.topics).toEqual(["Coach topic"]);
    expect(merged.questions).toEqual(["Coach question?"]);
    expect(hasCoachAuthoredPreparation(merged)).toBe(true);
  });
});

describe("shared surface / DI isolation contracts", () => {
  it("My Development does not use PrepareSessionView", () => {
    const myDev = readFileSync(
      resolve(process.cwd(), "components/my-development-intelligence-view.tsx"),
      "utf8"
    );
    expect(myDev).not.toContain("PrepareSessionView");
    expect(myDev).toContain("DevelopmentIntelligenceEvidencePanel");
  });

  it("generate route uses temporal session bound and adapter", () => {
    const route = readFileSync(
      resolve(process.cwd(), "app/api/preparation/generate/route.ts"),
      "utf8"
    );
    expect(route).toContain("buildPreparationAdapterContext");
    expect(route).toContain("sessionNumber < currentSession.sessionNumber");
  });
});
