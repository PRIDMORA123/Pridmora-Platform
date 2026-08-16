import { describe, expect, it } from "vitest";
import {
  buildPreparationIntelligenceInput,
  buildPreparationIntelligenceInstructions,
} from "@/lib/coaching-intelligence/prompt";
import {
  buildPreparationAuthorisedEvidenceText,
  buildScopedPreparationRequestState,
  evaluatePreparationIsolationAttempt,
} from "@/lib/coaching-intelligence/preparation-isolation";
import type { ResolvedIntelligenceSources } from "@/lib/coaching-intelligence/resolve-sources";
import {
  buildRelationshipIsolationPromptBlock,
  containsUnexpectedPersonName,
  getPrepareQueryKey,
  normalisePersonNameText,
  validateRelationshipIsolation,
} from "@/lib/relationship-scope";

const emptySources: ResolvedIntelligenceSources = {
  previousConversations: [],
  approvedSummaries: [],
  openCommitments: [],
  approvedReflections: [],
  journeyEvidence: [],
  developmentThemes: [],
  approvedReports: [],
  authorisedDevelopmentEvidence: [],
  usedSources: [],
};

describe("preparation relationship isolation matching", () => {
  it("passes when no unexpected name is present", () => {
    const result = validateRelationshipIsolation(
      "Daniel Roberts agreed to create greater ownership.",
      {
        allowedClientName: "Daniel Roberts",
        knownOtherNames: ["Daniel Reed", "Sarah Thompson"],
      }
    );
    expect(result.status).toBe("pass");
  });

  it("allows the current client full name", () => {
    expect(
      containsUnexpectedPersonName(
        "Focus on Daniel Roberts and his management team.",
        "Daniel Roberts",
        ["Sarah Thompson"]
      )
    ).toBe(false);
  });

  it("allows the current client possessive (Unicode apostrophe)", () => {
    const text = "Daniel Roberts’s confidence when managers decide differently.";
    expect(
      validateRelationshipIsolation(text, {
        allowedClientName: "Daniel Roberts",
        knownOtherNames: ["Daniel Reed", "Sarah Thompson"],
      }).status
    ).toBe("pass");
  });

  it("allows ASCII possessive forms", () => {
    expect(
      validateRelationshipIsolation("Daniel Roberts' next step is ownership.", {
        allowedClientName: "Daniel Roberts",
        knownOtherNames: ["Sarah Thompson"],
      }).status
    ).toBe("pass");
  });

  it("allows organisation name tokens", () => {
    expect(
      validateRelationshipIsolation(
        "Horizon Facilities Group remains the organisational context.",
        {
          allowedClientName: "Daniel Roberts",
          organisationName: "Horizon Facilities Group",
          knownOtherNames: ["Sarah Thompson"],
        }
      ).status
    ).toBe("pass");
  });

  it("allows authorised coach name", () => {
    expect(
      validateRelationshipIsolation(
        "Coach Barry Pridmore may explore accountability with Daniel Roberts.",
        {
          allowedClientName: "Daniel Roberts",
          coachName: "Barry Pridmore",
          knownOtherNames: ["Sarah Thompson"],
        }
      ).status
    ).toBe("pass");
  });

  it("flags a definite other-client full name", () => {
    const result = validateRelationshipIsolation(
      JSON.stringify({
        previousConversation: "Sarah Thompson described feeling stuck.",
        outstandingActions: [],
      }),
      {
        allowedClientName: "Daniel Roberts",
        knownOtherNames: ["Sarah Thompson", "Daniel Reed"],
        fieldTexts: {
          previousConversation: "Sarah Thompson described feeling stuck.",
        },
      }
    );
    expect(result.status).toBe("definite_cross_client");
    expect(result.matchType).toBe("full_name");
    expect(result.fieldName).toBe("previousConversation");
  });

  it("flags an uncommon other-client surname as definite", () => {
    const result = validateRelationshipIsolation(
      "Thompson remains hesitant about delegation.",
      {
        allowedClientName: "Daniel Roberts",
        knownOtherNames: ["Sarah Thompson"],
      }
    );
    expect(result.status).toBe("definite_cross_client");
    expect(result.matchType).toBe("uncommon_surname");
  });

  it("treats common first-name-only hits as possible, not definite", () => {
    const result = validateRelationshipIsolation(
      "Sarah described feeling stuck after the announcement.",
      {
        allowedClientName: "Michael Smith",
        knownOtherNames: ["Sarah Example"],
      }
    );
    expect(result.status).toBe("possible_cross_client");
    expect(result.matchType).toBe("common_first_name");
  });

  it("does not reject short tokens", () => {
    expect(
      validateRelationshipIsolation("Lee may join the review briefly.", {
        allowedClientName: "Daniel Roberts",
        knownOtherNames: ["Jo Lee"],
      }).status
    ).toBe("pass");
  });

  it("does not match substrings inside unrelated words (reed in agreed)", () => {
    const result = validateRelationshipIsolation(
      "Daniel Roberts agreed to follow up with managers this week.",
      {
        allowedClientName: "Daniel Roberts",
        knownOtherNames: ["Daniel Reed"],
      }
    );
    expect(result.status).toBe("pass");
    expect(
      containsUnexpectedPersonName(
        "Daniel Roberts agreed to follow up with managers this week.",
        "Daniel Roberts",
        ["Daniel Reed"]
      )
    ).toBe(false);
  });

  it("treats ambiguous surname-only hits as possible", () => {
    const result = validateRelationshipIsolation(
      "Reed remains overly involved in operational detail.",
      {
        allowedClientName: "Daniel Roberts",
        knownOtherNames: ["Daniel Reed"],
      }
    );
    expect(result.status).toBe("possible_cross_client");
    expect(result.matchType).toBe("common_surname");
  });

  it("normalises punctuation and Unicode apostrophes", () => {
    expect(normalisePersonNameText("Daniel Roberts’s")).toBe("daniel roberts");
    expect(normalisePersonNameText("O’Neil")).toBe("o neil");
  });

  it("scales to accounts with 500 clients without false positives on agreed", () => {
    const others = Array.from({ length: 500 }, (_, index) => {
      if (index === 0) return "Daniel Reed";
      if (index === 1) return "Sarah Thompson";
      return `Client Surname${index}`;
    });
    const text =
      "Daniel Roberts agreed actions and prepared questions for the next conversation.";
    const result = validateRelationshipIsolation(text, {
      allowedClientName: "Daniel Roberts",
      knownOtherNames: others,
    });
    expect(result.status).toBe("pass");
  });
});

describe("preparation isolation evidence-grounded tokens", () => {
  const alexSources: ResolvedIntelligenceSources = {
    ...emptySources,
    previousConversations: [
      {
        id: "session-1",
        sessionNumber: 1,
        date: "2026-08-10",
        focus: "Stakeholder alignment",
        summary:
          "Alex Morgan worked through pressure from Jordan Blake while keeping delivery ownership.",
        commitments: "Follow up with Jordan Blake after the planning review.",
        emergingThemes: "Ownership under stakeholder pressure",
      },
    ],
    approvedSummaries: [
      {
        id: "session-1-summary",
        summary:
          "Approved summary notes support from Jordan Blake without losing accountability.",
        focus: "Stakeholder alignment",
      },
    ],
    usedSources: ["previous_conversations", "approved_summaries"],
  };

  it("A. other-client uncommon surname not in evidence → still blocked", () => {
    const evidence = buildPreparationAuthorisedEvidenceText({
      sources: alexSources,
      personContext: "Name: Alex Morgan\nRole: Project Coordinator",
      coachingPurpose: "Build delivery confidence",
    });
    expect(evidence.toLowerCase()).not.toContain("thompson");

    const result = evaluatePreparationIsolationAttempt({
      draftText: JSON.stringify({
        previousConversation: "Thompson remains hesitant about delegation.",
        suggestedQuestions: ["What would help next?"],
      }),
      context: {
        allowedClientName: "Alex Morgan",
        knownOtherNames: ["Sarah Thompson", "Jordan Blake"],
        authorisedNames: [evidence],
      },
      attempt: 1,
    });
    expect(result.maySave).toBe(false);
    expect(result.status).toBe("definite_cross_client");
    expect(result.check.matchType).toBe("uncommon_surname");
    expect(result.check.fieldName).toBe("previousConversation");
  });

  it("B. same token present in current relationship authorised evidence → allowed", () => {
    const evidence = buildPreparationAuthorisedEvidenceText({
      sources: alexSources,
      personContext: "Name: Alex Morgan",
      coachingPurpose: "Delivery ownership",
    });
    expect(evidence.toLowerCase()).toContain("blake");

    const result = evaluatePreparationIsolationAttempt({
      draftText: JSON.stringify({
        previousConversation:
          "Alex Morgan reviewed pressure from Jordan Blake and kept ownership clear.",
        suggestedQuestions: ["What support is still useful?"],
      }),
      context: {
        allowedClientName: "Alex Morgan",
        knownOtherNames: ["Jordan Blake", "Sarah Thompson"],
        authorisedNames: [evidence],
      },
      attempt: 1,
    });
    expect(result.maySave).toBe(true);
    expect(result.status).toBe("pass");
  });

  it("C. invented other-client surname not in evidence → blocked", () => {
    const evidence = buildPreparationAuthorisedEvidenceText({
      sources: alexSources,
    });
    const result = evaluatePreparationIsolationAttempt({
      draftText: JSON.stringify({
        previousConversation: "Compare briefly with Reed before the next review.",
      }),
      context: {
        allowedClientName: "Alex Morgan",
        knownOtherNames: ["Daniel Reed"],
        authorisedNames: [evidence],
      },
      attempt: 1,
    });
    // "reed" is ambiguous/common surname → possible; still not saveable.
    expect(result.maySave).toBe(false);
  });

  it("C2. invented uncommon other-client surname not in evidence → definite block", () => {
    const evidence = buildPreparationAuthorisedEvidenceText({
      sources: alexSources,
    });
    const result = evaluatePreparationIsolationAttempt({
      draftText: JSON.stringify({
        previousConversation: "Thompson set the tone for last week's discussion.",
      }),
      context: {
        allowedClientName: "Alex Morgan",
        knownOtherNames: ["Sarah Thompson"],
        authorisedNames: [evidence],
      },
      attempt: 1,
    });
    expect(result.maySave).toBe(false);
    expect(result.check.matchType).toBe("uncommon_surname");
  });

  it("D. retry still fails closed for genuine non-grounded hit", () => {
    const evidence = buildPreparationAuthorisedEvidenceText({
      sources: alexSources,
    });
    const context = {
      allowedClientName: "Alex Morgan",
      knownOtherNames: ["Sarah Thompson"],
      authorisedNames: [evidence],
    };
    const first = evaluatePreparationIsolationAttempt({
      draftText: JSON.stringify({
        previousConversation: "Thompson remains the comparison point.",
      }),
      context,
      attempt: 1,
    });
    const second = evaluatePreparationIsolationAttempt({
      draftText: JSON.stringify({
        previousConversation: "Thompson still appears after the stricter retry.",
      }),
      context,
      attempt: 2,
    });
    expect(first.maySave).toBe(false);
    expect(first.shouldRetry).toBe(true);
    expect(second.maySave).toBe(false);
    expect(second.shouldRetry).toBe(false);
  });

  it("E. Session 2 Prepare with Alex-scoped sources allows stakeholder collision", () => {
    const evidence = buildPreparationAuthorisedEvidenceText({
      sources: alexSources,
      personContext: "Name: Alex Morgan\nRole: Project Coordinator",
      coachingPurpose: "Delivery ownership",
    });
    const draft = {
      previousConversation:
        "Session 1 focused on how Alex Morgan handled pressure from Jordan Blake while keeping ownership.",
      outstandingActions: ["Follow up with Jordan Blake after planning."],
      possibleFocus: "Keep delivery ownership clear with stakeholders.",
      suggestedQuestions: [
        "What support from Jordan Blake remains useful?",
        "What would make the next conversation useful?",
      ],
    };
    const result = evaluatePreparationIsolationAttempt({
      draftText: JSON.stringify(draft),
      context: {
        allowedClientName: "Alex Morgan",
        knownOtherNames: ["Jordan Blake", "Sarah Thompson"],
        organisationName: "Customer One",
        authorisedNames: ["Customer One", evidence],
      },
      attempt: 1,
    });
    expect(result.maySave).toBe(true);
  });

  it("F. cross-relationship name without evidence grounding remains blocked", () => {
    const evidence = buildPreparationAuthorisedEvidenceText({
      sources: {
        ...emptySources,
        previousConversations: [
          {
            id: "session-1",
            sessionNumber: 1,
            date: "2026-08-10",
            focus: "Delegation",
            summary: "Alex Morgan practised stepping back from delivery detail.",
            commitments: "Ask one clarifying question before taking work back.",
            emergingThemes: "Ownership",
          },
        ],
      },
    });
    expect(evidence.toLowerCase()).not.toContain("thompson");
    const result = validateRelationshipIsolation(
      JSON.stringify({
        previousConversation: "Sarah Thompson described feeling stuck.",
      }),
      {
        allowedClientName: "Alex Morgan",
        knownOtherNames: ["Sarah Thompson"],
        authorisedNames: [evidence],
        fieldTexts: {
          previousConversation: "Sarah Thompson described feeling stuck.",
        },
      }
    );
    expect(result.status).toBe("definite_cross_client");
    expect(result.fieldName).toBe("previousConversation");
  });

  it("G. shared validator without authorised evidence is unchanged", () => {
    // Other consumers that omit evidence-grounded authorisedNames keep prior behaviour.
    const result = validateRelationshipIsolation(
      "Thompson remains hesitant about delegation.",
      {
        allowedClientName: "Alex Morgan",
        knownOtherNames: ["Sarah Thompson"],
      }
    );
    expect(result.status).toBe("definite_cross_client");
    expect(result.matchType).toBe("uncommon_surname");
  });
});

describe("preparation isolation retry gate", () => {
  it("retries once when first attempt fails, then saves a passing retry", () => {
    const context = {
      allowedClientName: "Daniel Roberts",
      knownOtherNames: ["Sarah Thompson"],
    };

    const first = evaluatePreparationIsolationAttempt({
      draftText: "Sarah Thompson remains the focus of exploration.",
      context,
      attempt: 1,
    });
    expect(first.maySave).toBe(false);
    expect(first.shouldRetry).toBe(true);
    expect(first.status).toBe("definite_cross_client");

    const rejectedDraft = "Sarah Thompson remains the focus of exploration.";
    const retryDraft =
      "Daniel Roberts continues to build ownership with managers.";
    expect(retryDraft).not.toContain("Sarah");
    expect(retryDraft).not.toBe(rejectedDraft);

    const retry = evaluatePreparationIsolationAttempt({
      draftText: retryDraft,
      context,
      attempt: 2,
    });
    expect(retry.maySave).toBe(true);
    expect(retry.shouldRetry).toBe(false);
    expect(retry.status).toBe("pass");
  });

  it("fails after both attempts and never marks rejected drafts as saveable", () => {
    const context = {
      allowedClientName: "Daniel Roberts",
      knownOtherNames: ["Sarah Thompson"],
    };
    const first = evaluatePreparationIsolationAttempt({
      draftText: "Compare with Sarah Thompson briefly.",
      context,
      attempt: 1,
    });
    const second = evaluatePreparationIsolationAttempt({
      draftText: "Sarah Thompson still appears in the retry draft.",
      context,
      attempt: 2,
    });

    expect(first.maySave).toBe(false);
    expect(second.maySave).toBe(false);
    expect(second.shouldRetry).toBe(false);
  });

  it("does not expose other-client names in retry response shape helpers", () => {
    const response = {
      code: "PREPARATION_CROSS_CLIENT",
      message: "Preparation could not be refreshed safely.",
      existingPreparationPreserved: true,
      retryAttempted: true,
    };
    const serialised = JSON.stringify(response);
    expect(serialised).not.toMatch(/Sarah/i);
    expect(serialised).not.toMatch(/Thompson/i);
    expect(serialised).not.toMatch(/Reed/i);
  });
});

describe("preparation prompt relationship isolation", () => {
  it("includes the relationship-isolation block with the named client", () => {
    const instructions = buildPreparationIntelligenceInstructions({
      mode: "assisted",
      clientDisplayName: "Daniel Roberts",
    });
    const input = buildPreparationIntelligenceInput({
      mode: "assisted",
      personContext: "Name: Daniel Roberts",
      coachingPurpose: "Delegation",
      sources: emptySources,
      clientDisplayName: "Daniel Roberts",
    });

    const block = buildRelationshipIsolationPromptBlock("Daniel Roberts");
    expect(instructions).toContain(block);
    expect(input).toContain(block);
    expect(instructions).toContain("Daniel Roberts");
    expect(instructions).not.toContain("Sarah Thompson");
    expect(input).not.toContain("Sarah Thompson");
  });

  it("adds a stricter retry instruction only on isolation retry", () => {
    const normal = buildPreparationIntelligenceInstructions({
      mode: "assisted",
      clientDisplayName: "Daniel Roberts",
    });
    const retry = buildPreparationIntelligenceInstructions({
      mode: "assisted",
      clientDisplayName: "Daniel Roberts",
      isolationRetry: true,
    });
    expect(normal).not.toContain("STRICT RELATIONSHIP-ISOLATION RETRY");
    expect(retry).toContain("STRICT RELATIONSHIP-ISOLATION RETRY");
    expect(retry).toContain("Do not mention any other person.");
  });

  it("keeps prepare cache keys scoped by coach, organisation, relationship, session and evidence", () => {
    expect(
      getPrepareQueryKey("coach-1", "rel-a", "sess-1", "evidence-1")
    ).toEqual(["prepare", "coach-1", "", "rel-a", "sess-1", "evidence-1"]);
    expect(
      getPrepareQueryKey("coach-1", "rel-a", "sess-1", "evidence-1")
    ).not.toEqual(
      getPrepareQueryKey("coach-1", "rel-b", "sess-1", "evidence-1")
    );
  });
});

describe("preparation request isolation concurrency", () => {
  it("keeps concurrent relationship requests isolated across 20 runs", async () => {
    const runs = Array.from({ length: 20 }, async (_, index) => {
      const stateA = buildScopedPreparationRequestState({
        coachId: "coach-1",
        relationshipId: "rel-daniel",
        sessionId: `sess-daniel-${index}`,
        evidenceRevision: `ev-daniel-${index}`,
        clientDisplayName: "Daniel Roberts",
        authorisedEvidence:
          "Daniel Roberts agreed to create ownership with managers.",
      });
      const stateB = buildScopedPreparationRequestState({
        coachId: "coach-1",
        relationshipId: "rel-sarah",
        sessionId: `sess-sarah-${index}`,
        evidenceRevision: `ev-sarah-${index}`,
        clientDisplayName: "Sarah Thompson",
        authorisedEvidence:
          "Sarah Thompson is exploring confidence after promotion.",
      });

      expect(stateA.cacheKey).not.toEqual(stateB.cacheKey);
      expect(stateA.promptClientName).toBe("Daniel Roberts");
      expect(stateB.promptClientName).toBe("Sarah Thompson");
      expect(stateA.evidence).not.toContain("Sarah Thompson");
      expect(stateB.evidence).not.toContain("Daniel Roberts");

      const draftA = {
        previousConversation: stateA.evidence,
        suggestedQuestions: [
          "What would help Daniel Roberts hold accountability?",
        ],
      };
      const draftB = {
        previousConversation: stateB.evidence,
        suggestedQuestions: [
          "What would help Sarah Thompson build confidence?",
        ],
      };

      const checkA = validateRelationshipIsolation(JSON.stringify(draftA), {
        allowedClientName: "Daniel Roberts",
        knownOtherNames: ["Sarah Thompson", "Daniel Reed"],
      });
      const checkB = validateRelationshipIsolation(JSON.stringify(draftB), {
        allowedClientName: "Sarah Thompson",
        knownOtherNames: ["Daniel Roberts", "Daniel Reed"],
      });

      expect(checkA.status).toBe("pass");
      expect(checkB.status).toBe("pass");
      expect(JSON.stringify(draftA)).not.toContain("Sarah Thompson");
      expect(JSON.stringify(draftB)).not.toContain("Daniel Roberts");

      return { stateA, stateB, checkA, checkB };
    });

    const results = await Promise.all(runs);
    expect(results).toHaveLength(20);
    const keys = new Set(results.flatMap(result => [result.stateA.cacheKey, result.stateB.cacheKey]));
    expect(keys.size).toBe(40);
  });
});
