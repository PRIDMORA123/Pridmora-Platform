/**
 * Targeted reliability tests for Development Evidence analyse → review →
 * capability inference (zero-observation failure + bounded source-text inference).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  boundExtractedTextForCapabilityInference,
  buildCapabilityInferenceCorpus,
  CAPABILITY_INFERENCE_SOURCE_TEXT_MAX_CHARS,
  inferCapabilityKeysFromText,
} from "@/lib/development-evidence/capabilities";
import {
  EVIDENCE_ANALYSIS_ATTEMPT_TIMEOUT_MS,
  EVIDENCE_ANALYSIS_CLIENT_TIMEOUT_MS,
  EVIDENCE_ANALYSIS_MAX_COMPLETION_TOKENS,
  EVIDENCE_ANALYSIS_MAX_OBSERVATIONS,
  EVIDENCE_ANALYSIS_MAX_OBSERVATIONS_PSYCHOMETRIC,
  EVIDENCE_ANALYSIS_ROUTE_MAX_DURATION_SECONDS,
} from "@/lib/development-evidence/constants";
import {
  constrainStructuredEvidenceObservations,
} from "@/lib/development-evidence/constrain-observations";
import {
  EVIDENCE_ANALYSIS_MAX_ATTEMPTS,
  ZERO_OBSERVATION_ANALYSIS_USER_MESSAGE,
  hasUsableAnalysisObservations,
} from "@/lib/development-evidence/analyse";
import { buildEvidenceAiContext } from "@/lib/development-evidence/ai-context";

const root = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("analyse request budget coherence", () => {
  it("uses a per-attempt timeout above the prior 20s abort and stays under the route", () => {
    expect(EVIDENCE_ANALYSIS_ATTEMPT_TIMEOUT_MS).toBe(25_000);
    expect(EVIDENCE_ANALYSIS_ATTEMPT_TIMEOUT_MS).toBeGreaterThan(20_000);
    expect(EVIDENCE_ANALYSIS_MAX_ATTEMPTS).toBe(2);

    const twoAttemptAiMs =
      EVIDENCE_ANALYSIS_MAX_ATTEMPTS * EVIDENCE_ANALYSIS_ATTEMPT_TIMEOUT_MS;
    const routeMs = EVIDENCE_ANALYSIS_ROUTE_MAX_DURATION_SECONDS * 1000;
    expect(twoAttemptAiMs).toBe(50_000);
    expect(twoAttemptAiMs).toBeLessThan(routeMs);
    expect(EVIDENCE_ANALYSIS_CLIENT_TIMEOUT_MS).toBeGreaterThanOrEqual(
      twoAttemptAiMs
    );
    expect(EVIDENCE_ANALYSIS_CLIENT_TIMEOUT_MS).toBeLessThanOrEqual(routeMs);
    expect(EVIDENCE_ANALYSIS_CLIENT_TIMEOUT_MS).toBeGreaterThan(25_000);
  });

  it("uses a reduced completion-token budget sized for constrained observations", () => {
    expect(EVIDENCE_ANALYSIS_MAX_COMPLETION_TOKENS).toBe(900);
    expect(EVIDENCE_ANALYSIS_MAX_COMPLETION_TOKENS).toBeLessThan(2000);
    expect(EVIDENCE_ANALYSIS_MAX_COMPLETION_TOKENS).toBeGreaterThan(600);
    expect(EVIDENCE_ANALYSIS_MAX_OBSERVATIONS).toBe(3);
    expect(EVIDENCE_ANALYSIS_MAX_OBSERVATIONS_PSYCHOMETRIC).toBe(5);
  });

  it("wires analyse and UI to the shared budget constants", () => {
    const analyse = read("lib/development-evidence/analyse.ts");
    const view = read(
      "components/development-evidence/development-evidence-view.tsx"
    );
    const route = read(
      "app/api/development-evidence/item/[evidenceId]/analyse/route.ts"
    );

    expect(analyse).toContain("EVIDENCE_ANALYSIS_ATTEMPT_TIMEOUT_MS");
    expect(analyse).toContain("EVIDENCE_ANALYSIS_MAX_COMPLETION_TOKENS");
    expect(analyse).toContain("constrainStructuredEvidenceObservations");
    expect(analyse).toContain(
      "AbortSignal.timeout(EVIDENCE_ANALYSIS_ATTEMPT_TIMEOUT_MS)"
    );
    expect(analyse).toContain(
      "max_tokens: EVIDENCE_ANALYSIS_MAX_COMPLETION_TOKENS"
    );
    expect(analyse).not.toMatch(/max_tokens:\s*1200\b/);
    expect(analyse).not.toMatch(/max_tokens:\s*2_?000\b/);
    expect(analyse).not.toMatch(/AbortSignal\.timeout\(\s*20_000\s*\)/);
    expect(analyse).toMatch(
      /OPENAI_EVIDENCE_MODEL\?\.trim\(\)\s*\|\|\s*"gpt-4\.1-mini"/
    );
    expect(analyse).toContain("EVIDENCE_ANALYSIS_SYSTEM_PROMPT");

    expect(view).toContain("EVIDENCE_ANALYSIS_CLIENT_TIMEOUT_MS");
    expect(view).toContain(
      "ANALYSE_REQUEST_TIMEOUT_MS = EVIDENCE_ANALYSIS_CLIENT_TIMEOUT_MS"
    );
    expect(view).not.toMatch(
      /const ANALYSE_REQUEST_TIMEOUT_MS\s*=\s*25_000/
    );

    expect(route).toContain("maxDuration = 60");
  });

  it("does not change model, provider wiring, or prompt module identity stack", () => {
    const analyse = read("lib/development-evidence/analyse.ts");
    const prompt = read("lib/ai/evidence-analysis-prompt.ts");
    expect(analyse).toContain('from "openai"');
    expect(analyse).toContain("new OpenAI({ apiKey: key })");
    expect(analyse).not.toContain("anthropic");
    expect(prompt).toContain("EVIDENCE_ANALYSIS_SYSTEM_PROMPT");
    expect(prompt).toContain("IDENTITY_SYSTEM_PROMPT");
  });
});

describe("zero-observation analysis quality", () => {
  it("treats empty and title-only observations as unusable", () => {
    expect(hasUsableAnalysisObservations({ observations: [] })).toBe(false);
    expect(
      hasUsableAnalysisObservations({
        observations: [{ title: "Signal", description: "   " }],
      })
    ).toBe(false);
    expect(
      hasUsableAnalysisObservations({
        observations: [{ title: "", description: "Has text" }],
      })
    ).toBe(false);
  });

  it("accepts observations with both title and description", () => {
    expect(
      hasUsableAnalysisObservations({
        observations: [
          {
            title: "Ownership follow-through",
            description: "Holds commitments after handover.",
          },
        ],
      })
    ).toBe(true);
  });

  it("uses a bounded retry of two attempts and fails into processing_status failed", () => {
    const analyse = read("lib/development-evidence/analyse.ts");
    expect(EVIDENCE_ANALYSIS_MAX_ATTEMPTS).toBe(2);
    expect(analyse).toContain("EVIDENCE_ANALYSIS_MAX_ATTEMPTS");
    expect(analyse).toContain("markEvidenceAnalysisFailed");
    expect(analyse).toContain("ZERO_OBSERVATION_ANALYSIS_USER_MESSAGE");
    expect(analyse).toContain("hasUsableAnalysisObservations");
    expect(analyse).not.toMatch(
      /sourceSummary\s*=\s*[\s\S]{0,80}Aurelia proposed observations for human review[\s\S]{0,120}saveAnalysedEvidence/
    );
    expect(analyse).toMatch(
      /if\s*\(\s*!succeeded\s*\)[\s\S]*?markEvidenceAnalysisFailed[\s\S]*?throw new Error\(ZERO_OBSERVATION_ANALYSIS_USER_MESSAGE\)/
    );
  });

  it("refuses to persist zero-observation analysis as ready", () => {
    const repository = read("lib/development-evidence/repository.ts");
    expect(repository).toContain(
      "Cannot save analysed evidence without usable observations."
    );
    expect(repository).toMatch(
      /processing_status:\s*"ready"[\s\S]*?include_in_intelligence:\s*false/
    );
  });
});

describe("analyseEvidenceDocument zero-observation behaviour", () => {
  const evidenceId = "ev-1";
  const extractedText =
    "Manager notes on accountability, ownership of outcomes, and follow-through after handover across the delivery team. ".repeat(
      3
    );

  beforeEach(() => {
    vi.resetModules();
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });

  it("retries once then marks failed without calling saveAnalysedEvidence", async () => {
    const markEvidenceAnalysisFailed = vi.fn(async () => undefined);
    const saveAnalysedEvidence = vi.fn(async () => {
      throw new Error("saveAnalysedEvidence must not be called");
    });
    const recordEvidenceAiUsage = vi.fn(async () => undefined);
    const create = vi.fn(async () => ({
      model: "gpt-test",
      usage: { prompt_tokens: 10, completion_tokens: 5 },
      choices: [
        {
          message: {
            content: JSON.stringify({
              observations: [],
              capabilitySignals: [],
            }),
          },
        },
      ],
    }));

    vi.doMock("@/lib/development-evidence/repository", () => ({
      getEvidenceById: vi.fn(async () => ({
        evidence: {
          id: evidenceId,
          organisationId: "org-1",
          clientId: "client-1",
          evidenceType: "manager_observation",
          evidenceDate: "2026-08-01",
          purpose: null,
          contentHash: "hash-1",
          processingStatus: "extracted",
          structuredEvidence: { observations: [] },
          sourceSummary: null,
        },
        document: {
          fileName: "notes.txt",
          extractedText,
        },
        observations: [],
      })),
      findExistingByContentHash: vi.fn(async () => null),
      listEvidenceForClient: vi.fn(async () => []),
      beginEvidenceAnalysisRun: vi.fn(async () => ({
        invalidatedPriorAuthorisation: false,
      })),
      markEvidenceAnalysisFailed,
      recordEvidenceAiUsage,
      saveAnalysedEvidence,
    }));

    vi.doMock("openai", () => ({
      default: class {
        chat = { completions: { create } };
      },
    }));

    const { analyseEvidenceDocument, ZERO_OBSERVATION_ANALYSIS_USER_MESSAGE: msg } =
      await import("@/lib/development-evidence/analyse");

    await expect(
      analyseEvidenceDocument({
        supabase: {
          from: () => ({
            update: () => ({
              eq: () => ({
                is: async () => ({ error: null }),
              }),
            }),
          }),
        } as never,
        userId: "user-1",
        evidenceId,
        client: { name: "Alex" },
      })
    ).rejects.toThrow(msg);

    expect(create).toHaveBeenCalledTimes(EVIDENCE_ANALYSIS_MAX_ATTEMPTS);
    const firstCall = create.mock.calls[0] as unknown as [
      { max_tokens?: number },
      { signal?: AbortSignal },
    ];
    expect(firstCall[0]?.max_tokens).toBe(
      EVIDENCE_ANALYSIS_MAX_COMPLETION_TOKENS
    );
    expect(firstCall[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(markEvidenceAnalysisFailed).toHaveBeenCalledWith(
      expect.objectContaining({ evidenceId })
    );
    expect(saveAnalysedEvidence).not.toHaveBeenCalled();
  });

  it("does not treat placeholder-ready empty analysis as reusable success", async () => {
    const saveAnalysedEvidence = vi.fn(async () => ({
      evidence: {
        id: evidenceId,
        structuredEvidence: {
          observations: [
            {
              title: "Follow-through",
              description: "Keeps ownership after commitments.",
            },
          ],
        },
      },
      observations: [],
    }));
    const create = vi.fn(async () => ({
      model: "gpt-test",
      usage: { prompt_tokens: 1, completion_tokens: 1 },
      choices: [
        {
          message: {
            content: JSON.stringify({
              observations: [
                {
                  title: "Follow-through",
                  description: "Keeps ownership after commitments.",
                },
              ],
            }),
          },
        },
      ],
    }));

    vi.doMock("@/lib/development-evidence/repository", () => ({
      getEvidenceById: vi.fn(async () => ({
        evidence: {
          id: evidenceId,
          organisationId: "org-1",
          clientId: "client-1",
          evidenceType: "manager_observation",
          evidenceDate: "2026-08-01",
          purpose: null,
          contentHash: "hash-empty",
          processingStatus: "ready",
          structuredEvidence: { observations: [] },
          sourceSummary: "Aurelia proposed observations for human review.",
        },
        document: {
          fileName: "notes.txt",
          extractedText,
        },
        observations: [],
      })),
      findExistingByContentHash: vi.fn(async () => null),
      listEvidenceForClient: vi.fn(async () => []),
      beginEvidenceAnalysisRun: vi.fn(async () => ({
        invalidatedPriorAuthorisation: false,
      })),
      markEvidenceAnalysisFailed: vi.fn(async () => undefined),
      recordEvidenceAiUsage: vi.fn(async () => undefined),
      saveAnalysedEvidence,
    }));

    vi.doMock("openai", () => ({
      default: class {
        chat = { completions: { create } };
      },
    }));

    const { analyseEvidenceDocument } = await import(
      "@/lib/development-evidence/analyse"
    );

    const result = await analyseEvidenceDocument({
      supabase: {
        from: () => ({
          update: () => ({
            eq: () => ({
              is: async () => ({ error: null }),
            }),
          }),
        }),
      } as never,
      userId: "user-1",
      evidenceId,
      client: { name: "Alex" },
    });

    expect(result.reusedExistingAnalysis).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
    expect(saveAnalysedEvidence).toHaveBeenCalled();
  });
});

describe("capability inference corpus", () => {
  it("infers from summary and observation text without source text", () => {
    const corpus = buildCapabilityInferenceCorpus({
      sourceSummary: "Shows strong accountability on delivery outcomes.",
      observations: [
        {
          title: "Ownership",
          description: "Takes ownership when plans slip.",
        },
      ],
      capabilitySignals: ["follow through"],
    });
    const keys = inferCapabilityKeysFromText(corpus);
    expect(keys).toContain("accountability");
    expect(keys).toContain("ownership");
  });

  it("includes a bounded slice of authorised extracted source text", () => {
    const sourceOnly =
      "The conversation centred on psychological safety and making it safe to speak up in the team.";
    const withoutSource = inferCapabilityKeysFromText(
      buildCapabilityInferenceCorpus({
        sourceSummary: "Brief note.",
        observations: [{ title: "Note", description: "Limited summary." }],
      })
    );
    const withSource = inferCapabilityKeysFromText(
      buildCapabilityInferenceCorpus({
        sourceSummary: "Brief note.",
        observations: [{ title: "Note", description: "Limited summary." }],
        extractedSourceText: sourceOnly,
      })
    );
    expect(withoutSource).not.toContain("psychological_safety");
    expect(withSource).toContain("psychological_safety");
  });

  it("bounds extracted source text length", () => {
    const long = "word ".repeat(CAPABILITY_INFERENCE_SOURCE_TEXT_MAX_CHARS);
    const bounded = boundExtractedTextForCapabilityInference(long);
    expect(bounded.length).toBeLessThanOrEqual(
      CAPABILITY_INFERENCE_SOURCE_TEXT_MAX_CHARS
    );
  });

  it("wires extracted source text into saveAnalysedEvidence inference", () => {
    const repository = read("lib/development-evidence/repository.ts");
    expect(repository).toContain("buildCapabilityInferenceCorpus");
    expect(repository).toContain("extractedSourceText");
    expect(repository).toContain("include_in_intelligence: false");
    expect(repository).toContain('review_status: "pending_review"');
  });
});

describe("human authorisation and MDI exclusions", () => {
  it("requires human review before include_in_intelligence can become true", () => {
    const repository = read("lib/development-evidence/repository.ts");
    const saveBlock = repository.slice(
      repository.indexOf("export async function saveAnalysedEvidence"),
      repository.indexOf("export async function reviewEvidence")
    );
    expect(saveBlock).toContain("include_in_intelligence: false");
    expect(saveBlock).not.toMatch(/include_in_intelligence:\s*true/);

    const authorised = read(
      "lib/development-evidence/authorised-observations.ts"
    );
    expect(authorised).toContain("includeInIntelligence");
  });

  it("keeps excluded evidence types out of MDI capability loading", () => {
    const load = read("lib/manager-development-intelligence/load-signals.ts");
    expect(load).toContain("personal_reflection");
    expect(load).toContain("EXCLUDED_EVIDENCE_TYPES");
    expect(load).toContain("include_in_intelligence");
    expect(load).toMatch(
      /\.eq\(\s*"include_in_intelligence"\s*,\s*true\s*\)/
    );
  });

  it("has no Westbridge-specific capability inference behaviour", () => {
    const capabilities = read("lib/development-evidence/capabilities.ts");
    const analyse = read("lib/development-evidence/analyse.ts");
    const repository = read("lib/development-evidence/repository.ts");
    for (const source of [capabilities, analyse, repository]) {
      expect(source.toLowerCase()).not.toContain("westbridge");
      expect(source.toLowerCase()).not.toContain("helen walsh");
      expect(source.toLowerCase()).not.toContain("lucy morgan");
    }
  });
});

describe("constrained observation output", () => {
  it("deterministically caps oversized normal evidence arrays at 3 usable observations", () => {
    const oversized = {
      observations: Array.from({ length: 8 }, (_, index) => ({
        title: `Signal ${index + 1}`,
        description: `Evidence-backed development note ${index + 1}.`,
        behaviouralEvidence: `Support ${index + 1}`,
        developmentImplication: `Explore ${index + 1}`,
        assessmentContext: "should be stripped for normal evidence",
        capabilityKey: index % 2 === 0 ? "accountability" : "delegation",
      })),
    };
    const constrained = constrainStructuredEvidenceObservations(
      oversized,
      "manager_observation"
    );
    expect(constrained.observations).toHaveLength(
      EVIDENCE_ANALYSIS_MAX_OBSERVATIONS
    );
    expect(constrained.observations?.[0]?.title).toBe("Signal 1");
    expect(constrained.observations?.[2]?.title).toBe("Signal 3");
    expect(constrained.observations?.[0]?.capabilityKey).toBe("accountability");
    expect(constrained.observations?.[0]?.behaviouralEvidence).toBe("Support 1");
    expect(constrained.observations?.[0]?.developmentImplication).toBe(
      "Explore 1"
    );
    expect(constrained.observations?.[0]?.assessmentContext).toBeUndefined();
  });

  it("keeps assessmentContext for psychometric evidence while still bounding count", () => {
    const oversized = {
      observations: Array.from({ length: 7 }, (_, index) => ({
        title: `Preference ${index + 1}`,
        description: `Assessment signal ${index + 1}.`,
        assessmentContext: "Interpret as preference evidence only.",
      })),
    };
    const constrained = constrainStructuredEvidenceObservations(oversized, "disc");
    expect(constrained.observations).toHaveLength(
      EVIDENCE_ANALYSIS_MAX_OBSERVATIONS_PSYCHOMETRIC
    );
    expect(constrained.observations?.[0]?.assessmentContext).toMatch(
      /preference/i
    );
  });

  it("skips empty observations when selecting the capped set", () => {
    const mixed = {
      observations: [
        { title: "", description: "" },
        {
          title: "Ownership follow-through",
          description: "Keeps commitments after handover.",
          behaviouralEvidence: "Closed the fault without chasing.",
          capabilityKey: "accountability",
        },
        { title: "Only title", description: "   " },
        {
          title: "Delegation held",
          description: "Did not reclaim the task.",
          capabilityKey: "delegation",
        },
        {
          title: "Third usable",
          description: "Named the owner in the note.",
        },
        {
          title: "Fourth usable ignored",
          description: "Should be dropped by the cap.",
        },
      ],
    };
    const constrained = constrainStructuredEvidenceObservations(
      mixed,
      "other_document"
    );
    expect(constrained.observations).toHaveLength(3);
    expect(constrained.observations?.map(o => o.title)).toEqual([
      "Ownership follow-through",
      "Delegation held",
      "Third usable",
    ]);
  });

  it("prompt hard-limits normal evidence to three observations without assessmentContext", () => {
    const context = buildEvidenceAiContext({
      client: { name: "Alex", organisation: "Example" },
      document: {
        evidenceType: "appraisal_review",
        extractedText:
          "Manager notes on ownership, follow-through after handover, and clearer asks across the delivery team. ".repeat(
            3
          ),
      },
    });
    expect(context.userPrompt).toContain("Hard limit: at most 3 observations.");
    expect(context.userPrompt).toContain("Do not include assessmentContext.");
    expect(context.userPrompt).not.toContain(
      "Prefer fewer high-quality observations."
    );
  });

  it("prompt retains psychometric assessment framing with a bounded observation limit", () => {
    const context = buildEvidenceAiContext({
      client: { name: "Alex", organisation: "Example" },
      document: {
        evidenceType: "disc",
        extractedText:
          "DISC report suggests a preference for direct communication under operational pressure across stakeholder meetings. ".repeat(
            3
          ),
      },
    });
    expect(context.userPrompt).toContain("Hard limit: at most 5 observations.");
    expect(context.userPrompt).toContain("assessmentContext");
    expect(context.userPrompt).toMatch(/preference\/contextual/i);
  });
});

describe("zero-observation user messaging", () => {
  it("exposes an actionable safe failure message", () => {
    expect(ZERO_OBSERVATION_ANALYSIS_USER_MESSAGE).toMatch(/retry analysis/i);
    expect(ZERO_OBSERVATION_ANALYSIS_USER_MESSAGE).toMatch(
      /No observations were manufactured/i
    );
  });
});
