import { describe, expect, it } from "vitest";
import { createBlankSession } from "@/lib/sessions";
import { getRelationshipPrimaryAction } from "@/lib/coaching-journey/primary-action";
import { deriveSessionWorkspaceState } from "@/lib/relationship-workspace";
import { getNextOpenSession } from "@/lib/session-workflow";
import type { Client, Session } from "@/lib/types";

function makeSession(
  overrides: Partial<Session> & { sessionNumber?: number } = {}
): Session {
  return {
    ...createBlankSession({
      id: overrides.id ?? `session-${overrides.sessionNumber ?? 1}`,
      clientId: "client-1",
      coachId: "coach-1",
      sessionNumber: overrides.sessionNumber ?? 1,
      status: overrides.status,
    }),
    ...overrides,
  };
}

function makeClient(sessions: Session[]): Client {
  return {
    id: "client-1",
    name: "Daniel Reed",
    initials: "DR",
    organisation: "Northbridge",
    role: "Director",
    email: "daniel@example.com",
    status: "Active",
    nextSession: "",
    currentFocus: "Delegation",
    identitySummary: "",
    coachInsight: "",
    preparationStyleOverride: null,
    strengths: [],
    values: [],
    themes: [],
    sessions,
    actions: [],
    createdAt: "2026-01-01T00:00:00.000Z",
  } as unknown as Client;
}

describe("Summary & Insights availability", () => {
  it("makes Pridmora Intelligence available after notes are saved", () => {
    const state = deriveSessionWorkspaceState(
      makeSession({
        id: "session-2",
        sessionNumber: 2,
        status: "awaiting_completion",
        notes: "Useful conversation",
        reflectWhatSurprised: "Ownership landed differently",
        summaryStatus: "not_generated",
      })
    );

    const intel = state.modules.find(m => m.id === "identity_intelligence");
    expect(intel?.available).toBe(true);
    expect(intel?.status).toBe("optional");
    expect(intel?.actionLabel).toBe("Create Summary & Insights");
  });

  it("keeps skipped summary available later", () => {
    const state = deriveSessionWorkspaceState(
      makeSession({
        sessionNumber: 2,
        status: "awaiting_completion",
        notes: "Notes saved",
        reflectWhatSurprised: "Narrative",
        summaryStatus: "not_generated",
        summary: "",
      })
    );
    expect(
      state.modules.find(m => m.id === "identity_intelligence")?.available
    ).toBe(true);
  });

  it("marks generated draft accessible", () => {
    const state = deriveSessionWorkspaceState(
      makeSession({
        sessionNumber: 2,
        status: "awaiting_completion",
        notes: "Notes",
        summaryStatus: "draft",
        summary: "Draft summary",
      })
    );
    const intel = state.modules.find(m => m.id === "identity_intelligence");
    expect(intel?.available).toBe(true);
    expect(intel?.statusLabel).toBe("Draft available");
  });

  it("keeps approved summary accessible on completed sessions", () => {
    const state = deriveSessionWorkspaceState(
      makeSession({
        sessionNumber: 2,
        status: "completed",
        notes: "Notes",
        summaryStatus: "approved",
        aiSummaryApproved: true,
        summary: "Approved",
      })
    );
    const intel = state.modules.find(m => m.id === "identity_intelligence");
    expect(intel?.available).toBe(true);
    expect(intel?.status).toBe("complete");
    expect(intel?.actionLabel).toBe("View Summary & Insights");
  });

  it("promotes Create Summary & Insights after notes without a draft", () => {
    const session2 = makeSession({
      id: "session-2",
      sessionNumber: 2,
      status: "awaiting_completion",
      notes: "Saved notes",
      reflectWhatSurprised: "Useful shift",
      summaryStatus: "not_generated",
    });
    const action = getRelationshipPrimaryAction({
      relationship: makeClient([session2]),
      currentSession: session2,
    });
    expect(action?.kind).toBe("review_summary_insights");
    expect(action?.label).toBe("Create Summary & Insights");
    expect(action?.sessionId).toBe("session-2");
  });

  it("prefers Session 2 as current when both sessions await completion", () => {
    const session1 = makeSession({
      id: "session-1",
      sessionNumber: 1,
      status: "awaiting_completion",
      notes: "Earlier notes",
    });
    const session2 = makeSession({
      id: "session-2",
      sessionNumber: 2,
      status: "awaiting_completion",
      notes: "Later notes",
      reflectWhatSurprised: "Session 2 narrative",
    });
    const current = getNextOpenSession([session1, session2]);
    expect(current?.id).toBe("session-2");
  });
});
