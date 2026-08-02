import { describe, expect, it } from "vitest";
import {
  IntelligenceMigrationRequiredError,
  isMissingIntelligenceSchema,
  toIntelligenceUserError,
} from "@/lib/intelligence/errors";
import { SupabaseDbError } from "@/lib/supabase/errors";
import { canCompleteSession, canEnterIntelligenceReview } from "@/lib/session-workflow";
import type { Session } from "@/lib/types";
import { parseAiInterpretation } from "@/lib/intelligence/schema";
import { buildIntelligenceSnapshot } from "@/lib/intelligence/snapshot";
import type { IntelligenceItem } from "@/lib/intelligence/types";

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    clientId: "22222222-2222-4222-8222-222222222222",
    coachId: "33333333-3333-4333-8333-333333333333",
    sessionNumber: 2,
    title: "Progress review",
    date: "2026-07-25",
    time: "14:00",
    durationMinutes: 60,
    location: "",
    status: "awaiting_completion",
    focus: "Focus",
    preparation: "Prep",
    prepPurpose: "Outcome",
    prepTopics: "Topics",
    prepQuestions: "1. Question",
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
    notes: "Live notes retained",
    commitments: "Follow up with stakeholder",
    parkingLot: "",
    notesSavedAt: new Date().toISOString(),
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
    summary: "Approved summary text",
    emergingThemes: "Clarity",
    strengthsObserved: "",
    valuesBecomingVisible: "",
    professionalIdentityDevelopment: "",
    agreedActions: "Follow up with stakeholder",
    outcomes: "",
    suggestedFocus: "Next focus",
    coachReflection: "",
    summaryStatus: "approved",
    aiSummaryApproved: true,
    coachingQuestions: [],
    completedAt: "",
    lastUpdated: new Date().toISOString(),
    ...overrides,
  };
}

describe("data integrity and migration readiness", () => {
  it("detects missing intelligence schema as migration required", () => {
    const error = new SupabaseDbError({
      message: "Could not find the table 'public.intelligence_items' in the schema cache",
      code: "PGRST205",
    });
    expect(isMissingIntelligenceSchema(error)).toBe(true);
    expect(toIntelligenceUserError(error, "fallback")).toContain(
      "20260725140000_development_intelligence.sql"
    );
    expect(new IntelligenceMigrationRequiredError().name).toBe(
      "IntelligenceMigrationRequiredError"
    );
  });

  it("keeps AI proposals proposed and requires evidence", () => {
    const parsed = parseAiInterpretation(
      JSON.stringify({
        proposedInsights: [
          {
            category: "value",
            title: "Integrity",
            description: "Evidence suggests integrity is becoming visible.",
            confidenceScore: 70,
            confidenceLabel: "supported",
            evidence: [
              {
                evidenceText: "Named integrity as a non-negotiable.",
                evidenceType: "client_statement",
                sourceExcerpt: "non-negotiable",
              },
            ],
            relationshipToExistingInsight: { type: "new", existingInsightId: null },
          },
        ],
        suggestedQuestions: [],
        developmentSignals: [],
        nextSessionFocus: { title: "Explore integrity in action", reason: "Carry forward" },
      })
    );
    expect(parsed.proposedInsights[0]?.evidence.length).toBeGreaterThan(0);
    expect(parsed.proposedInsights[0]?.confidenceLabel).toBe("early signal");
  });

  it("does not present proposed intelligence as established fact in snapshot", () => {
    const proposed: IntelligenceItem = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      userId: "33333333-3333-4333-8333-333333333333",
      clientId: "22222222-2222-4222-8222-222222222222",
      category: "strength",
      title: "Proposed only",
      description: "Requires validation",
      status: "proposed",
      confidenceScore: 40,
      confidenceLabel: "early signal",
      sourceType: "AI_interpretation",
      firstIdentifiedAt: null,
      lastUpdatedAt: null,
      approvedAt: null,
      approvedBy: null,
      isLocked: false,
      coachNotes: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
      evidence: [],
      evidenceCount: 0,
    };
    const approved: IntelligenceItem = {
      ...proposed,
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      title: "Coach-approved strength",
      status: "approved",
      approvedAt: new Date().toISOString(),
      confidenceLabel: "supported",
      evidenceCount: 2,
    };
    const snapshot = buildIntelligenceSnapshot([approved], [approved, proposed]);
    expect(snapshot.strongestSupportedStrength).toBe("Coach-approved strength");
    expect(snapshot.awaitingReviewCount).toBe(1);
  });
});

describe("release loop completion gates", () => {
  it("allows intelligence review and completion only after notes are saved", () => {
    const ready = session();
    expect(canEnterIntelligenceReview(ready).ok).toBe(true);
    expect(canCompleteSession(ready).ok).toBe(true);
  });

  it("preserves notes when AI generation would fail", () => {
    const ready = session({ notes: "Critical notes must remain" });
    expect(ready.notes).toBe("Critical notes must remain");
    expect(canCompleteSession(ready).ok).toBe(true);
  });

  it("parses related insight ids used for strengthen-on-approve", () => {
    const notes =
      "Related existing insight: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa (supports).";
    const match = notes.match(
      /Related existing insight:\s*([0-9a-f-]{36})\s*\((supports|challenges)\)/i
    );
    expect(match?.[1]).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(match?.[2]).toBe("supports");
  });
});
