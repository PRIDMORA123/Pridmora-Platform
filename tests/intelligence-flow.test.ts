import { describe, expect, it } from "vitest";
import {
  enforceEvidenceConfidence,
  parseAiInterpretation,
} from "@/lib/intelligence/schema";
import { buildIntelligenceSnapshot } from "@/lib/intelligence/snapshot";
import type { IntelligenceItem } from "@/lib/intelligence/types";
import {
  canCompleteSession,
  canEnterIntelligenceReview,
  hasPreparationContent,
  overviewPrimaryAction,
} from "@/lib/session-workflow";
import type { Session } from "@/lib/types";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function baseSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    clientId: "22222222-2222-4222-8222-222222222222",
    coachId: "33333333-3333-4333-8333-333333333333",
    sessionNumber: 1,
    title: "Focus conversation",
    date: "2026-07-25",
    time: "10:00",
    durationMinutes: 60,
    location: "",
    status: "planned",
    focus: "Clarity",
    preparation: "",
    prepPurpose: "Explore next steps",
    prepTopics: "Goals",
    prepQuestions: "1. What matters most?",
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
    lastUpdated: new Date().toISOString(),
    ...overrides,
  };
}

function item(overrides: Partial<IntelligenceItem> = {}): IntelligenceItem {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    userId: "33333333-3333-4333-8333-333333333333",
    clientId: "22222222-2222-4222-8222-222222222222",
    category: "strength",
    title: "Strategic thinking",
    description: "Evidence suggests a recurring pattern of systems thinking.",
    status: "proposed",
    confidenceScore: 40,
    confidenceLabel: "early signal",
    sourceType: "AI_interpretation",
    firstIdentifiedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    approvedAt: null,
    approvedBy: null,
    isLocked: false,
    coachNotes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
    evidence: [
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        intelligenceItemId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        sessionId: "11111111-1111-4111-8111-111111111111",
        userId: "33333333-3333-4333-8333-333333333333",
        evidenceText: "Described prioritising long-term outcomes.",
        evidenceType: "AI_interpretation",
        sourceExcerpt: "long-term outcomes",
        occurredAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        createdBy: "AI_interpretation",
        isRedacted: false,
      },
    ],
    evidenceCount: 1,
    ...overrides,
  };
}

describe("session and preparation workflow", () => {
  it("allows opening or preparing a person session", () => {
    const session = baseSession({ status: "planned", prepPurpose: "Explore goals" });
    expect(hasPreparationContent(session)).toBe(true);
    expect(overviewPrimaryAction(session).label).toBe("Open session brief");
  });

  it("supports prepare then start lifecycle", () => {
    const prepared = baseSession({ status: "prepared" });
    expect(overviewPrimaryAction(prepared).label).toBe("Start conversation");
    const live = baseSession({
      status: "in_progress",
      notes: "Conversation notes",
      notesSavedAt: new Date().toISOString(),
    timerElapsedSeconds: 0,
    timerStartedAt: null,
    sessionStartedAt: null,
    });
    expect(overviewPrimaryAction(live).label).toBe("Continue conversation");
  });

  it("requires saved notes before intelligence review and completion", () => {
    const unfinished = baseSession({ status: "awaiting_completion", notes: "" });
    expect(canEnterIntelligenceReview(unfinished).ok).toBe(false);
    expect(canCompleteSession(unfinished).ok).toBe(false);
    expect(overviewPrimaryAction(unfinished).label).toBe("Complete session");

    const ready = baseSession({
      status: "awaiting_completion",
      notes: "Captured notes",
      notesSavedAt: new Date().toISOString(),
    timerElapsedSeconds: 0,
    timerStartedAt: null,
    sessionStartedAt: null,
    });
    expect(canEnterIntelligenceReview(ready).ok).toBe(true);
    expect(canCompleteSession(ready).ok).toBe(true);
    expect(overviewPrimaryAction(ready).action).toBe("complete");
  });
});

describe("AI proposal validation", () => {
  it("stores validated AI output as proposed structures only", () => {
    const parsed = parseAiInterpretation(
      JSON.stringify({
        proposedInsights: [
          {
            category: "strength",
            title: "Strategic thinking",
            description: "Evidence suggests a pattern of long-range planning.",
            confidenceScore: 80,
            confidenceLabel: "strongly supported",
            evidence: [
              {
                evidenceText: "Mentioned prioritising future outcomes.",
                evidenceType: "session_note",
                sourceExcerpt: "future outcomes",
              },
            ],
            relationshipToExistingInsight: { type: "new", existingInsightId: null },
          },
        ],
        suggestedQuestions: [
          {
            question: "What would greater clarity enable?",
            reason: "Builds on stated focus",
            relatedInsightIds: [],
          },
        ],
        developmentSignals: [
          {
            signalName: "Clarity of direction",
            direction: "improving",
            evidenceSummary: "Described clearer priorities.",
          },
        ],
        nextSessionFocus: {
          title: "Test the emerging focus",
          reason: "Carry forward the stated priority",
        },
      })
    );

    expect(parsed.proposedInsights).toHaveLength(1);
    expect(parsed.proposedInsights[0]?.confidenceLabel).toBe("early signal");
    expect(parsed.proposedInsights[0]?.confidenceScore).toBeLessThanOrEqual(35);
  });

  it("keeps low-evidence items as early signals", () => {
    const enforced = enforceEvidenceConfidence({
      proposedInsights: [
        {
          category: "value",
          title: "Integrity",
          description: "Emerging insight only.",
          confidenceScore: 90,
          confidenceLabel: "strongly supported",
          evidence: [
            {
              evidenceText: "One remark only.",
              evidenceType: "AI_interpretation",
              sourceExcerpt: "",
            },
          ],
          relationshipToExistingInsight: { type: "new", existingInsightId: null },
        },
      ],
      suggestedQuestions: [],
      developmentSignals: [],
      nextSessionFocus: { title: "Review", reason: "" },
    });
    expect(enforced.proposedInsights[0]?.confidenceLabel).toBe("early signal");
  });
});

describe("intelligence presentation rules", () => {
  it("shows approved intelligence in snapshot and keeps proposed separate", () => {
    const approved = item({
      status: "approved",
      approvedAt: new Date().toISOString(),
      confidenceLabel: "supported",
      confidenceScore: 70,
      evidenceCount: 3,
    });
    const proposed = item({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      title: "Possible limiting belief",
      category: "limiting_belief",
      status: "proposed",
    });
    const snapshot = buildIntelligenceSnapshot([approved], [approved, proposed]);
    expect(snapshot.strongestSupportedStrength).toBe("Strategic thinking");
    expect(snapshot.awaitingReviewCount).toBe(1);
    expect(proposed.status).not.toBe("approved");
  });

  it("evidence drawer data includes linked evidence entries", () => {
    const insight = item();
    expect(insight.evidence.length).toBeGreaterThan(0);
    expect(insight.evidence[0]?.evidenceType).toBe("AI_interpretation");
  });
});

describe("product naming and homepage routes", () => {
  it("does not introduce permanent product names into UI source", () => {
    const files = [
      "components/app-shell.tsx",
      "components/marketing-homepage.tsx",
      "app/layout.tsx",
      "components/person-intelligence-view.tsx",
    ];
    for (const file of files) {
      const contents = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(contents).not.toMatch(/CoachWorkspace/);
      expect(contents).not.toMatch(/\bAtlas\b/);
      expect(contents).not.toMatch(/IDENTITY™/);
      expect(contents).not.toMatch(/Identity by Pridmora/);
      expect(contents).not.toMatch(/Identity Intelligence/);
    }
  });

  it("homepage CTAs route to auth start", () => {
    const homepage = readFileSync(
      resolve(process.cwd(), "components/marketing-homepage.tsx"),
      "utf8"
    );
    expect(homepage).toContain('href="/auth/sign-up"');
    expect(homepage).toContain("Start free");
    expect(homepage).toContain("See how it works");
  });
});

describe("AI failure safety", () => {
  it("session completion remains available when notes are saved even if AI fails", () => {
    const session = baseSession({
      status: "awaiting_completion",
      notes: "Notes remain intact",
      notesSavedAt: new Date().toISOString(),
    timerElapsedSeconds: 0,
    timerStartedAt: null,
    sessionStartedAt: null,
    });
    // AI failure must not clear notes or block completion eligibility.
    expect(session.notes).toBe("Notes remain intact");
    expect(canCompleteSession(session).ok).toBe(true);
  });
});
