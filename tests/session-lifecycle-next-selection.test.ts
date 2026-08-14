import { describe, expect, it } from "vitest";
import { createBlankSession } from "@/lib/sessions";
import {
  canCompleteSession,
  getNextOpenSession,
  getSessionForPrepare,
  SESSION_STATUS_LABELS,
} from "@/lib/session-workflow";
import {
  deriveCurrentWorkflowStage,
  workspaceStageFromWorkflow,
} from "@/lib/session/session-workflow";
import { shouldResetWorkspaceStage } from "@/lib/session/create-summary-insights-flow";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function makeSession(
  overrides: Partial<ReturnType<typeof createBlankSession>> & {
    sessionNumber?: number;
    status?: ReturnType<typeof createBlankSession>["status"];
  } = {}
) {
  return {
    ...createBlankSession({
      id: overrides.id ?? `session-${overrides.sessionNumber ?? 1}`,
      clientId: "client-1",
      coachId: "coach-1",
      sessionNumber: overrides.sessionNumber ?? 1,
      status: overrides.status ?? "planned",
      date: overrides.date,
      time: overrides.time,
    }),
    ...overrides,
  };
}

describe("session lifecycle / next-session selection", () => {
  it("A. S1 awaiting_completion + S2 planned → S2 derives Prepare/brief", () => {
    const session2 = makeSession({
      id: "session-2",
      sessionNumber: 2,
      status: "planned",
      date: "2026-08-20",
      time: "10:00",
    });
    expect(deriveCurrentWorkflowStage(session2)).toBe("brief");
    expect(workspaceStageFromWorkflow("brief")).toBe("prepare");
    expect(SESSION_STATUS_LABELS[session2.status]).toBe("Planned");
  });

  it("B. stale focusSessionStage is not reused across session-id change when cleared", () => {
    // Parent must clear initialStage on schedule; then reset derives from status.
    expect(
      shouldResetWorkspaceStage({
        previousSessionId: "session-1",
        nextSessionId: "session-2",
        previousInitialStage: "summary",
        nextInitialStage: null,
      })
    ).toBe(true);

    const session2 = makeSession({
      id: "session-2",
      sessionNumber: 2,
      status: "planned",
    });
    const derived = workspaceStageFromWorkflow(
      deriveCurrentWorkflowStage(session2)
    );
    expect(derived).toBe("prepare");
    expect(derived).not.toBe("summary");
    expect(derived).not.toBe("actions");
    expect(derived).not.toBe("reflect");
  });

  it("C. Prepare selects S2 rather than S1 awaiting_completion", () => {
    const session1 = makeSession({
      id: "session-1",
      sessionNumber: 1,
      status: "awaiting_completion",
      summaryStatus: "approved",
      aiSummaryApproved: true,
    });
    const session2 = makeSession({
      id: "session-2",
      sessionNumber: 2,
      status: "planned",
      date: "2026-08-20",
      time: "10:00",
    });
    expect(getSessionForPrepare([session1, session2])?.id).toBe("session-2");
    expect(getSessionForPrepare([session1, session2])?.status).toBe("planned");
  });

  it("D. Prepare does not need a new session when S2 already exists", () => {
    const session1 = makeSession({
      id: "session-1",
      sessionNumber: 1,
      status: "awaiting_completion",
    });
    const session2 = makeSession({
      id: "session-2",
      sessionNumber: 2,
      status: "planned",
    });
    const selected = getSessionForPrepare([session1, session2]);
    expect(selected?.id).toBe("session-2");
    // Creating S3 is only when getSessionForPrepare returns undefined.
    expect(selected).toBeTruthy();
  });

  it("E. S1 remains awaiting_completion until explicit Complete Session", () => {
    const session1 = makeSession({
      id: "session-1",
      sessionNumber: 1,
      status: "awaiting_completion",
      summaryStatus: "approved",
      aiSummaryApproved: true,
      notes: "Notes saved",
      notesSavedAt: "2026-08-14T12:00:00.000Z",
      commitments: "Follow up with supervisors",
    });
    // Scheduling S2 is not modelled here — status alone must stay awaiting.
    expect(session1.status).toBe("awaiting_completion");
    expect(canCompleteSession(session1).ok).toBe(true);
  });

  it("F. explicit Complete Session still requires awaiting_completion gate then completed", () => {
    const awaiting = makeSession({
      id: "session-1",
      sessionNumber: 1,
      status: "awaiting_completion",
      notes: "Notes",
      notesSavedAt: "2026-08-14T12:00:00.000Z",
      summaryStatus: "approved",
      aiSummaryApproved: true,
    });
    expect(canCompleteSession(awaiting).ok).toBe(true);

    const completed = { ...awaiting, status: "completed" as const };
    expect(canCompleteSession(completed).ok).toBe(false);
    expect(completed.status).toBe("completed");
  });

  it("G. existing single-session flows remain unchanged", () => {
    const onlyAwaiting = makeSession({
      id: "session-1",
      sessionNumber: 1,
      status: "awaiting_completion",
    });
    expect(getSessionForPrepare([onlyAwaiting])?.id).toBe("session-1");
    expect(getNextOpenSession([onlyAwaiting])?.id).toBe("session-1");

    const onlyPlanned = makeSession({
      id: "session-1",
      sessionNumber: 1,
      status: "planned",
    });
    expect(getSessionForPrepare([onlyPlanned])?.id).toBe("session-1");
    expect(getNextOpenSession([onlyPlanned])?.id).toBe("session-1");

    const liveAndPlanned = [
      makeSession({
        id: "session-1",
        sessionNumber: 1,
        status: "in_progress",
      }),
      makeSession({
        id: "session-2",
        sessionNumber: 2,
        status: "planned",
      }),
    ];
    expect(getSessionForPrepare(liveAndPlanned)?.id).toBe("session-1");
    expect(getNextOpenSession(liveAndPlanned)?.id).toBe("session-1");
  });

  it("general workspace selection still prefers awaiting_completion over planned", () => {
    // People / home attention must still surface incomplete Session 1 work.
    const session1 = makeSession({
      id: "session-1",
      sessionNumber: 1,
      status: "awaiting_completion",
    });
    const session2 = makeSession({
      id: "session-2",
      sessionNumber: 2,
      status: "planned",
    });
    expect(getNextOpenSession([session1, session2])?.id).toBe("session-1");
  });

  it("scheduleSessionForClient clears focusSessionStage before opening the new session", () => {
    const source = readFileSync(
      resolve(process.cwd(), "components/home-app.tsx"),
      "utf8"
    );
    const scheduleFn = source.slice(
      source.indexOf("async function scheduleSessionForClient"),
      source.indexOf("async function saveActionForClient")
    );
    expect(scheduleFn).toContain("setFocusSessionId(saved.id)");
    expect(scheduleFn).toContain("setFocusSessionStage(null)");
    expect(scheduleFn.indexOf("setFocusSessionStage(null)")).toBeLessThan(
      scheduleFn.indexOf('navigate("session")')
    );
  });

  it("prepare entry uses getSessionForPrepare rather than getFutureOrOpenSession", () => {
    const source = readFileSync(
      resolve(process.cwd(), "components/home-app.tsx"),
      "utf8"
    );
    const prepareFn = source.slice(
      source.indexOf("async function prepare("),
      source.indexOf("async function openSessionWorkspace")
    );
    expect(prepareFn).toContain("getSessionForPrepare(sessions)");
    expect(prepareFn).not.toContain("getFutureOrOpenSession(sessions)");
    expect(prepareFn).toContain("setFocusSessionStage(null)");
  });
});
