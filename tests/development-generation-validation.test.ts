import { describe, expect, it, vi } from "vitest";
import {
  buildDevelopmentRetryPromptAddon,
  developmentRejectionResponseBody,
  evaluateDevelopmentGenerationAttempt,
  normalizeDevelopmentModelText,
  validateDevelopmentEvidenceReferences,
} from "@/lib/development-updates/generate-validation";
import { parseDevelopmentUpdateGeneration } from "@/lib/development-updates/schema";

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
    expect(source).toContain("recordDevelopmentGenerationRejection");
    expect(source).not.toContain("markDevelopmentUpdateFailed");
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
