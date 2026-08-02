import { describe, expect, it } from "vitest";
import { createBlankSession } from "@/lib/sessions";
import {
  buildRelationshipActionState,
  getPrimaryRelationshipAction,
  primaryActionToModuleId,
} from "@/lib/relationship-workspace/get-primary-relationship-action";
import type { Session } from "@/lib/types";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    ...createBlankSession({
      id: overrides.id ?? "session-1",
      clientId: "client-1",
      coachId: "coach-1",
      sessionNumber: overrides.sessionNumber ?? 1,
      status: overrides.status ?? "planned",
    }),
    ...overrides,
  };
}

describe("getPrimaryRelationshipAction", () => {
  it("returns Plan next conversation when no current session exists", () => {
    const state = buildRelationshipActionState({ session: null });
    const action = getPrimaryRelationshipAction(state);
    expect(action).toEqual({
      label: "Plan next conversation",
      action: "plan_conversation",
    });
  });

  it("returns Prepare conversation when preparation has not started", () => {
    const state = buildRelationshipActionState({
      session: makeSession({ status: "planned" }),
    });
    expect(getPrimaryRelationshipAction(state)).toEqual({
      label: "Prepare conversation",
      action: "prepare",
    });
  });

  it("returns Continue preparation when preparation has started", () => {
    const state = buildRelationshipActionState({
      session: makeSession({
        status: "planned",
        prepPurpose: "Explore ownership",
      }),
    });
    expect(getPrimaryRelationshipAction(state)).toEqual({
      label: "Continue preparation",
      action: "continue_preparation",
    });
  });

  it("returns Start conversation when preparation is ready", () => {
    const state = buildRelationshipActionState({
      session: makeSession({ status: "prepared" }),
    });
    expect(getPrimaryRelationshipAction(state)).toEqual({
      label: "Start conversation",
      action: "start_conversation",
    });
  });

  it("returns Continue conversation when conversation is active", () => {
    const state = buildRelationshipActionState({
      session: makeSession({
        status: "in_progress",
        sessionStartedAt: "2026-08-01T10:00:00.000Z",
      }),
    });
    expect(getPrimaryRelationshipAction(state)).toEqual({
      label: "Continue conversation",
      action: "continue_conversation",
    });
  });

  it("returns Capture session notes when notes are missing after conversation", () => {
    const state = buildRelationshipActionState({
      session: makeSession({
        status: "awaiting_completion",
        sessionStartedAt: "2026-08-01T10:00:00.000Z",
      }),
    });
    expect(getPrimaryRelationshipAction(state)).toEqual({
      label: "Capture session notes",
      action: "capture_notes",
    });
  });

  it("returns Review Summary & Insights when notes are saved", () => {
    const state = buildRelationshipActionState({
      session: makeSession({
        status: "awaiting_completion",
        sessionStartedAt: "2026-08-01T10:00:00.000Z",
        notes: "Held accountability with the manager.",
      }),
    });
    expect(getPrimaryRelationshipAction(state)).toEqual({
      label: "Review Summary & Insights",
      action: "review_intelligence",
    });
  });

  it("returns Review Summary & Insights when a summary draft exists", () => {
    const state = buildRelationshipActionState({
      session: makeSession({
        status: "awaiting_completion",
        notes: "Notes saved",
        summaryStatus: "draft",
        summary: "Draft summary",
      }),
    });
    expect(getPrimaryRelationshipAction(state).action).toBe(
      "review_intelligence"
    );
  });

  it("returns none when the relationship is not active", () => {
    const state = buildRelationshipActionState({
      session: makeSession({ status: "planned" }),
      relationshipActive: false,
    });
    expect(getPrimaryRelationshipAction(state)).toEqual({
      label: "",
      action: "none",
    });
  });

  it("maps actions to session modules for navigation", () => {
    expect(primaryActionToModuleId("prepare")).toBe("prepare");
    expect(primaryActionToModuleId("continue_preparation")).toBe("prepare");
    expect(primaryActionToModuleId("start_conversation")).toBe("conversation");
    expect(primaryActionToModuleId("continue_conversation")).toBe(
      "conversation"
    );
    expect(primaryActionToModuleId("capture_notes")).toBe("session_notes");
    expect(primaryActionToModuleId("review_intelligence")).toBe(
      "identity_intelligence"
    );
    expect(primaryActionToModuleId("plan_conversation")).toBeNull();
    expect(primaryActionToModuleId("none")).toBeNull();
  });
});
