import { describe, expect, it } from "vitest";
import {
  buildPreparationIntelligenceInput,
  buildPreparationIntelligenceInstructions,
} from "@/lib/coaching-intelligence/prompt";
import {
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
