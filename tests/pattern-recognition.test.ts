import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canMarkResolved,
  classifyPatternStrength,
  collectPatternEvidenceFromRelationship,
  deduplicateEvidence,
  filterAuthorisedEvidence,
  generateRelationshipPatterns,
  INSUFFICIENT_PATTERN_MESSAGE,
  preserveAcceptedOnFailure,
  provenanceHref,
  reconcilePatterns,
  selectPatternsForDevelopment,
  selectPatternsForPrepare,
  applyCoachPatternReview,
  unresolvedAbsenceMessage,
  type AuthorisedPatternEvidencePoint,
  type CoachingPattern,
  type PatternCandidate,
  type PatternEvidenceReference,
} from "@/lib/patterns";
import type { Session } from "@/lib/types";
import type { SupportingContextItem } from "@/lib/relationship-meta";

const migrationSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260731160000_coaching_patterns.sql"),
  "utf8"
);

describe("pattern storage extension", () => {
  it("extends development_profiles rather than creating a competing table", () => {
    expect(migrationSql).toContain(
      "add column if not exists coaching_patterns jsonb"
    );
    expect(migrationSql).not.toMatch(/create table.*coaching_patterns/i);
  });
});

function ref(
  partial: Partial<PatternEvidenceReference> &
    Pick<PatternEvidenceReference, "sourceType" | "sourceId">
): PatternEvidenceReference {
  return {
    sessionId: partial.sessionId ?? null,
    sourceDate: partial.sourceDate ?? null,
    excerpt: partial.excerpt ?? null,
    ...partial,
  };
}

function point(
  partial: Partial<AuthorisedPatternEvidencePoint> &
    Pick<
      AuthorisedPatternEvidencePoint,
      "sourceType" | "sourceId" | "relationshipId" | "content" | "canonicalKey"
    >
): AuthorisedPatternEvidencePoint {
  return {
    sessionId: partial.sessionId ?? null,
    sourceDate: partial.sourceDate ?? null,
    excerpt: partial.excerpt ?? null,
    isPrivate: partial.isPrivate ?? false,
    isApproved: partial.isApproved ?? true,
    aiEnabled: partial.aiEnabled,
    ...partial,
  };
}

function baseSession(overrides: Partial<Session> & { id: string }): Session {
  return {
    id: overrides.id,
    clientId: overrides.clientId ?? "rel-1",
    coachId: overrides.coachId ?? "coach-1",
    sessionNumber: overrides.sessionNumber ?? 1,
    title: overrides.title ?? "Session",
    date: overrides.date ?? "2026-07-01",
    time: overrides.time ?? "10:00",
    durationMinutes: 60,
    location: "",
    status: overrides.status ?? "completed",
    focus: overrides.focus ?? "",
    preparation: "",
    prepPurpose: "",
    prepTopics: "",
    prepQuestions: "",
    prepCommitmentsReview: "",
    prepRisks: "",
    prepPrivateNotes: overrides.prepPrivateNotes ?? "",
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
    notes: overrides.notes ?? "",
    commitments: overrides.commitments ?? "",
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
    reflectPrivate: overrides.reflectPrivate ?? "",
    summary: overrides.summary ?? "",
    emergingThemes: overrides.emergingThemes ?? "",
    strengthsObserved: "",
    valuesBecomingVisible: "",
    professionalIdentityDevelopment: "",
    agreedActions: overrides.agreedActions ?? "",
    outcomes: "",
    suggestedFocus: "",
    coachReflection: "",
    summaryStatus: overrides.summaryStatus ?? "not_generated",
    aiSummaryApproved: overrides.aiSummaryApproved ?? false,
    coachingQuestions: [],
    completedAt: overrides.completedAt ?? "2026-07-01T12:00:00.000Z",
    lastUpdated: "2026-07-01T12:00:00.000Z",
  };
}

describe("pattern evidence levels", () => {
  it("one observation does not become a pattern", () => {
    expect(
      classifyPatternStrength([
        ref({ sourceType: "approved_summary", sourceId: "s1:summary", sessionId: "s1" }),
      ])
    ).toBe("observation");
  });

  it("two distinct sources create an emerging theme", () => {
    expect(
      classifyPatternStrength([
        ref({ sourceType: "approved_summary", sourceId: "s1:summary", sessionId: "s1" }),
        ref({ sourceType: "approved_summary", sourceId: "s2:summary", sessionId: "s2" }),
      ])
    ).toBe("emerging");
  });

  it("three distinct evidence points spanning sessions may create an established pattern", () => {
    expect(
      classifyPatternStrength([
        ref({ sourceType: "approved_summary", sourceId: "s1:summary", sessionId: "s1" }),
        ref({ sourceType: "session_notes", sourceId: "s2:notes", sessionId: "s2" }),
        ref({ sourceType: "commitment", sourceId: "s3:commitments", sessionId: "s3" }),
      ])
    ).toBe("established");
  });

  it("duplicated evidence counts once", () => {
    const duplicated = deduplicateEvidence([
      point({
        sourceType: "approved_summary",
        sourceId: "s1:summary",
        relationshipId: "rel-1",
        sessionId: "s1",
        content: "Delegation under pressure",
        canonicalKey: "approved_summary|s1:summary|s1|delegation under pressure",
      }),
      point({
        sourceType: "approved_summary",
        sourceId: "s1:summary",
        relationshipId: "rel-1",
        sessionId: "s1",
        content: "Delegation under pressure",
        canonicalKey: "approved_summary|s1:summary|s1|delegation under pressure",
      }),
    ]);
    expect(duplicated).toHaveLength(1);
    expect(
      classifyPatternStrength(
        duplicated.map(item => ({
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          sessionId: item.sessionId,
          sourceDate: item.sourceDate,
          excerpt: null,
        }))
      )
    ).toBe("observation");
  });

  it("regenerated summaries do not inflate evidence count", () => {
    const result = reconcilePatterns({
      relationshipId: "rel-1",
      existing: [],
      candidates: [
        {
          title: "Delegation",
          description: "Delegation has appeared across approved sessions.",
          evidence: [
            ref({ sourceType: "approved_summary", sourceId: "s1:summary", sessionId: "s1" }),
            ref({ sourceType: "approved_summary", sourceId: "s1:summary", sessionId: "s1" }),
            ref({ sourceType: "approved_summary", sourceId: "s2:summary", sessionId: "s2" }),
          ],
        },
      ],
    });
    expect(result.patterns[0]?.evidenceCount).toBe(2);
    expect(result.patterns[0]?.strength).toBe("emerging");
  });
});

describe("pattern authorised evidence", () => {
  it("private notes are excluded", () => {
    const filtered = filterAuthorisedEvidence(
      [
        point({
          sourceType: "session_notes",
          sourceId: "private",
          relationshipId: "rel-1",
          content: "Private reminder about anxiety",
          isPrivate: true,
          canonicalKey: "private",
        }),
      ],
      "rel-1"
    );
    expect(filtered).toHaveLength(0);
  });

  it("unapproved summaries are excluded", () => {
    const sessions = [
      baseSession({
        id: "s1",
        summary: "Draft about delegation",
        summaryStatus: "draft",
        aiSummaryApproved: false,
      }),
    ];
    const points = collectPatternEvidenceFromRelationship({
      relationshipId: "rel-1",
      sessions,
    });
    expect(
      points.filter(item => item.sourceType === "approved_summary")
    ).toHaveLength(0);
  });

  it("unauthorised Supporting Context is excluded", () => {
    const context: SupportingContextItem[] = [
      {
        id: "ctx-1",
        title: "360 feedback on delegation",
        sourceType: "feedback_360",
        sourceDate: "2026-01-01",
        summary: "Peers note difficulty letting go",
        useForAiPreparation: false,
      },
    ];
    const points = collectPatternEvidenceFromRelationship({
      relationshipId: "rel-1",
      sessions: [],
      supportingContext: context,
    });
    expect(points).toHaveLength(0);
  });

  it("Supporting Context never becomes Recognised Pattern evidence", () => {
    const context: SupportingContextItem[] = [
      {
        id: "ctx-1",
        title: "360 feedback on delegation",
        sourceType: "feedback_360",
        sourceDate: "2026-01-01",
        summary: "Peers note difficulty letting go",
        useForAiPreparation: true,
      },
    ];
    const points = collectPatternEvidenceFromRelationship({
      relationshipId: "rel-1",
      sessions: [
        baseSession({
          id: "s1",
          summary: "Delegation came up again",
          summaryStatus: "approved",
          aiSummaryApproved: true,
        }),
        baseSession({
          id: "s2",
          date: "2026-07-08",
          summary: "Still working on delegation",
          summaryStatus: "approved",
          aiSummaryApproved: true,
        }),
      ],
      supportingContext: context,
    });
    expect(
      points.some(item => item.sourceType === "supporting_context")
    ).toBe(false);

    // Historical supporting_context refs must not count toward strength.
    const strength = classifyPatternStrength([
      ref({ sourceType: "approved_summary", sourceId: "s1:summary", sessionId: "s1" }),
      ref({ sourceType: "supporting_context", sourceId: "ctx-1" }),
    ]);
    expect(strength).toBe("observation");
    expect(
      classifyPatternStrength([
        ref({
          sourceType: "approved_summary",
          sourceId: "s1:summary",
          sessionId: "s1",
        }),
        ref({
          sourceType: "approved_summary",
          sourceId: "s1:notes",
          sessionId: "s1",
        }),
        ref({ sourceType: "supporting_context", sourceId: "ctx-1" }),
      ])
    ).toBe("emerging");
  });

  it("evidence from another relationship is excluded", () => {
    const filtered = filterAuthorisedEvidence(
      [
        point({
          sourceType: "approved_summary",
          sourceId: "other",
          relationshipId: "rel-other",
          content: "Delegation",
          canonicalKey: "other",
        }),
      ],
      "rel-1"
    );
    expect(filtered).toHaveLength(0);
  });
});

describe("pattern evidence excerpt persistence", () => {
  it("persists verbatim authorised excerpts and ignores AI-invented excerpt text", () => {
    const sessions = [
      baseSession({
        id: "s1",
        sessionNumber: 1,
        notes: "Delegation pressure appeared when leaving decisions with managers.",
        summary: "Delegation theme in session one.",
        summaryStatus: "approved",
        aiSummaryApproved: true,
      }),
      baseSession({
        id: "s2",
        sessionNumber: 2,
        date: "2026-07-08",
        notes: "Delegation again — she left the call with her manager.",
        summary: "Delegation continued.",
        summaryStatus: "approved",
        aiSummaryApproved: true,
      }),
    ];

    const result = generateRelationshipPatterns({
      relationshipId: "rel-1",
      sessions,
      existingPatterns: [],
      candidates: [
        {
          title: "Delegation",
          description: "Delegation has appeared across approved sessions.",
          evidence: [
            {
              sourceType: "session_notes",
              sourceId: "s1:notes",
              sessionId: "s1",
              excerpt: "AI invented paraphrase that must not be stored.",
            },
            {
              sourceType: "session_notes",
              sourceId: "s2:notes",
              sessionId: "s2",
              excerpt: "Another invented AI display sentence.",
            },
          ],
        },
      ],
    });

    const pattern = result.patterns[0];
    expect(pattern).toBeTruthy();
    expect(pattern?.evidence).toHaveLength(2);
    for (const item of pattern?.evidence ?? []) {
      expect(item.excerpt).toBeTruthy();
      expect(item.excerpt).not.toContain("AI invented");
      expect(item.excerpt).not.toContain("invented AI");
    }
    expect(pattern?.evidence[0]?.excerpt).toContain("Delegation pressure");
    expect(pattern?.evidence[1]?.excerpt).toContain("Delegation again");
  });

  it("does not attach private notes as pattern evidence excerpts", () => {
    const sessions = [
      baseSession({
        id: "s1",
        notes: "Visible coaching note about delegation.",
        prepPrivateNotes: "Private reminder about anxiety diagnosis.",
        reflectPrivate: "Do not surface this private reflection.",
        summary: "Delegation theme.",
        summaryStatus: "approved",
        aiSummaryApproved: true,
      }),
      baseSession({
        id: "s2",
        date: "2026-07-08",
        notes: "Delegation continued in the conversation.",
        summary: "Delegation continued.",
        summaryStatus: "approved",
        aiSummaryApproved: true,
      }),
    ];

    const points = collectPatternEvidenceFromRelationship({
      relationshipId: "rel-1",
      sessions,
    });
    expect(
      points.some(item => /anxiety diagnosis|private reflection/i.test(item.content))
    ).toBe(false);

    const result = generateRelationshipPatterns({
      relationshipId: "rel-1",
      sessions,
      existingPatterns: [],
      candidates: [
        {
          title: "Delegation",
          description: "Delegation has appeared across approved sessions.",
          evidence: [
            {
              sourceType: "session_notes",
              sourceId: "s1:notes",
              sessionId: "s1",
            },
            {
              sourceType: "session_notes",
              sourceId: "s2:notes",
              sessionId: "s2",
            },
          ],
        },
      ],
    });

    const joined = (result.patterns[0]?.evidence ?? [])
      .map(item => item.excerpt ?? "")
      .join(" ");
    expect(joined).not.toMatch(/anxiety diagnosis|private reflection/i);
  });

  it("leaves pattern strength classification unchanged", () => {
    expect(
      classifyPatternStrength([
        ref({ sourceType: "approved_summary", sourceId: "a", sessionId: "s1" }),
      ])
    ).toBe("observation");
    expect(
      classifyPatternStrength([
        ref({ sourceType: "approved_summary", sourceId: "a", sessionId: "s1" }),
        ref({ sourceType: "approved_summary", sourceId: "b", sessionId: "s2" }),
      ])
    ).toBe("emerging");
    expect(
      classifyPatternStrength([
        ref({ sourceType: "approved_summary", sourceId: "a", sessionId: "s1" }),
        ref({ sourceType: "commitment", sourceId: "b", sessionId: "s2" }),
        ref({ sourceType: "session_notes", sourceId: "c", sessionId: "s3" }),
      ])
    ).toBe("established");
  });
});

describe("pattern coach review", () => {
  const rejected: CoachingPattern = {
    id: "p1",
    relationshipId: "rel-1",
    title: "Delegation",
    description: "Delegation has appeared in approved sessions.",
    strength: "emerging",
    status: "active",
    evidenceCount: 2,
    evidence: [
      ref({ sourceType: "approved_summary", sourceId: "s1:summary", sessionId: "s1" }),
      ref({ sourceType: "approved_summary", sourceId: "s2:summary", sessionId: "s2" }),
    ],
    coachReviewed: true,
    coachAccepted: false,
    suppressed: true,
    evidenceFingerprint: "a",
  };

  it("rejected patterns are not recreated without new evidence", () => {
    const result = reconcilePatterns({
      relationshipId: "rel-1",
      existing: [rejected],
      candidates: [
        {
          title: "Delegation",
          description: "Delegation has appeared in approved sessions.",
          evidence: rejected.evidence,
        },
      ],
    });
    expect(result.patterns).toHaveLength(1);
    expect(result.patterns[0]?.suppressed).toBe(true);
    expect(result.patterns[0]?.coachAccepted).toBe(false);
  });

  it("coach-edited patterns are preserved", () => {
    const accepted: CoachingPattern = {
      ...rejected,
      title: "Coach wording on delegation",
      description: "Coach interpretation of the evidence.",
      coachAccepted: true,
      suppressed: false,
    };
    const result = reconcilePatterns({
      relationshipId: "rel-1",
      existing: [accepted],
      candidates: [
        {
          title: "Delegation pressure",
          description: "AI wants to replace coach wording.",
          evidence: [
            ...accepted.evidence,
            ref({
              sourceType: "approved_summary",
              sourceId: "s3:summary",
              sessionId: "s3",
            }),
          ],
        },
      ],
    });
    expect(result.patterns[0]?.title).toBe("Coach wording on delegation");
    expect(result.patterns[0]?.pendingSuggestion).toBeTruthy();
    expect(result.patterns[0]?.coachAccepted).toBe(true);
  });

  it("later evidence can strengthen a pattern", () => {
    const existing: CoachingPattern = {
      ...rejected,
      coachAccepted: null,
      coachReviewed: false,
      suppressed: false,
      status: "active",
      evidenceCount: 2,
    };
    const result = reconcilePatterns({
      relationshipId: "rel-1",
      existing: [existing],
      candidates: [
        {
          title: "Delegation",
          description: "Delegation has appeared across more sessions.",
          evidence: [
            ...existing.evidence,
            ref({
              sourceType: "approved_summary",
              sourceId: "s3:summary",
              sessionId: "s3",
            }),
          ],
        },
      ],
    });
    expect(result.patterns[0]?.status).toBe("strengthening");
    expect(result.patterns[0]?.strength).toBe("established");
  });

  it("later evidence can weaken a pattern", () => {
    const existing: CoachingPattern = {
      ...rejected,
      coachAccepted: true,
      suppressed: false,
      status: "active",
      evidenceCount: 3,
      evidence: [
        ref({ sourceType: "approved_summary", sourceId: "s1:summary", sessionId: "s1" }),
        ref({ sourceType: "approved_summary", sourceId: "s2:summary", sessionId: "s2" }),
        ref({ sourceType: "approved_summary", sourceId: "s3:summary", sessionId: "s3" }),
      ],
    };
    const result = reconcilePatterns({
      relationshipId: "rel-1",
      existing: [existing],
      candidates: [
        {
          title: "Delegation",
          description: "Fewer recent mentions remain.",
          evidence: [
            ref({
              sourceType: "approved_summary",
              sourceId: "s1:summary",
              sessionId: "s1",
            }),
            ref({
              sourceType: "approved_summary",
              sourceId: "s4:summary",
              sessionId: "s4",
            }),
          ],
        },
      ],
    });
    expect(result.patterns[0]?.status).toBe("reducing");
  });

  it("one missing mention does not resolve a pattern", () => {
    expect(
      canMarkResolved({
        sessionsSinceLastMention: 1,
        laterEvidenceSupersedes: false,
      })
    ).toBe(false);
    expect(unresolvedAbsenceMessage(2)).toMatch(/not yet enough evidence/);
  });

  it("insufficient evidence produces no forced insight", () => {
    const result = reconcilePatterns({
      relationshipId: "rel-1",
      existing: [],
      candidates: [
        {
          title: "One-off topic",
          description: "Appeared once.",
          evidence: [
            ref({
              sourceType: "approved_summary",
              sourceId: "s1:summary",
              sessionId: "s1",
            }),
          ],
        },
      ],
    });
    expect(result.patterns.filter(p => p.strength !== "observation")).toHaveLength(0);
    expect(result.message).toBe(INSUFFICIENT_PATTERN_MESSAGE);
  });

  it("AI generation failure preserves existing accepted patterns", () => {
    const accepted: CoachingPattern = {
      ...rejected,
      coachAccepted: true,
      suppressed: false,
    };
    const result = generateRelationshipPatterns({
      relationshipId: "rel-1",
      sessions: [],
      existingPatterns: [accepted],
      generationFailed: true,
    });
    expect(result.patterns).toEqual([accepted]);
    expect(preserveAcceptedOnFailure([accepted, rejected])).toHaveLength(2);
  });

  it("applyCoachPatternReview accept and reject work", () => {
    const draft: CoachingPattern = {
      ...rejected,
      coachAccepted: null,
      coachReviewed: false,
      suppressed: false,
    };
    expect(applyCoachPatternReview(draft, { action: "accept" }).coachAccepted).toBe(
      true
    );
    expect(applyCoachPatternReview(draft, { action: "reject" }).suppressed).toBe(
      true
    );
  });
});

describe("pattern placement limits", () => {
  function makePatterns(count: number): CoachingPattern[] {
    return Array.from({ length: count }, (_, index) => ({
      id: `p${index}`,
      relationshipId: "rel-1",
      title: `Pattern ${index} delegation ownership`,
      description: `Across sessions, pattern ${index} linked to team response.`,
      strength: "established" as const,
      status: "active" as const,
      evidenceCount: 3,
      lastObservedAt: `2026-07-${String(10 + index).padStart(2, "0")}`,
      evidence: [
        ref({ sourceType: "approved_summary", sourceId: `s${index}a`, sessionId: `s${index}a` }),
        ref({ sourceType: "approved_summary", sourceId: `s${index}b`, sessionId: `s${index}b` }),
        ref({ sourceType: "approved_summary", sourceId: `s${index}c`, sessionId: `s${index}c` }),
      ],
      coachReviewed: true,
      coachAccepted: true,
    }));
  }

  it("Prepare shows no more than two relevant patterns", () => {
    const selected = selectPatternsForPrepare(makePatterns(5), {
      focusText: "delegation ownership",
      limit: 2,
    });
    expect(selected.length).toBeLessThanOrEqual(2);
  });

  it("Development shows no more than three patterns initially", () => {
    const selected = selectPatternsForDevelopment(makePatterns(6), { limit: 3 });
    expect(selected).toHaveLength(3);
  });

  it("provenance links open the correct source", () => {
    expect(
      provenanceHref(
        ref({ sourceType: "approved_summary", sourceId: "x", sessionId: "sess-9" })
      )
    ).toBe("#evidence-session-sess-9");
    expect(
      provenanceHref(
        ref({ sourceType: "supporting_context", sourceId: "ctx-2" })
      )
    ).toBe("#evidence-context-ctx-2");
  });
});

describe("end-to-end pattern generation from authorised sessions", () => {
  it("detects continuity across approved sessions and ignores private notes", () => {
    const sessions = [
      baseSession({
        id: "s1",
        sessionNumber: 1,
        notes: "Client explored delegation under load",
        summary: "Delegation under load was a key theme",
        emergingThemes: "Delegation",
        summaryStatus: "approved",
        aiSummaryApproved: true,
        prepPrivateNotes: "Remind myself client seemed anxious — private only",
        reflectPrivate: "Do not use this private reflection",
      }),
      baseSession({
        id: "s2",
        sessionNumber: 2,
        date: "2026-07-08",
        completedAt: "2026-07-08T12:00:00.000Z",
        notes: "Returned to delegation with the leadership team",
        summary: "Delegation with the leadership team remained central",
        emergingThemes: "Delegation",
        summaryStatus: "approved",
        aiSummaryApproved: true,
      }),
      baseSession({
        id: "s3",
        sessionNumber: 3,
        date: "2026-07-15",
        completedAt: "2026-07-15T12:00:00.000Z",
        summary: "Delegation decisions were owned more directly",
        emergingThemes: "Delegation",
        summaryStatus: "approved",
        aiSummaryApproved: true,
      }),
    ];

    const result = generateRelationshipPatterns({
      relationshipId: "rel-1",
      sessions,
      existingPatterns: [],
    });

    expect(result.patterns.length).toBeGreaterThan(0);
    expect(result.patterns.every(pattern => pattern.strength !== "observation")).toBe(
      true
    );
    expect(
      result.patterns.some(pattern =>
        /delegation/i.test(pattern.title + pattern.description)
      )
    ).toBe(true);
  });

  it("does not use candidates that cite another relationship's sources", () => {
    const candidates: PatternCandidate[] = [
      {
        title: "Foreign evidence",
        description: "Should be dropped",
        evidence: [
          ref({ sourceType: "approved_summary", sourceId: "foreign:summary" }),
          ref({ sourceType: "approved_summary", sourceId: "foreign2:summary" }),
        ],
      },
    ];
    const result = generateRelationshipPatterns({
      relationshipId: "rel-1",
      sessions: [
        baseSession({
          id: "s1",
          summary: "Local approved summary about planning",
          summaryStatus: "approved",
          aiSummaryApproved: true,
        }),
      ],
      existingPatterns: [],
      candidates,
    });
    expect(result.patterns.every(p => p.title !== "Foreign evidence")).toBe(true);
  });
});
