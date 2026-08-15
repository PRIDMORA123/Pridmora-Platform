import { describe, expect, it } from "vitest";
import { createBlankSession } from "@/lib/sessions";
import {
  buildPersonNextConversationModel,
  getPersonNextConversationSession,
} from "@/lib/relationship-workspace/person-next-conversation";
import { getFutureOrOpenSession, getSessionForPrepare } from "@/lib/session-workflow";
import type { Session } from "@/lib/types";

function makeSession(
  overrides: Partial<Session> & { sessionNumber: number; id: string }
): Session {
  return {
    ...createBlankSession({
      id: overrides.id,
      clientId: "client-alex",
      coachId: "coach-1",
      sessionNumber: overrides.sessionNumber,
      status: overrides.status ?? "planned",
      date: overrides.date,
      title: overrides.title,
    }),
    ...overrides,
  };
}

describe("person next conversation selection", () => {
  it("uses getSessionForPrepare — planned Session 4 over awaiting Session 3", () => {
    const session3 = makeSession({
      id: "session-3",
      sessionNumber: 3,
      status: "awaiting_completion",
      date: "2026-08-01",
    });
    const session4 = makeSession({
      id: "session-4",
      sessionNumber: 4,
      status: "planned",
      date: "2026-08-30",
      time: "10:00",
    });
    const completed = makeSession({
      id: "session-2",
      sessionNumber: 2,
      status: "completed",
      date: "2026-07-15",
    });
    const sessions = [completed, session3, session4];

    expect(getFutureOrOpenSession(sessions)?.id).toBe("session-3");
    expect(getSessionForPrepare(sessions)?.id).toBe("session-4");
    expect(getPersonNextConversationSession(sessions)?.id).toBe("session-4");

    const model = buildPersonNextConversationModel(sessions, {
      clientFirstName: "Alex",
    });
    expect(model.session?.id).toBe("session-4");
    expect(model.headline).toContain("Conversation 4");
    expect(model.headline).toContain("30 August 2026");
    expect(model.primaryAction).toBe("prepare");
    expect(model.secondaryAction).toBe("open");
  });

  it("planned Session 4 without preparation shows prepare primary", () => {
    const session4 = makeSession({
      id: "session-4",
      sessionNumber: 4,
      status: "planned",
      date: "2026-08-30",
      time: "10:00",
    });
    const model = buildPersonNextConversationModel([session4]);
    expect(model.kind).toBe("prepare");
    expect(model.primaryLabel).toBe("Prepare for conversation");
    expect(model.secondaryLabel).toBe("Record conversation");
    expect(model.headline).toMatch(/Conversation 4 · .* · /);
  });

  it("prepared Session 4 shows review preparation", () => {
    const session4 = makeSession({
      id: "session-4",
      sessionNumber: 4,
      status: "prepared",
      date: "2026-08-30",
      time: "10:00",
      prepPurpose: "Build enabling habits with supervisors",
    });
    const model = buildPersonNextConversationModel([session4], {
      clientFirstName: "Alex",
    });
    expect(model.kind).toBe("review_preparation");
    expect(model.primaryLabel).toBe("Review preparation");
    expect(model.supportingCopy).toMatch(/ready to review/i);
    expect(model.secondaryLabel).toBe("Record conversation");
  });

  it("in-progress session prefers continue conversation", () => {
    const live = makeSession({
      id: "session-4",
      sessionNumber: 4,
      status: "in_progress",
      date: "2026-08-30",
      time: "10:00",
    });
    const planned = makeSession({
      id: "session-5",
      sessionNumber: 5,
      status: "planned",
      date: "2026-09-15",
    });
    const model = buildPersonNextConversationModel([live, planned]);
    expect(model.kind).toBe("continue");
    expect(model.session?.id).toBe("session-4");
    expect(model.primaryLabel).toBe("Continue conversation");
    expect(model.primaryAction).toBe("open");
    expect(model.secondaryAction).toBeNull();
  });

  it("no next session surfaces plan action without fabricated number", () => {
    const completed = makeSession({
      id: "session-3",
      sessionNumber: 3,
      status: "completed",
      date: "2026-08-01",
    });
    const model = buildPersonNextConversationModel([completed]);
    expect(model.kind).toBe("plan");
    expect(model.session).toBeNull();
    expect(model.headline).toBeNull();
    expect(model.primaryLabel).toBe("Plan next conversation");
    expect(model.primaryAction).toBe("plan");
  });
});
