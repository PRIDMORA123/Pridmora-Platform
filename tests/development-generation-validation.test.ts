import { describe, expect, it, vi } from "vitest";
import {
  buildDevelopmentAuthorisedEvidenceText,
  buildDevelopmentRetryPromptAddon,
  developmentRejectionResponseBody,
  evaluateDevelopmentGenerationAttempt,
  normalizeDevelopmentModelText,
  validateDevelopmentEvidenceReferences,
} from "@/lib/development-updates/generate-validation";
import { parseDevelopmentUpdateGeneration } from "@/lib/development-updates/schema";
import { validateRelationshipIsolation } from "@/lib/relationship-scope";

const meaningfulPayload = {
  conversationSummary: "Explored delegation and boundaries.",
  hasMeaningfulChanges: true,
  proposedChanges: {
    emergingThemes: {
      add: [
        {
          value: "Boundary setting",
          status: "emerging",
          reason: "Raised again this session",
        },
      ],
      update: [],
      remove: [],
    },
  },
  evidence: [
    {
      changeKey: "emergingThemes.add.0",
      evidenceText: "Described difficulty saying no.",
      sourceExcerpt: "I keep saying yes",
      sessionId: "55330765-5218-4130-bf29-46e252b586e5",
    },
  ],
};

const noChangePayload = {
  conversationSummary: "A steady check-in with no new profile signals.",
  hasMeaningfulChanges: false,
  proposedChanges: {},
  evidence: [],
};

const isolationContext = {
  allowedClientName: "Daniel Reed",
  knownOtherNames: ["Daniel Roberts", "Sarah Thompson"],
};

describe("normalizeDevelopmentModelText", () => {
  it("strips markdown fences before parsing", () => {
    const raw = "```json\n" + JSON.stringify(noChangePayload) + "\n```";
    const normalised = normalizeDevelopmentModelText(raw);
    expect(normalised.startsWith("{")).toBe(true);
    expect(parseDevelopmentUpdateGeneration(normalised).hasMeaningfulChanges).toBe(
      false
    );
  });
});

describe("evaluateDevelopmentGenerationAttempt", () => {
  const sessionId = "55330765-5218-4130-bf29-46e252b586e5";
  const allowedSessionIds = new Set([sessionId]);

  it("accepts a meaningful update", () => {
    const result = evaluateDevelopmentGenerationAttempt({
      outputText: JSON.stringify(meaningfulPayload),
      isolationContext,
      allowedSessionIds,
      attempt: 1,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.generation.hasMeaningfulChanges).toBe(true);
    }
  });

  it("accepts no meaningful change as success", () => {
    const result = evaluateDevelopmentGenerationAttempt({
      outputText: JSON.stringify(noChangePayload),
      isolationContext,
      allowedSessionIds,
      attempt: 1,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.generation.hasMeaningfulChanges).toBe(false);
      expect(result.generation.proposedChanges).toEqual({});
    }
  });

  it("rejects invalid JSON as retryable on first attempt", () => {
    const result = evaluateDevelopmentGenerationAttempt({
      outputText: "not-json",
      isolationContext,
      allowedSessionIds,
      attempt: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejection.code).toBe("DEVELOPMENT_INVALID_JSON");
      expect(result.rejection.stage).toBe("parsing");
      expect(result.rejection.retryable).toBe(true);
    }
  });

  it("marks invalid JSON non-retryable on second attempt", () => {
    const result = evaluateDevelopmentGenerationAttempt({
      outputText: "still-not-json",
      isolationContext,
      allowedSessionIds,
      attempt: 2,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejection.retryable).toBe(false);
    }
  });

  it("rejects schema validation failures", () => {
    const result = evaluateDevelopmentGenerationAttempt({
      outputText: JSON.stringify({
        conversationSummary: "",
        hasMeaningfulChanges: true,
        proposedChanges: {},
        evidence: [],
      }),
      isolationContext,
      allowedSessionIds,
      attempt: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejection.code).toBe("DEVELOPMENT_SCHEMA_INVALID");
      expect(result.rejection.stage).toBe("schema_validation");
    }
  });

  it("rejects definite cross-client references", () => {
    const result = evaluateDevelopmentGenerationAttempt({
      outputText: JSON.stringify({
        ...noChangePayload,
        conversationSummary:
          "Daniel Roberts should keep focusing on ownership this week.",
      }),
      isolationContext,
      allowedSessionIds,
      attempt: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejection.code).toBe("DEVELOPMENT_CROSS_CLIENT");
      expect(result.rejection.stage).toBe("relationship_isolation");
      expect(result.rejection.retryable).toBe(true);
      expect(result.rejection.isolation?.status).toBe("definite_cross_client");
    }
  });

  it("rejects unsupported evidence session references", () => {
    const result = evaluateDevelopmentGenerationAttempt({
      outputText: JSON.stringify({
        ...meaningfulPayload,
        evidence: [
          {
            changeKey: "emergingThemes.add.0",
            evidenceText: "Described difficulty saying no.",
            sessionId: "00000000-0000-4000-8000-000000000099",
          },
        ],
      }),
      isolationContext,
      allowedSessionIds,
      attempt: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejection.code).toBe("DEVELOPMENT_UNSUPPORTED_EVIDENCE");
      expect(result.rejection.fieldName).toBe("evidence.0.sessionId");
    }
  });

  it("returns a safe structured 422 body without other-client names", () => {
    const body = developmentRejectionResponseBody({
      code: "DEVELOPMENT_CROSS_CLIENT",
      stage: "relationship_isolation",
      validator: "validateRelationshipIsolation",
      retryable: true,
      existingProfilePreserved: true,
    });
    expect(body.code).toBe("DEVELOPMENT_CROSS_CLIENT");
    expect(body.existingProfilePreserved).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/Roberts|Thompson/i);
  });
});

describe("validateDevelopmentEvidenceReferences", () => {
  it("allows evidence tied to authorised sessions", () => {
    expect(
      validateDevelopmentEvidenceReferences(
        [
          {
            changeKey: "a",
            evidenceText: "ok",
            sessionId: "55330765-5218-4130-bf29-46e252b586e5",
          },
        ],
        new Set(["55330765-5218-4130-bf29-46e252b586e5"])
      )
    ).toBeNull();
  });
});

describe("retry prompt", () => {
  it("names only the authorised client and requires exact JSON", () => {
    const addon = buildDevelopmentRetryPromptAddon("Daniel Reed");
    expect(addon).toContain("Daniel Reed");
    expect(addon).toMatch(/exact JSON/i);
    expect(addon).toMatch(/markdown/i);
  });
});

describe("route contract", () => {
  it("keeps planned-session and retry paths in the generate route", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "app/api/development-updates/generate/route.ts"),
      "utf8"
    );
    expect(source).toContain("DEVELOPMENT_SESSION_NOT_COMPLETE");
    expect(source).toContain("buildDevelopmentRetryPromptAddon");
    expect(source).toContain("buildDevelopmentAuthorisedEvidenceText");
    expect(source).toContain("recordDevelopmentGenerationRejection");
    expect(source).not.toContain("markDevelopmentUpdateFailed");
  });
});

describe("evidence-grounded development isolation", () => {
  const sessionId = "55330765-5218-4130-bf29-46e252b586e5";
  const allowedSessionIds = new Set([sessionId]);
  const otherClientName = "Sarah Thompson";

  it("A. allows uncommon surname grounded in current session notes/summary", () => {
    const evidence = buildDevelopmentAuthorisedEvidenceText({
      sessionNotes: "Discussed stakeholder feedback from Sarah Thompson.",
      approvedSummary: "Alex and Sarah Thompson agreed next steps.",
    });
    const result = evaluateDevelopmentGenerationAttempt({
      outputText: JSON.stringify({
        ...noChangePayload,
        conversationSummary:
          "Conversation referenced Sarah Thompson as a stakeholder.",
      }),
      isolationContext: {
        allowedClientName: "Alex Morgan",
        knownOtherNames: [otherClientName],
        authorisedNames: [evidence],
      },
      allowedSessionIds,
      attempt: 1,
    });
    expect(result.ok).toBe(true);
  });

  it("B. allows uncommon surname grounded in prior same-relationship evidence", () => {
    const evidence = buildDevelopmentAuthorisedEvidenceText({
      previousSessions:
        "Summary: Sarah Thompson attended the stakeholder review.",
      developmentProfile: "Patterns: Working with Sarah Thompson on priorities.",
    });
    const result = evaluateDevelopmentGenerationAttempt({
      outputText: JSON.stringify({
        ...noChangePayload,
        conversationSummary:
          "Continued themes involving Sarah Thompson from earlier sessions.",
      }),
      isolationContext: {
        allowedClientName: "Alex Morgan",
        knownOtherNames: [otherClientName],
        authorisedNames: [evidence],
      },
      allowedSessionIds,
      attempt: 1,
    });
    expect(result.ok).toBe(true);
  });

  it("C. blocks other-client uncommon surname absent from evidence", () => {
    const evidence = buildDevelopmentAuthorisedEvidenceText({
      sessionNotes: "Alex explored prioritisation and boundaries.",
      approvedSummary: "No stakeholder names beyond Alex.",
    });
    const result = evaluateDevelopmentGenerationAttempt({
      outputText: JSON.stringify({
        ...noChangePayload,
        conversationSummary: "Thompson remains hesitant about delegation.",
      }),
      isolationContext: {
        allowedClientName: "Alex Morgan",
        knownOtherNames: [otherClientName],
        authorisedNames: [evidence],
      },
      allowedSessionIds,
      attempt: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejection.code).toBe("DEVELOPMENT_CROSS_CLIENT");
      expect(result.rejection.stage).toBe("relationship_isolation");
      expect(result.rejection.isolation?.matchType).toBe("uncommon_surname");
      expect(result.rejection.fieldName).toBe("conversationSummary");
      expect(result.rejection.retryable).toBe(true);
    }
  });

  it("D. blocks invented other-client name absent from evidence", () => {
    const evidence = buildDevelopmentAuthorisedEvidenceText({
      approvedSummary: "Alex focused on delivery ownership.",
    });
    const result = evaluateDevelopmentGenerationAttempt({
      outputText: JSON.stringify({
        ...noChangePayload,
        conversationSummary:
          "Sarah Thompson should keep focusing on ownership this week.",
      }),
      isolationContext: {
        allowedClientName: "Alex Morgan",
        knownOtherNames: [otherClientName],
        authorisedNames: [evidence],
      },
      allowedSessionIds,
      attempt: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejection.code).toBe("DEVELOPMENT_CROSS_CLIENT");
    }
  });

  it("E. retry remains fail-closed for genuine non-grounded hit", () => {
    const evidence = buildDevelopmentAuthorisedEvidenceText({
      sessionNotes: "Alex discussed workload.",
    });
    const context = {
      allowedClientName: "Alex Morgan",
      knownOtherNames: [otherClientName],
      authorisedNames: [evidence],
    };
    const first = evaluateDevelopmentGenerationAttempt({
      outputText: JSON.stringify({
        ...noChangePayload,
        conversationSummary: "Sarah Thompson remains the focus.",
      }),
      isolationContext: context,
      allowedSessionIds,
      attempt: 1,
    });
    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.rejection.retryable).toBe(true);
    }

    const second = evaluateDevelopmentGenerationAttempt({
      outputText: JSON.stringify({
        ...noChangePayload,
        conversationSummary: "Thompson continues to dominate the narrative.",
      }),
      isolationContext: context,
      allowedSessionIds,
      attempt: 2,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.rejection.code).toBe("DEVELOPMENT_CROSS_CLIENT");
      expect(second.rejection.retryable).toBe(false);
      expect(second.rejection.existingProfilePreserved).toBe(true);
    }
  });

  it("F. successful isolation validation yields persistable generation", () => {
    const evidence = buildDevelopmentAuthorisedEvidenceText({
      sessionNotes: "Stakeholder Sarah Thompson was named in notes.",
      approvedSummary: "Agreed actions with Sarah Thompson.",
      commitments: "Follow up with Sarah Thompson next week.",
    });
    const result = evaluateDevelopmentGenerationAttempt({
      outputText: JSON.stringify({
        ...meaningfulPayload,
        conversationSummary:
          "Explored boundaries with stakeholder Sarah Thompson.",
      }),
      isolationContext: {
        allowedClientName: "Alex Morgan",
        knownOtherNames: [otherClientName],
        authorisedNames: ["Customer One", evidence],
      },
      allowedSessionIds,
      attempt: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Route persists only after evaluation.ok — assert generation is ready.
    expect(result.generation.hasMeaningfulChanges).toBe(true);
    expect(result.generation.conversationSummary).toMatch(/Sarah Thompson/);
    expect(result.generation.evidence[0]?.sessionId).toBe(sessionId);
  });

  it("G. other isolation consumers unchanged without authorised evidence", () => {
    const result = validateRelationshipIsolation(
      "Thompson remains hesitant about delegation.",
      {
        allowedClientName: "Alex Morgan",
        knownOtherNames: [otherClientName],
      }
    );
    expect(result.status).toBe("definite_cross_client");
    expect(result.matchType).toBe("uncommon_surname");
  });
});

describe("rejected content must not be treated as saved updates", () => {
  it("does not invent a development update id from a rejection", () => {
    const spy = vi.fn();
    const result = evaluateDevelopmentGenerationAttempt({
      outputText: "```\nnot valid\n```",
      isolationContext,
      allowedSessionIds: new Set(),
      attempt: 2,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      spy(result.rejection);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          existingProfilePreserved: true,
          code: "DEVELOPMENT_INVALID_JSON",
        })
      );
    }
  });
});
