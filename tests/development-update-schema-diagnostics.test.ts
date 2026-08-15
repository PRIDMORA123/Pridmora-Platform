import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  developmentRejectionResponseBody,
  evaluateDevelopmentGenerationAttempt,
} from "@/lib/development-updates/generate-validation";
import {
  normalizeDevelopmentUpdateModelPayload,
  parseDevelopmentUpdateGeneration,
} from "@/lib/development-updates/schema";

const isolationContext = {
  allowedClientName: "Alex Morgan",
  knownOtherNames: ["Daniel Roberts"],
};

const sessionId = "723840f1-8329-426a-a15b-aa91959c53c5";
const allowedSessionIds = new Set([sessionId]);

/** Session-4-like model shape that failed in production: update rows used from/to. */
function session4FromToPayload() {
  return {
    conversationSummary:
      "Alex self-reported recent project meetings: one where they stated a recommendation after preparing evidence, and one where senior colleagues were present and they held back.",
    hasMeaningfulChanges: true,
    proposedChanges: {
      strengths: {
        add: [],
        update: [
          {
            from: "Alex is beginning to act on sound project judgement.",
            to: "Alex is acting more often on sound project judgement and can offer a concrete recommendation when prepared.",
            reason:
              "Strengthened by a further self-reported example where the project lead asked Alex to coordinate next steps.",
          },
        ],
        remove: [],
      },
      emergingThemes: {
        add: [
          {
            value:
              "Preparation and evidence appear to help Alex contribute recommendations more confidently.",
            status: "emerging",
            reason: "Self-reported contrast between prepared and unprepared meetings.",
          },
        ],
        update: [
          {
            from:
              "The next stage of influencing is moving from identifying a problem to offering a clear recommendation.",
            to: "Alex is practising moving from identifying a problem to offering a clear recommendation, including with senior colleagues present.",
            reason: "Mixed Session 4 evidence and an explicit practice commitment.",
          },
        ],
        remove: [],
      },
      growthAreas: {
        add: [],
        update: [],
        remove: [],
      },
      patterns: {
        add: [
          {
            value:
              "When senior colleagues are present, Alex may wait for them to speak first even after noticing a sound recommendation.",
            status: "supported",
            reason: "Self-reported in the meeting with two senior colleagues.",
          },
        ],
        update: [],
        remove: [],
      },
      commitments: {
        add: [
          {
            value:
              "In the next relevant project discussion, deliberately state the recommendation and reasoning even when a more senior colleague is present.",
            dueDate: null,
          },
        ],
        complete: [],
        remove: [],
      },
    },
    evidence: [
      {
        changeKey: "strengths.update.0",
        evidenceText:
          "In one project meeting Alex recommended changing the order of two pieces of work and was asked to coordinate next steps.",
        sourceExcerpt: "recommended changing the order of two pieces of work",
        sessionId,
      },
      {
        changeKey: "patterns.add.0",
        evidenceText:
          "With senior colleagues present, Alex raised a concern but waited rather than making a recommendation.",
        sourceExcerpt: "waiting for one of the senior colleagues to respond",
        sessionId,
      },
    ],
  };
}

describe("Session 4 schema failure: from/to update shape", () => {
  it("identifies missing value on from/to update rows before normalisation", () => {
    const raw = session4FromToPayload();
    // Bypass normaliser by evaluating the structural mismatch directly.
    expect(raw.proposedChanges.strengths.update[0]).not.toHaveProperty("value");
    expect(raw.proposedChanges.strengths.update[0]).toHaveProperty("to");
  });

  it("normalises from/to update rows to value without inventing content", () => {
    const source = session4FromToPayload();
    const normalised = normalizeDevelopmentUpdateModelPayload(source) as {
      proposedChanges: {
        strengths: { update: Array<Record<string, unknown>> };
        emergingThemes: { update: Array<Record<string, unknown>> };
      };
    };
    expect(normalised.proposedChanges.strengths.update[0].value).toBe(
      source.proposedChanges.strengths.update[0].to
    );
    expect(normalised.proposedChanges.strengths.update[0]).not.toHaveProperty("to");
    expect(normalised.proposedChanges.strengths.update[0]).not.toHaveProperty("from");
    expect(String(normalised.proposedChanges.emergingThemes.update[0].value)).toContain(
      "practising moving from identifying a problem"
    );
  });

  it("parses Session-4-like from/to payload successfully after normalisation", () => {
    const parsed = parseDevelopmentUpdateGeneration(
      JSON.stringify(session4FromToPayload())
    );
    expect(parsed.hasMeaningfulChanges).toBe(true);
    expect(parsed.proposedChanges.strengths?.update?.[0]?.value).toMatch(
      /acting more often on sound project judgement/i
    );
    expect(parsed.evidence.length).toBeGreaterThan(0);
  });

  it("evaluate accepts Session-4-like from/to payload after mapper", () => {
    const result = evaluateDevelopmentGenerationAttempt({
      outputText: JSON.stringify(session4FromToPayload()),
      isolationContext,
      allowedSessionIds,
      attempt: 1,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.generation.hasMeaningfulChanges).toBe(true);
    }
  });
});

describe("schema validation diagnostics", () => {
  it("captures first Zod path safely for invalid fields", () => {
    const result = evaluateDevelopmentGenerationAttempt({
      outputText: JSON.stringify({
        conversationSummary: "Valid summary.",
        hasMeaningfulChanges: true,
        proposedChanges: {
          strengths: {
            add: [{ value: "x".repeat(501), status: "emerging", reason: "too long" }],
          },
        },
        evidence: [],
      }),
      isolationContext,
      allowedSessionIds,
      attempt: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejection.code).toBe("DEVELOPMENT_SCHEMA_INVALID");
      expect(result.rejection.fieldName).toBe(
        "proposedChanges.strengths.add.0.value"
      );
      expect(result.rejection.validationDiagnostic?.fieldPath).toBe(
        "proposedChanges.strengths.add.0.value"
      );
      expect(result.rejection.validationDiagnostic?.issueCode).toBe("too_big");
      expect(result.rejection.validationDiagnostic?.maximum).toBe(500);
      const serialised = JSON.stringify(result.rejection);
      expect(serialised).not.toMatch(/x{20}/);
      expect(serialised).not.toMatch(/too long/);
    }
  });

  it("returns structured 422 body for schema invalid without coaching text", () => {
    const evaluated = evaluateDevelopmentGenerationAttempt({
      outputText: JSON.stringify({
        conversationSummary: "",
        hasMeaningfulChanges: true,
        proposedChanges: {},
        evidence: [],
      }),
      isolationContext,
      allowedSessionIds,
      attempt: 2,
    });
    expect(evaluated.ok).toBe(false);
    if (evaluated.ok) return;

    expect(evaluated.rejection.retryable).toBe(false);
    const body = developmentRejectionResponseBody(evaluated.rejection);
    expect(body.rejectionCode).toBe("DEVELOPMENT_SCHEMA_INVALID");
    expect(body.stage).toBe("schema_validation");
    expect(body.fieldPath).toBe("conversationSummary");
    expect(body.issueCode).toBeTruthy();
    expect(JSON.stringify(body)).not.toMatch(/Alex|recommendation|project meeting/i);
  });

  it("keeps no_meaningful_change path unchanged", () => {
    const result = evaluateDevelopmentGenerationAttempt({
      outputText: JSON.stringify({
        conversationSummary: "A steady check-in with no new profile signals.",
        hasMeaningfulChanges: false,
        proposedChanges: {},
        evidence: [],
      }),
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

  it("keeps valid value-shaped updates unchanged", () => {
    const result = evaluateDevelopmentGenerationAttempt({
      outputText: JSON.stringify({
        conversationSummary: "Explored recommendation practise.",
        hasMeaningfulChanges: true,
        proposedChanges: {
          strengths: {
            add: [
              {
                value: "Can offer a concrete recommendation when prepared.",
                status: "emerging",
                reason: "Session example",
              },
            ],
            update: [],
            remove: [],
          },
        },
        evidence: [
          {
            changeKey: "strengths.add.0",
            evidenceText: "Recommended changing work order.",
            sourceExcerpt: "recommended changing",
            sessionId,
          },
        ],
      }),
      isolationContext,
      allowedSessionIds,
      attempt: 1,
    });
    expect(result.ok).toBe(true);
  });
});

describe("schema failure UI copy wiring", () => {
  it("surfaces schema-specific modal copy without Zod internals", () => {
    const workspace = readFileSync(
      resolve("components/session-workspace.tsx"),
      "utf8"
    );
    expect(workspace).toContain("schema_invalid");
    expect(workspace).toContain("Development update could not be prepared");
    expect(workspace).toContain(
      "did not meet the required development-evidence format"
    );
    expect(workspace).toContain("DEVELOPMENT_SCHEMA_INVALID");
    expect(workspace).not.toMatch(/ZodIssue|too_big|fieldPath\}/);
  });

  it("persists validation diagnostic fields on rejection audit write", () => {
    const repo = readFileSync(
      resolve("lib/development-updates/repository.ts"),
      "utf8"
    );
    expect(repo).toContain("validationDiagnostic");
    expect(repo).toContain("fieldPath");
    expect(repo).toContain("issueCode");
  });
});
