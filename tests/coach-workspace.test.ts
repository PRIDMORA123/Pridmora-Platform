import { describe, expect, it } from "vitest";
import {
  buildCoachWorkspaceViewModel,
  calculateDisplayedElapsed,
  cleanLegacyCoachNotes,
  sarahCoachWorkspace,
  toWorkspaceSessionStatus,
} from "@/lib/coach-workspace";
import { createBlankSession } from "@/lib/sessions";
import type { Client } from "@/lib/types";

describe("cleanLegacyCoachNotes", () => {
  it("strips IDENTITY_WORKFLOW_V1 blocks", () => {
    expect(
      cleanLegacyCoachNotes(
        `Visible notes\n\n---IDENTITY_WORKFLOW_V1---\n{"status":"prepared"}`
      )
    ).toBe("Visible notes");
  });
});

describe("calculateDisplayedElapsed", () => {
  it("adds seconds since timer_started_at for an active session", () => {
    const startedAt = new Date("2026-07-26T10:00:00.000Z").toISOString();
    const now = Date.parse("2026-07-26T10:01:30.000Z");
    expect(calculateDisplayedElapsed(90, startedAt, now)).toBe(180);
  });

  it("uses stored elapsed only when the timer is not running", () => {
    expect(calculateDisplayedElapsed(45, null)).toBe(45);
  });
});

describe("buildCoachWorkspaceViewModel", () => {
  it("scopes Sarah-style workspace data to the selected relationship", () => {
    const session = createBlankSession({
      id: "conversation-sarah-2",
      clientId: "relationship-sarah",
      coachId: "coach-1",
      sessionNumber: 2,
      status: "prepared",
      date: "2026-08-06",
      focus: sarahCoachWorkspace.conversation.focus || "",
      title: "Development Conversation 2",
    });

    const client: Client = {
      id: "relationship-sarah",
      name: "Sarah Thompson",
      initials: "ST",
      organisation: "Northbridge Community Services",
      role: "Service Delivery Manager",
      email: "sarah@example.com",
      status: "Active",
      nextSession: "2026-08-06",
      currentFocus: "Delegation",
      identitySummary: "",
      coachInsight: sarahCoachWorkspace.context.insights[0],
      preparationStyleOverride: null,
      strengths: [],
      values: [],
      themes: sarahCoachWorkspace.context.insights.slice(1),
      goals: [],
      actions: sarahCoachWorkspace.context.commitments.map(item => ({
        id: item.id,
        title: item.text,
        status: "Open",
        clientId: "relationship-sarah",
      })),
      quotes: [],
      sessions: [session],
      journey: [],
    };

    const view = buildCoachWorkspaceViewModel(client, session, { totalSessions: 6 });

    expect(view.relationshipId).toBe("relationship-sarah");
    expect(view.conversationId).toBe("conversation-sarah-2");
    expect(view.client.name).toBe("Sarah Thompson");
    expect(view.conversation.status).toBe("prepared");
    expect(view.conversation.elapsedSeconds).toBe(0);
    expect(view.conversation.focus).toContain("delegate differently");
    expect(view.context.commitments).toHaveLength(3);
    expect(view.client.name).not.toBe("David Smith");
  });
});

describe("toWorkspaceSessionStatus", () => {
  it("maps app statuses into workspace session statuses", () => {
    expect(toWorkspaceSessionStatus("planned")).toBe("not_started");
    expect(toWorkspaceSessionStatus("prepared")).toBe("prepared");
    expect(toWorkspaceSessionStatus("in_progress")).toBe("in_progress");
    expect(toWorkspaceSessionStatus("paused")).toBe("paused");
    expect(toWorkspaceSessionStatus("awaiting_completion")).toBe("completed");
    expect(toWorkspaceSessionStatus("completed")).toBe("completed");
  });
});
