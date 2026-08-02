import { describe, expect, it } from "vitest";
import { createBlankSession, nextSessionNumber } from "@/lib/sessions";
import {
  allocateNextSessionNumber,
  buildSessionWorkspaceEvidence,
  defaultSessionTitle,
  deriveSessionWorkspaceState,
  findIncompleteCurrentSession,
  getIncompleteSessionWarning,
  resolveConversationPrimaryActionLabel,
  selectPreviousConversations,
} from "@/lib/relationship-workspace";
import type { Session } from "@/lib/types";

function makeSession(
  overrides: Partial<Session> & { sessionNumber?: number } = {}
): Session {
  return {
    ...createBlankSession({
      id: overrides.id ?? `session-${overrides.sessionNumber ?? 1}`,
      clientId: "client-sarah",
      coachId: "coach-1",
      sessionNumber: overrides.sessionNumber ?? 1,
      status: overrides.status,
      title: overrides.title,
      focus: overrides.focus,
      date: overrides.date,
    }),
    ...overrides,
  };
}

describe("buildSessionWorkspaceEvidence", () => {
  it("returns empty evidence when no session exists", () => {
    expect(buildSessionWorkspaceEvidence(null).sessionExists).toBe(false);
  });

  it("detects preparation from saved brief fields", () => {
    const session = makeSession({ prepPurpose: "Explore delegation" });
    expect(buildSessionWorkspaceEvidence(session).preparationExists).toBe(true);
  });

  it("detects conversation start and end from status", () => {
    const active = makeSession({ status: "in_progress" });
    const ended = makeSession({ status: "awaiting_completion" });
    expect(buildSessionWorkspaceEvidence(active).conversationStarted).toBe(true);
    expect(buildSessionWorkspaceEvidence(active).conversationEnded).toBe(false);
    expect(buildSessionWorkspaceEvidence(ended).conversationEnded).toBe(true);
  });

  it("detects intelligence draft vs approved", () => {
    const draft = makeSession({
      summaryStatus: "draft",
      summary: "Draft summary",
    });
    const approved = makeSession({
      summaryStatus: "approved",
      aiSummaryApproved: true,
      summary: "Approved summary",
    });
    expect(buildSessionWorkspaceEvidence(draft).intelligenceExists).toBe(true);
    expect(buildSessionWorkspaceEvidence(draft).intelligenceApproved).toBe(false);
    expect(buildSessionWorkspaceEvidence(approved).intelligenceApproved).toBe(
      true
    );
  });
});

describe("resolveConversationPrimaryActionLabel", () => {
  it("plans the next conversation when none exists", () => {
    expect(resolveConversationPrimaryActionLabel(null)).toBe(
      "Plan next conversation"
    );
  });

  it("uses contextual labels across session states", () => {
    expect(
      resolveConversationPrimaryActionLabel(
        makeSession({ status: "planned" })
      )
    ).toBe("Prepare conversation");

    expect(
      resolveConversationPrimaryActionLabel(
        makeSession({
          status: "planned",
          prepPurpose: "Explore delegation",
        })
      )
    ).toBe("Continue preparation");

    expect(
      resolveConversationPrimaryActionLabel(
        makeSession({ status: "prepared", prepPurpose: "Ready brief" })
      )
    ).toBe("Start conversation");

    expect(
      resolveConversationPrimaryActionLabel(
        makeSession({ status: "in_progress" })
      )
    ).toBe("Continue conversation");

    expect(
      resolveConversationPrimaryActionLabel(
        makeSession({ status: "awaiting_completion" })
      )
    ).toBe("Capture session notes");

    expect(
      resolveConversationPrimaryActionLabel(
        makeSession({
          status: "awaiting_completion",
          notes: "What stood out",
          reflectWhatSurprised: "Ownership shifted",
        })
      )
    ).toBe("Review Summary & Insights");
  });
});

describe("deriveSessionWorkspaceState", () => {
  it("handles a relationship with no sessions", () => {
    const state = deriveSessionWorkspaceState(null);
    expect(state.modules.every(module => module.status === "unavailable")).toBe(
      true
    );
  });

  it("marks Prepare current for one planned session", () => {
    const state = deriveSessionWorkspaceState(
      makeSession({ status: "planned", sessionNumber: 1 })
    );
    expect(state.modules.find(m => m.id === "prepare")?.status).toBe("current");
    expect(state.modules.find(m => m.id === "conversation")?.status).toBe(
      "waiting"
    );
    expect(state.modules.find(m => m.id === "identity_intelligence")?.status).toBe(
      "optional"
    );
  });

  it("marks Prepare complete-path ready and Conversation actionable when prepared", () => {
    const state = deriveSessionWorkspaceState(
      makeSession({
        status: "prepared",
        prepPurpose: "Build confidence",
        title: "Leadership",
      })
    );
    // Preparation exists: Prepare is ready/current; Conversation is ready/current.
    expect(state.modules.find(m => m.id === "prepare")?.status).toMatch(
      /ready|current/
    );
    expect(state.modules.find(m => m.id === "conversation")?.status).toMatch(
      /ready|current/
    );
    expect(state.evidence.preparationExists).toBe(true);
  });

  it("marks Conversation current when active", () => {
    const state = deriveSessionWorkspaceState(
      makeSession({
        status: "in_progress",
        prepPurpose: "Focus",
        sessionStartedAt: "2026-07-31T10:00:00.000Z",
      })
    );
    expect(state.modules.find(m => m.id === "prepare")?.status).toBe("complete");
    expect(state.modules.find(m => m.id === "conversation")?.status).toBe(
      "current"
    );
    expect(state.modules.find(m => m.id === "session_notes")?.status).toBe(
      "waiting"
    );
  });

  it("marks Session Notes current after conversation ends", () => {
    const state = deriveSessionWorkspaceState(
      makeSession({
        status: "awaiting_completion",
        prepPurpose: "Focus",
        sessionStartedAt: "2026-07-31T10:00:00.000Z",
      })
    );
    expect(state.modules.find(m => m.id === "conversation")?.status).toBe(
      "complete"
    );
    expect(state.modules.find(m => m.id === "session_notes")?.status).toBe(
      "current"
    );
  });

  it("marks notes complete and next focus available after notes saved", () => {
    const state = deriveSessionWorkspaceState(
      makeSession({
        status: "awaiting_completion",
        notes: "What stood out",
        notesSavedAt: "2026-07-31T11:00:00.000Z",
        reflectWhatShifted: "Greater ownership",
      })
    );
    expect(state.modules.find(m => m.id === "session_notes")?.status).toBe(
      "complete"
    );
    expect(state.modules.find(m => m.id === "identity_intelligence")?.status).toBe(
      "optional"
    );
    expect(state.modules.find(m => m.id === "next_focus")?.available).toBe(true);
  });

  it("never lets Intelligence block Next Focus", () => {
    const state = deriveSessionWorkspaceState(
      makeSession({
        status: "awaiting_completion",
        notes: "Notes",
        notesSavedAt: "2026-07-31T11:00:00.000Z",
        reflectWhatShifted: "Shift",
        summaryStatus: "not_generated",
      })
    );
    const next = state.modules.find(m => m.id === "next_focus");
    const intel = state.modules.find(m => m.id === "identity_intelligence");
    expect(intel?.status).toBe("optional");
    expect(next?.available).toBe(true);
  });

  it("shows draft and approved Intelligence states distinctly", () => {
    const draft = deriveSessionWorkspaceState(
      makeSession({
        status: "awaiting_completion",
        notes: "Notes",
        notesSavedAt: "2026-07-31T11:00:00.000Z",
        summaryStatus: "draft",
        summary: "Draft",
      })
    );
    const approved = deriveSessionWorkspaceState(
      makeSession({
        status: "completed",
        notes: "Notes",
        notesSavedAt: "2026-07-31T11:00:00.000Z",
        summaryStatus: "approved",
        aiSummaryApproved: true,
        summary: "Approved",
        suggestedFocus: "Continue delegation",
      })
    );
    expect(
      draft.modules.find(m => m.id === "identity_intelligence")?.statusLabel
    ).toBe("Draft available");
    expect(
      approved.modules.find(m => m.id === "identity_intelligence")?.statusLabel
    ).toBe("Approved");
    expect(
      approved.modules.find(m => m.id === "identity_intelligence")?.actionLabel
    ).toBe("View Summary & Insights");
  });

  it("records next focus when suggested focus exists", () => {
    const state = deriveSessionWorkspaceState(
      makeSession({
        status: "completed",
        suggestedFocus: "Enable supervisors",
        notes: "Done",
        notesSavedAt: "2026-07-31T11:00:00.000Z",
      })
    );
    expect(state.modules.find(m => m.id === "next_focus")?.status).toBe(
      "complete"
    );
  });
});

describe("previous conversations gallery selection", () => {
  it("shows three most recent and reports hasMore beyond that", () => {
    const sessions = Array.from({ length: 8 }, (_, index) =>
      makeSession({
        id: `s-${index + 1}`,
        sessionNumber: index + 1,
        status: "completed",
        title: `Conversation ${index + 1}`,
        date: `2026-0${Math.min(index + 1, 9)}-01`,
        outcomes: `Outcome ${index + 1}`,
        commitments: `Commitment ${index + 1}`,
      })
    );
    const current = makeSession({
      id: "s-9",
      sessionNumber: 9,
      status: "planned",
    });
    const selection = selectPreviousConversations(
      [...sessions, current],
      current.id
    );
    expect(selection.visible).toHaveLength(3);
    expect(selection.total).toBe(8);
    expect(selection.hasMore).toBe(true);
    expect(selection.visible[0].sessionNumber).toBe(8);
  });

  it("keeps Coaching Moments out of previous conversation cards", () => {
    const sessions = [
      makeSession({
        id: "s-1",
        sessionNumber: 1,
        status: "completed",
        outcomes: "Formal outcome",
      }),
    ];
    const selection = selectPreviousConversations(sessions, null);
    expect(selection.total).toBe(1);
    expect(selection.visible[0].outcome).toContain("Formal outcome");
  });
});

describe("additional session allocation", () => {
  it("allocates the next session number safely", () => {
    const sessions = [
      makeSession({ sessionNumber: 1 }),
      makeSession({ sessionNumber: 3, id: "s-3" }),
    ];
    expect(allocateNextSessionNumber(sessions)).toBe(4);
    expect(nextSessionNumber(sessions)).toBe(4);
  });

  it("prevents duplicate numbering via max+1 allocation", () => {
    const sessions = [
      makeSession({ sessionNumber: 2, id: "a" }),
      makeSession({ sessionNumber: 2, id: "b" }),
    ];
    expect(allocateNextSessionNumber(sessions)).toBe(3);
  });

  it("provides a default title when none is supplied", () => {
    expect(defaultSessionTitle(4)).toBe("Session 4");
  });

  it("warns gently when an incomplete session is in progress", () => {
    const sessions = [
      makeSession({
        id: "active",
        sessionNumber: 3,
        status: "in_progress",
      }),
    ];
    const warning = getIncompleteSessionWarning(sessions);
    expect(warning?.message).toContain("Session 3 is still in progress");
    expect(findIncompleteCurrentSession(sessions)?.id).toBe("active");
  });

  it("does not warn for a merely planned session", () => {
    const sessions = [
      makeSession({ sessionNumber: 2, status: "planned" }),
    ];
    expect(getIncompleteSessionWarning(sessions)).toBeNull();
  });

  it("supports sessions without title or date", () => {
    const session = makeSession({
      title: "",
      focus: "",
      date: "",
      time: "",
      sessionNumber: 5,
    });
    const state = deriveSessionWorkspaceState(session);
    expect(state.evidence.sessionExists).toBe(true);
    expect(defaultSessionTitle(session.sessionNumber)).toBe("Session 5");
  });
});

describe("private notes exclusion from gallery outcome text", () => {
  it("prefers public outcomes over private reflection fields", () => {
    const session = makeSession({
      status: "completed",
      outcomes: "Public outcome",
      reflectPrivate: "PRIVATE — never show",
      reflection: "PRIVATE — never show",
    });
    const card = selectPreviousConversations([session], null).visible[0];
    expect(card.outcome).toBe("Public outcome");
    expect(card.outcome).not.toContain("PRIVATE");
  });
});
