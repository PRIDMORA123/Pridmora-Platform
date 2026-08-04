import { describe, expect, it } from "vitest";
import { createBlankSession } from "@/lib/sessions";
import {
  canTransitionToStage,
  deriveCurrentWorkflowStage,
  deriveSessionStageCompletion,
  getStageAvailability,
  nextWorkflowStage,
  SESSION_WORKFLOW_STAGES,
  workspaceStageFromWorkflow,
  workflowStageFromWorkspace,
} from "@/lib/session/session-workflow";
import {
  excludePrivateCoachFields,
  guardWorkflowTransition,
  hasMinimumDebriefEvidence,
} from "@/lib/session/session-guards";
import { canCompleteSession } from "@/lib/session-workflow";

function makeSession(
  overrides: Partial<ReturnType<typeof createBlankSession>> = {}
) {
  return {
    ...createBlankSession({
      id: "session-1",
      clientId: "client-1",
      coachId: "coach-1",
      sessionNumber: 3,
      status: overrides.status,
      title: overrides.title,
      focus: overrides.focus,
      date: overrides.date,
    }),
    ...overrides,
  };
}

describe("SESSION_WORKFLOW_STAGES", () => {
  it("defines the five coach journey stages in order", () => {
    expect(SESSION_WORKFLOW_STAGES.map(stage => stage.id)).toEqual([
      "brief",
      "live",
      "debrief",
      "summary",
      "next_steps",
    ]);
  });

  it("maps workflow stages to existing workspace ids", () => {
    expect(workspaceStageFromWorkflow("brief")).toBe("prepare");
    expect(workspaceStageFromWorkflow("live")).toBe("coach");
    expect(workspaceStageFromWorkflow("debrief")).toBe("reflect");
    expect(workspaceStageFromWorkflow("next_steps")).toBe("actions");
    expect(workflowStageFromWorkspace("coach")).toBe("live");
  });
});

describe("deriveSessionStageCompletion", () => {
  it("marks brief complete when preparation exists", () => {
    const session = makeSession({ prepPurpose: "Support delegation" });
    expect(deriveSessionStageCompletion(session).brief).toBe(true);
  });

  it("marks brief complete when the coach starts without a brief", () => {
    const session = makeSession({ status: "planned" });
    expect(
      deriveSessionStageCompletion(session, { startedWithoutBrief: true }).brief
    ).toBe(true);
  });

  it("marks live complete only after the session has ended", () => {
    const live = makeSession({ status: "in_progress" });
    const ended = makeSession({ status: "awaiting_completion" });
    expect(deriveSessionStageCompletion(live).live).toBe(false);
    expect(deriveSessionStageCompletion(ended).live).toBe(true);
  });

  it("marks debrief complete from saved debrief evidence", () => {
    const session = makeSession({
      status: "awaiting_completion",
      reflectWhatSurprised: "Clarity around ownership",
    });
    expect(deriveSessionStageCompletion(session).debrief).toBe(true);
  });

  it("marks summary complete only when approved", () => {
    const draft = makeSession({
      summary: "A draft",
      summaryStatus: "draft",
    });
    const approved = makeSession({
      summary: "Approved record",
      summaryStatus: "approved",
      aiSummaryApproved: true,
    });
    expect(deriveSessionStageCompletion(draft).summary).toBe(false);
    expect(deriveSessionStageCompletion(approved).summary).toBe(true);
  });
});

describe("workflow transitions", () => {
  it("allows the default forward path when prior stages are complete", () => {
    const session = makeSession({
      status: "awaiting_completion",
      prepPurpose: "Focus",
      reflectWhatSurprised: "Insight",
    });
    const completion = deriveSessionStageCompletion(session);
    expect(canTransitionToStage("debrief", "summary", completion, session).ok).toBe(
      true
    );
    expect(nextWorkflowStage("debrief")).toBe("summary");
  });

  it("blocks summary until debrief evidence exists for active sessions", () => {
    const session = makeSession({
      status: "awaiting_completion",
      prepPurpose: "Focus",
    });
    const completion = deriveSessionStageCompletion(session);
    expect(getStageAvailability("summary", "debrief", completion, session)).toBe(
      "unavailable"
    );
  });

  it("allows historical summary access when summary content already exists", () => {
    const session = makeSession({
      status: "completed",
      summary: "Historical summary",
      summaryStatus: "draft",
    });
    const completion = deriveSessionStageCompletion(session);
    expect(getStageAvailability("summary", "brief", completion, session)).toBe(
      "available"
    );
  });

  it("guards transitions with a clear reason", () => {
    const session = makeSession({ status: "prepared", prepPurpose: "Ready" });
    const result = guardWorkflowTransition({
      from: "brief",
      to: "summary",
      session,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/session notes/i);
    }
  });

  it("allows Summary & Insights when notes exist but no draft yet", () => {
    const session = makeSession({
      status: "awaiting_completion",
      prepPurpose: "Focus",
      reflectWhatSurprised: "Ownership landed differently",
      summaryStatus: "not_generated",
      summary: "",
    });
    const completion = deriveSessionStageCompletion(session);
    expect(completion.debrief).toBe(true);
    expect(getStageAvailability("summary", "debrief", completion, session)).toBe(
      "available"
    );
  });
});

describe("active session chronological stage states", () => {
  it("keeps later stages unavailable while brief is current on a planned session", () => {
    const session = makeSession({
      status: "planned",
      prepPurpose: "Support ownership",
      // Stray debrief evidence must not invert chronology for active sessions.
      reflectWhatSurprised: "Should not mark debrief complete",
      summary: "Should not mark summary complete",
      summaryStatus: "draft",
    });
    const completion = deriveSessionStageCompletion(session);
    const current = deriveCurrentWorkflowStage(session);

    expect(current).toBe("brief");
    expect(completion).toEqual({
      brief: true,
      live: false,
      debrief: false,
      summary: false,
      next_steps: false,
    });
    expect(getStageAvailability("brief", current, completion, session)).toBe(
      "current"
    );
    expect(getStageAvailability("live", current, completion, session)).toBe(
      "available"
    );
    expect(getStageAvailability("debrief", current, completion, session)).toBe(
      "unavailable"
    );
    expect(getStageAvailability("summary", current, completion, session)).toBe(
      "unavailable"
    );
    expect(
      getStageAvailability("next_steps", current, completion, session)
    ).toBe("unavailable");
  });

  it("marks brief completed and conversation current after starting", () => {
    const session = makeSession({
      status: "in_progress",
      sessionStartedAt: "2026-07-31T10:00:00.000Z",
      prepPurpose: "Support ownership",
    });
    const completion = deriveSessionStageCompletion(session);
    const current = deriveCurrentWorkflowStage(session);

    expect(current).toBe("live");
    expect(completion.brief).toBe(true);
    expect(completion.live).toBe(false);
    expect(getStageAvailability("brief", current, completion, session)).toBe(
      "completed"
    );
    expect(getStageAvailability("live", current, completion, session)).toBe(
      "current"
    );
    expect(getStageAvailability("debrief", current, completion, session)).toBe(
      "unavailable"
    );
  });

  it("moves to debrief after ending the conversation", () => {
    const session = makeSession({
      status: "awaiting_completion",
      sessionStartedAt: "2026-07-31T10:00:00.000Z",
      prepPurpose: "Support ownership",
    });
    const completion = deriveSessionStageCompletion(session);
    const current = deriveCurrentWorkflowStage(session);

    expect(current).toBe("debrief");
    expect(completion.brief).toBe(true);
    expect(completion.live).toBe(true);
    expect(completion.debrief).toBe(false);
    expect(getStageAvailability("live", current, completion, session)).toBe(
      "completed"
    );
    expect(getStageAvailability("debrief", current, completion, session)).toBe(
      "current"
    );
    expect(getStageAvailability("summary", current, completion, session)).toBe(
      "unavailable"
    );
  });

  it("exposes visible Conversation and Session Summary labels", () => {
    expect(
      SESSION_WORKFLOW_STAGES.find(stage => stage.id === "live")?.label
    ).toBe("Conversation");
    expect(
      SESSION_WORKFLOW_STAGES.find(stage => stage.id === "summary")?.label
    ).toBe("Session Summary");
  });

  it("places approved awaiting sessions on next steps", () => {
    expect(
      deriveCurrentWorkflowStage(
        makeSession({
          status: "awaiting_completion",
          summaryStatus: "approved",
          aiSummaryApproved: true,
        })
      )
    ).toBe("next_steps");
  });

  it("opens completed sessions on Summary & Insights for review", () => {
    expect(
      deriveCurrentWorkflowStage(
        makeSession({
          status: "completed",
          summaryStatus: "approved",
          aiSummaryApproved: true,
          summary: "Reviewed progress on delegation under pressure.",
        })
      )
    ).toBe("summary");
    expect(workspaceStageFromWorkflow("summary")).toBe("summary");
  });
});

describe("private note exclusion", () => {
  it("removes private coach fields from evidence payloads", () => {
    const cleaned = excludePrivateCoachFields({
      notes: "Shared evidence",
      prepPrivateNotes: "Secret prep",
      reflectPrivate: "Secret reflect",
      reflection: "Legacy private",
      summary: "Draft",
    });

    expect(cleaned).toEqual({
      notes: "Shared evidence",
      summary: "Draft",
    });
  });

  it("detects minimum debrief evidence without requiring every field", () => {
    expect(
      hasMinimumDebriefEvidence(
        makeSession({ reflectWhatSurprised: "One useful note" })
      )
    ).toBe(true);
    expect(hasMinimumDebriefEvidence(makeSession())).toBe(false);
  });
});

describe("canCompleteSession with optional live notes", () => {
  it("allows completion when debrief evidence exists without live notes", () => {
    const session = makeSession({
      status: "awaiting_completion",
      notes: "",
      notesSavedAt: "",
      reflectWhatSurprised: "Client saw the pattern clearly",
    });
    expect(canCompleteSession(session)).toEqual({ ok: true });
  });
});
