import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildScopedPreparationRequestState,
  evaluatePreparationIsolationAttempt,
} from "@/lib/coaching-intelligence/preparation-isolation";
import {
  containsUnexpectedPersonName,
  getPrepareQueryKey,
  validateRelationshipIsolation,
} from "@/lib/relationship-scope";
import {
  evaluateDevelopmentGenerationAttempt,
} from "@/lib/development-updates/generate-validation";
import {
  buildSessionModuleRoute,
} from "@/lib/session-module-route";
import {
  runCreateSummaryInsightsFlow,
} from "@/lib/session/create-summary-insights-flow";
import { nextSessionNumber } from "@/lib/sessions";

const prepRouteSource = readFileSync(
  resolve(process.cwd(), "app/api/preparation/generate/route.ts"),
  "utf8"
);
const developmentRouteSource = readFileSync(
  resolve(process.cwd(), "app/api/development-updates/generate/route.ts"),
  "utf8"
);
const coachingPrepareSource = readFileSync(
  resolve(process.cwd(), "app/api/coaching-intelligence/prepare/route.ts"),
  "utf8"
);

describe("multi-client reliability — explicit session requirements", () => {
  it("requires clientId and sessionId on preparation generate", () => {
    expect(prepRouteSource).toMatch(/clientId and sessionId are required/);
    expect(prepRouteSource).toMatch(/body\.sessionId/);
    expect(prepRouteSource).not.toMatch(/newestSession\(/);
    expect(prepRouteSource).not.toMatch(/latestSessionId/);
  });

  it("requires relationshipId and conversationId on coaching-intelligence prepare", () => {
    expect(coachingPrepareSource).toMatch(/relationshipId/);
    expect(coachingPrepareSource).toMatch(/conversationId/);
    expect(coachingPrepareSource).not.toMatch(/latestSession/);
  });

  it("requires clientId and sessionId on development generate", () => {
    expect(developmentRouteSource).toMatch(/clientId and sessionId are required/);
    expect(developmentRouteSource).toMatch(/DEVELOPMENT_SESSION_NOT_COMPLETE/);
    expect(developmentRouteSource).not.toMatch(/latestSessionId/);
  });

  it("rejects Summary & Insights routing without an explicit session id", () => {
    expect(() =>
      buildSessionModuleRoute({
        relationshipId: "rel-1",
        sessionId: "",
        module: "identity_intelligence",
      })
    ).toThrow(/session ID/i);
  });

  it("keeps Create Summary & Insights on the same session id", async () => {
    const result = await runCreateSummaryInsightsFlow({
      relationshipId: "rel-1",
      sessionId: "session-3",
      saveNotes: async () => ({ id: "session-3" }),
      generateSummary: async sessionId => {
        expect(sessionId).toBe("session-3");
        return { ok: true };
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sessionId).toBe("session-3");
      expect(result.route.sessionId).toBe("session-3");
      expect(result.route.path).toContain("session-3");
      expect(result.route.path).not.toContain("session-1");
    }
  });
});

describe("multi-client reliability — cache keys", () => {
  it("includes coach, relationship and session in prepare cache keys", () => {
    const key = getPrepareQueryKey("coach-a", "rel-a", "session-a", "rev-1");
    expect(key).toEqual(["prepare", "coach-a", "", "rel-a", "session-a", "rev-1"]);

    const scopedA = buildScopedPreparationRequestState({
      coachId: "coach-a",
      organisationId: "org-a",
      relationshipId: "rel-a",
      sessionId: "session-a",
      evidenceRevision: "rev-1",
      clientDisplayName: "Sarah Thompson",
      authorisedEvidence: "QA-SARAH-DELEGATION",
    });
    const scopedB = buildScopedPreparationRequestState({
      coachId: "coach-a",
      organisationId: "org-a",
      relationshipId: "rel-b",
      sessionId: "session-b",
      evidenceRevision: "rev-1",
      clientDisplayName: "Daniel Reed",
      authorisedEvidence: "QA-DREED-ACCOUNTABILITY",
    });
    expect(scopedA.cacheKey).not.toBe(scopedB.cacheKey);
    expect(scopedA.cacheKey).toContain("rel-a");
    expect(scopedA.cacheKey).toContain("session-a");
    expect(scopedA.cacheKey).toContain("org-a");
  });
});

describe("multi-organisation reliability — cache isolation", () => {
  it("separates identical relationship ids across organisations", () => {
    const a = buildScopedPreparationRequestState({
      coachId: "coach-a",
      organisationId: "org-a",
      relationshipId: "rel-shared-shape",
      sessionId: "session-1",
      evidenceRevision: "rev-1",
      clientDisplayName: "Alex",
      authorisedEvidence: "ORG-A",
    });
    const b = buildScopedPreparationRequestState({
      coachId: "coach-a",
      organisationId: "org-b",
      relationshipId: "rel-shared-shape",
      sessionId: "session-1",
      evidenceRevision: "rev-1",
      clientDisplayName: "Alex",
      authorisedEvidence: "ORG-B",
    });
    expect(a.cacheKey).not.toBe(b.cacheKey);
  });
});

describe("multi-client reliability — name isolation", () => {
  const others = ["Sarah Thompson", "Daniel Reed", "Daniel Roberts"];

  it("does not false-positive on common first names alone", () => {
    const result = validateRelationshipIsolation(
      "Daniel agreed to create greater ownership with managers.",
      {
        allowedClientName: "Daniel Roberts",
        knownOtherNames: ["Daniel Reed", "Sarah Thompson"],
      }
    );
    expect(result.status).not.toBe("definite_cross_client");
  });

  it("rejects definite full-name crossover", () => {
    expect(
      containsUnexpectedPersonName(
        "Focus next on Sarah Thompson and her board pack.",
        "Daniel Roberts",
        others.filter(n => n !== "Daniel Roberts")
      )
    ).toBe(true);

    const check = validateRelationshipIsolation(
      "Sarah Thompson described feeling stuck.",
      {
        allowedClientName: "Daniel Reed",
        knownOtherNames: ["Sarah Thompson", "Daniel Roberts"],
      }
    );
    expect(check.status).toBe("definite_cross_client");
  });

  it("keeps simultaneous client preparations isolated via scoped state", () => {
    const states = ["Sarah Thompson", "Daniel Reed", "Daniel Roberts"].map(
      (name, index) =>
        buildScopedPreparationRequestState({
          coachId: "coach-1",
          relationshipId: `rel-${index}`,
          sessionId: `session-${index}`,
          evidenceRevision: "r1",
          clientDisplayName: name,
          authorisedEvidence: `evidence-for-${name}`,
        })
    );
    const keys = new Set(states.map(s => s.cacheKey));
    expect(keys.size).toBe(3);
    expect(states.map(s => s.promptClientName)).toEqual([
      "Sarah Thompson",
      "Daniel Reed",
      "Daniel Roberts",
    ]);
  });

  it("rejects unsafe preparation output and allows exactly one retry", () => {
    const context = {
      allowedClientName: "Daniel Roberts",
      knownOtherNames: ["Daniel Reed", "Sarah Thompson"],
    };
    const first = evaluatePreparationIsolationAttempt({
      draftText: "Previously Sarah Thompson struggled with conflict.",
      context,
      attempt: 1,
    });
    expect(first.maySave).toBe(false);
    expect(first.shouldRetry).toBe(true);

    const second = evaluatePreparationIsolationAttempt({
      draftText: "Previously Sarah Thompson struggled with conflict.",
      context,
      attempt: 2,
    });
    expect(second.maySave).toBe(false);
    expect(second.shouldRetry).toBe(false);
  });
});

describe("multi-client reliability — development guards", () => {
  const sessionId = "55330765-5218-4130-bf29-46e252b586e5";
  const isolationContext = {
    allowedClientName: "Daniel Reed",
    knownOtherNames: ["Daniel Roberts", "Sarah Thompson"],
  };

  it("treats no meaningful change as success", () => {
    const result = evaluateDevelopmentGenerationAttempt({
      outputText: JSON.stringify({
        conversationSummary: "Steady check-in.",
        hasMeaningfulChanges: false,
        proposedChanges: {},
        evidence: [],
      }),
      isolationContext,
      allowedSessionIds: new Set([sessionId]),
      attempt: 1,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.generation.hasMeaningfulChanges).toBe(false);
    }
  });

  it("never marks cross-client development output as savable", () => {
    const result = evaluateDevelopmentGenerationAttempt({
      outputText: JSON.stringify({
        conversationSummary: "Sarah Thompson owns this theme.",
        hasMeaningfulChanges: true,
        proposedChanges: {
          emergingThemes: {
            add: [
              {
                value: "Conflict avoidance",
                status: "emerging",
                reason: "Named Sarah Thompson",
              },
            ],
            update: [],
            remove: [],
          },
        },
        evidence: [
          {
            changeKey: "emergingThemes.add.0",
            evidenceText: "Sarah Thompson avoided the conversation.",
            sourceExcerpt: "avoided",
            sessionId,
          },
        ],
      }),
      isolationContext,
      allowedSessionIds: new Set([sessionId]),
      attempt: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejection.code).toBe("DEVELOPMENT_CROSS_CLIENT");
    }
  });

  it("documents planned-session rejection in the generate route", () => {
    expect(developmentRouteSource).toContain("DEVELOPMENT_SESSION_NOT_COMPLETE");
    expect(developmentRouteSource).toMatch(/completed[\s\S]*awaiting_completion/);
  });
});

describe("multi-client reliability — session numbering under concurrency", () => {
  it("computes unique next session numbers from the highest existing number", () => {
    const existing = [{ sessionNumber: 1 }, { sessionNumber: 2 }, { sessionNumber: 4 }];
    expect(nextSessionNumber(existing)).toBe(5);
    // Concurrent callers must still read the same max before insert; uniqueness
    // is enforced by the DB unique (client_id, session_number) constraint.
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/schema.sql"),
      "utf8"
    );
    expect(migration).toMatch(/unique\s*\(\s*client_id\s*,\s*session_number\s*\)/i);
  });
});

describe("multi-client reliability — skipped summaries remain available", () => {
  it("keeps identity_intelligence available when summary is not_generated", async () => {
    const { deriveSessionWorkspaceState } = await import(
      "@/lib/relationship-workspace/session-workspace-state"
    );
    const { createBlankSession } = await import("@/lib/sessions");
    const session = {
      ...createBlankSession({
        id: "session-3",
        clientId: "rel-1",
        coachId: "coach-1",
        sessionNumber: 3,
        status: "awaiting_completion",
      }),
      notes: "Notes present",
      reflectWhatSurprised: "Shift noticed",
      summaryStatus: "not_generated" as const,
      summary: "",
    };
    const state = deriveSessionWorkspaceState(session);
    const intel = state.modules.find(m => m.id === "identity_intelligence");
    expect(intel?.available).toBe(true);
  });
});

describe("multi-client reliability — duplicate generation idempotency contract", () => {
  it("uses upsert on session_id for development updates", () => {
    const repo = readFileSync(
      resolve(process.cwd(), "lib/development-updates/repository.ts"),
      "utf8"
    );
    expect(repo).toMatch(/onConflict:\s*["']session_id["']/);
    expect(repo).toMatch(/upsertDevelopmentUpdateFromGeneration/);
  });
});
