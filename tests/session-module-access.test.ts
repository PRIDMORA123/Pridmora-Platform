import { describe, expect, it } from "vitest";
import { deriveSessionWorkspaceState } from "@/lib/relationship-workspace";
import { buildSessionModuleRoute } from "@/lib/session-module-route";
import { createBlankSession } from "@/lib/sessions";
import type { Session } from "@/lib/types";

const REQUIRED_MODULES = [
  "prepare",
  "conversation",
  "session_notes",
  "identity_intelligence",
  "next_focus",
] as const;

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    ...createBlankSession({
      id: overrides.id ?? "session-2",
      clientId: "rel-1",
      coachId: "coach-1",
      sessionNumber: overrides.sessionNumber ?? 2,
      status: overrides.status,
    }),
    ...overrides,
  };
}

describe("session module access", () => {
  it("exposes Prepare, Conversation, Session Notes, Summary & Insights, Next Focus", () => {
    const state = deriveSessionWorkspaceState(
      makeSession({
        status: "awaiting_completion",
        notes: "Captured",
        reflectWhatSurprised: "Ownership shifted",
        summaryStatus: "draft",
        summary: "Draft summary",
      })
    );

    const ids = state.modules.map(module => module.id);
    expect(ids).toEqual(expect.arrayContaining([...REQUIRED_MODULES]));
  });

  it("keeps Session Notes reopenable after save", () => {
    const state = deriveSessionWorkspaceState(
      makeSession({
        status: "awaiting_completion",
        notes: "Notes saved",
        reflectWhatSurprised: "What stood out",
        commitments: "Follow through with managers",
      })
    );
    const notes = state.modules.find(module => module.id === "session_notes");
    expect(notes?.available).toBe(true);
  });

  it("makes Summary & Insights optional after notes and reopenable after generation", () => {
    const afterNotes = deriveSessionWorkspaceState(
      makeSession({
        status: "awaiting_completion",
        reflectWhatSurprised: "Narrative",
        summaryStatus: "not_generated",
      })
    );
    expect(
      afterNotes.modules.find(m => m.id === "identity_intelligence")?.available
    ).toBe(true);

    const afterDraft = deriveSessionWorkspaceState(
      makeSession({
        status: "awaiting_completion",
        reflectWhatSurprised: "Narrative",
        summaryStatus: "draft",
        summary: "Generated draft",
      })
    );
    expect(
      afterDraft.modules.find(m => m.id === "identity_intelligence")?.available
    ).toBe(true);

    const afterApproved = deriveSessionWorkspaceState(
      makeSession({
        status: "completed",
        reflectWhatSurprised: "Narrative",
        summaryStatus: "approved",
        summary: "Approved summary",
      })
    );
    const intel = afterApproved.modules.find(
      m => m.id === "identity_intelligence"
    );
    expect(intel?.available).toBe(true);
    expect(intel?.actionLabel).toMatch(/View|Review|Summary/i);
  });

  it("routes Summary & Insights to the same session id", () => {
    const route = buildSessionModuleRoute({
      relationshipId: "rel-1",
      sessionId: "session-2",
      module: "identity_intelligence",
    });
    expect(route.sessionId).toBe("session-2");
    expect(route.path).toContain("/sessions/session-2/");
    expect(route.path).not.toContain("session-1");
  });
});
