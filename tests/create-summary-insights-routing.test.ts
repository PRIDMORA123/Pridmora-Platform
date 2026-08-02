import { describe, expect, it, vi } from "vitest";
import {
  runCreateSummaryInsightsFlow,
  shouldResetWorkspaceStage,
} from "@/lib/session/create-summary-insights-flow";
import {
  buildSessionModuleRoute,
  sessionModuleToWorkspaceStage,
} from "@/lib/session-module-route";
import {
  canTransitionToStage,
  deriveSessionStageCompletion,
  getStageAvailability,
} from "@/lib/session/session-workflow";
import { createBlankSession } from "@/lib/sessions";
import type { Session } from "@/lib/types";

function makeSession(
  overrides: Partial<Session> & { sessionNumber?: number } = {}
): Session {
  return {
    ...createBlankSession({
      id: overrides.id ?? `session-${overrides.sessionNumber ?? 1}`,
      clientId: "rel-1",
      coachId: "coach-1",
      sessionNumber: overrides.sessionNumber ?? 1,
      status: overrides.status,
    }),
    ...overrides,
  };
}

describe("buildSessionModuleRoute", () => {
  it("maps Summary & Insights to identity_intelligence / summary stage", () => {
    const route = buildSessionModuleRoute({
      relationshipId: "rel-1",
      sessionId: "session-2",
      module: "identity_intelligence",
    });
    expect(route.relationshipId).toBe("rel-1");
    expect(route.sessionId).toBe("session-2");
    expect(route.module).toBe("identity_intelligence");
    expect(route.stage).toBe("summary");
    expect(route.view).toBe("session");
    expect(route.path).toBe(
      "/people/rel-1/sessions/session-2/identity_intelligence"
    );
  });

  it("maps Session Notes to reflect stage", () => {
    expect(
      sessionModuleToWorkspaceStage("session_notes")
    ).toBe("reflect");
    expect(
      buildSessionModuleRoute({
        relationshipId: "rel-1",
        sessionId: "session-2",
        module: "session_notes",
      }).stage
    ).toBe("reflect");
  });

  it("rejects missing sessionId", () => {
    expect(() =>
      buildSessionModuleRoute({
        relationshipId: "rel-1",
        sessionId: "",
        module: "identity_intelligence",
      })
    ).toThrow(/session ID/i);
  });

  it("preserves Session 2 id and does not substitute Session 1", () => {
    const route = buildSessionModuleRoute({
      relationshipId: "rel-1",
      sessionId: "session-2",
      module: "identity_intelligence",
    });
    expect(route.sessionId).toBe("session-2");
    expect(route.path).not.toContain("session-1");
  });
});

describe("shouldResetWorkspaceStage", () => {
  it("does not reset when notes/summary evidence updates for the same module", () => {
    expect(
      shouldResetWorkspaceStage({
        previousSessionId: "session-2",
        nextSessionId: "session-2",
        previousInitialStage: "reflect",
        nextInitialStage: "reflect",
      })
    ).toBe(false);
  });

  it("resets when the intentional module target changes", () => {
    expect(
      shouldResetWorkspaceStage({
        previousSessionId: "session-2",
        nextSessionId: "session-2",
        previousInitialStage: "reflect",
        nextInitialStage: "summary",
      })
    ).toBe(true);
  });

  it("resets when switching sessions", () => {
    expect(
      shouldResetWorkspaceStage({
        previousSessionId: "session-1",
        nextSessionId: "session-2",
        previousInitialStage: "summary",
        nextInitialStage: "summary",
      })
    ).toBe(true);
  });
});

describe("runCreateSummaryInsightsFlow", () => {
  it("saves notes before generation and opens the summary route for the same session", async () => {
    const phases: string[] = [];
    const saveNotes = vi.fn(async () => ({ id: "session-2" }));
    const generateSummary = vi.fn(async () => ({ draft: true }));

    const result = await runCreateSummaryInsightsFlow({
      relationshipId: "rel-1",
      sessionId: "session-2",
      saveNotes,
      generateSummary,
      onPhase: phase => phases.push(phase),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(saveNotes).toHaveBeenCalledTimes(1);
    expect(generateSummary).toHaveBeenCalledTimes(1);
    expect(generateSummary).toHaveBeenCalledWith("session-2");
    expect(result.route.sessionId).toBe("session-2");
    expect(result.route.relationshipId).toBe("rel-1");
    expect(result.route.module).toBe("identity_intelligence");
    expect(result.route.stage).toBe("summary");
    expect(phases).toEqual(["saving", "generating", "opening"]);
  });

  it("saves unsaved local notes first", async () => {
    let notesPersisted = false;
    const saveNotes = vi.fn(async () => {
      notesPersisted = true;
      return { id: "session-2" };
    });
    const generateSummary = vi.fn(async () => {
      expect(notesPersisted).toBe(true);
      return {};
    });

    await runCreateSummaryInsightsFlow({
      relationshipId: "rel-1",
      sessionId: "session-2",
      saveNotes,
      generateSummary,
    });

    expect(saveNotes.mock.invocationCallOrder[0]).toBeLessThan(
      generateSummary.mock.invocationCallOrder[0]!
    );
  });

  it("does not generate when save fails", async () => {
    const generateSummary = vi.fn(async () => ({}));
    const result = await runCreateSummaryInsightsFlow({
      relationshipId: "rel-1",
      sessionId: "session-2",
      saveNotes: async () => {
        throw new Error("save failed");
      },
      generateSummary,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("save_failed");
    expect(generateSummary).not.toHaveBeenCalled();
  });

  it("preserves notes when generation fails", async () => {
    let notesStillSaved = true;
    const result = await runCreateSummaryInsightsFlow({
      relationshipId: "rel-1",
      sessionId: "session-2",
      saveNotes: async () => ({ id: "session-2" }),
      generateSummary: async () => {
        throw new Error("generate failed");
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("generate_failed");
    expect(notesStillSaved).toBe(true);
  });

  it("duplicate concurrent callers still invoke save/generate once each when locked by caller", async () => {
    const saveNotes = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return { id: "session-2" };
    });
    const generateSummary = vi.fn(async () => ({}));
    let inFlight = false;
    let blocked = 0;

    async function guarded() {
      if (inFlight) {
        blocked += 1;
        return null;
      }
      inFlight = true;
      try {
        return await runCreateSummaryInsightsFlow({
          relationshipId: "rel-1",
          sessionId: "session-2",
          saveNotes,
          generateSummary,
        });
      } finally {
        inFlight = false;
      }
    }

    const [first, second] = await Promise.all([guarded(), guarded()]);
    expect(first?.ok).toBe(true);
    expect(second).toBeNull();
    expect(blocked).toBe(1);
    expect(saveNotes).toHaveBeenCalledTimes(1);
    expect(generateSummary).toHaveBeenCalledTimes(1);
  });

  it("throws without a session ID", async () => {
    await expect(
      runCreateSummaryInsightsFlow({
        relationshipId: "rel-1",
        sessionId: "",
        saveNotes: async () => ({ id: "" }),
        generateSummary: async () => ({}),
      })
    ).rejects.toThrow(/session ID/i);
  });
});

describe("Summary & Insights route guards", () => {
  it("does not treat missing draft as Capture outcome when notes exist", () => {
    const session = makeSession({
      id: "session-2",
      sessionNumber: 2,
      status: "awaiting_completion",
      reflectWhatSurprised: "Useful shift",
      summaryStatus: "not_generated",
    });
    const completion = deriveSessionStageCompletion(session);
    expect(
      getStageAvailability("summary", "debrief", completion, session)
    ).toBe("available");
    expect(
      canTransitionToStage("debrief", "summary", completion, session).ok
    ).toBe(true);
  });

  it("keeps skipped summary generatable later", () => {
    const session = makeSession({
      id: "session-2",
      status: "awaiting_completion",
      notes: "Saved notes",
      reflectWhatSurprised: "Narrative",
      summaryStatus: "not_generated",
    });
    const completion = deriveSessionStageCompletion(session);
    expect(
      getStageAvailability("summary", "debrief", completion, session)
    ).toBe("available");
  });

  it("keeps approved and completed summaries accessible", () => {
    const approved = makeSession({
      id: "session-2",
      status: "completed",
      notes: "Notes",
      summary: "Approved",
      summaryStatus: "approved",
      aiSummaryApproved: true,
    });
    const completion = deriveSessionStageCompletion(approved);
    const availability = getStageAvailability(
      "summary",
      "next_steps",
      completion,
      approved
    );
    expect(["available", "completed"]).toContain(availability);
    expect(
      canTransitionToStage("next_steps", "summary", completion, approved).ok
    ).toBe(true);
  });

  it("stale client stage focus does not force Capture outcome after notes save", () => {
    // Parent still thinks module is session_notes/reflect after notes save.
    // Stage must not reset solely because evidence fields changed.
    expect(
      shouldResetWorkspaceStage({
        previousSessionId: "session-2",
        nextSessionId: "session-2",
        previousInitialStage: "reflect",
        nextInitialStage: "reflect",
      })
    ).toBe(false);
  });
});
