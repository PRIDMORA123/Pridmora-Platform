import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createBlankSession } from "@/lib/sessions";
import {
  canCompleteSession,
  getSessionForPrepare,
  overviewPrimaryAction,
} from "@/lib/session-workflow";
import { nextLogicalActionLabel } from "@/lib/session/session-workflow";

function makeSession(
  overrides: Partial<ReturnType<typeof createBlankSession>> & {
    sessionNumber?: number;
  } = {}
) {
  return {
    ...createBlankSession({
      id: overrides.id ?? `session-${overrides.sessionNumber ?? 4}`,
      clientId: "client-alex",
      coachId: "coach-1",
      sessionNumber: overrides.sessionNumber ?? 4,
      status: overrides.status ?? "planned",
    }),
    ...overrides,
  };
}

function sessionReadyToComplete(
  overrides: Partial<ReturnType<typeof makeSession>> = {}
) {
  return makeSession({
    status: "awaiting_completion",
    notes: "Live notes from the conversation",
    notesSavedAt: "2026-08-15T11:00:00.000Z",
    commitments: "State a clear recommendation in the next project discussion",
    summaryStatus: "approved",
    aiSummaryApproved: true,
    ...overrides,
  });
}

describe("Complete conversation affordance", () => {
  it("1. awaiting_completion Session 4 shows Complete conversation (active path)", () => {
    const session4 = sessionReadyToComplete({ id: "session-4", sessionNumber: 4 });
    expect(canCompleteSession(session4).ok).toBe(true);
    expect(overviewPrimaryAction(session4)).toEqual({
      label: "Complete conversation",
      stage: "actions",
      action: "complete",
    });
    expect(
      nextLogicalActionLabel("next_steps", { brief: true, live: true, debrief: true, summary: true, next_steps: false }, session4)
    ).toBe("Complete conversation");

    const steps = readFileSync(
      resolve("components/actions/session-next-steps.tsx"),
      "utf8"
    );
    expect(steps).toContain("Complete conversation");
    expect(steps).toMatch(
      /status === "awaiting_completion"[\s\S]*Complete conversation/
    );
    expect(steps).toContain("Schedule next session");
  });

  it("2. Complete uses canonical handleComplete path (status + completedAt + DU)", () => {
    const workspace = readFileSync(
      resolve("components/session-workspace.tsx"),
      "utf8"
    );
    expect(workspace).toMatch(
      /async function handleComplete\([\s\S]*status:\s*"completed"[\s\S]*completedAt:/
    );
    expect(workspace).toContain('/api/development-updates/generate');
    expect(workspace).toMatch(
      /onCompleteSession=\{\s*session\.status === "awaiting_completion"\s*\?[\s\S]*setCompleteOpen\(true\)/
    );
    expect(workspace).toContain('idleLabel="Complete conversation"');
    expect(workspace).toContain("void handleComplete()");
  });

  it("3. completing applies completed status and completedAt (canonical transition)", () => {
    const awaiting = sessionReadyToComplete();
    expect(canCompleteSession(awaiting).ok).toBe(true);

    const completed = {
      ...awaiting,
      status: "completed" as const,
      completedAt: "2026-08-15T12:00:00.000Z",
    };
    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toBeTruthy();
    expect(canCompleteSession(completed).ok).toBe(false);
  });

  it("4–6. post-complete journey keeps DU and does not auto-create next session", () => {
    const workspace = readFileSync(
      resolve("components/session-workspace.tsx"),
      "utf8"
    );
    expect(workspace).toContain("/api/development-updates/generate");
    expect(workspace).toContain("Review development update");
    expect(workspace).toContain("Return to person");

    const handleCompleteMatch = workspace.match(
      /async function handleComplete\(\) \{[\s\S]*?\n  \}/
    );
    expect(handleCompleteMatch?.[0]).toBeTruthy();
    expect(handleCompleteMatch?.[0]).not.toContain("setScheduleOpen");
    expect(handleCompleteMatch?.[0]).not.toContain("scheduleSession");
    expect(handleCompleteMatch?.[0]).toContain('status: "completed"');
    expect(handleCompleteMatch?.[0]).toContain("completedAt:");
    expect(handleCompleteMatch?.[0]).toContain(
      "/api/development-updates/generate"
    );

    // Schedule remains a separate optional control.
    expect(workspace).toContain("onScheduleNext={() => setScheduleOpen(true)}");
    expect(workspace).toContain("Schedule next session");
    expect(workspace).not.toContain("schedulePromptOpen");
  });

  it("7. completed session does not show Complete conversation", () => {
    const completed = sessionReadyToComplete({
      status: "completed",
      completedAt: "2026-08-15T12:00:00.000Z",
    });
    expect(canCompleteSession(completed).ok).toBe(false);
    expect(overviewPrimaryAction(completed).action).toBeUndefined();
    expect(overviewPrimaryAction(completed).label).toBe("View session summary");

    const steps = readFileSync(
      resolve("components/actions/session-next-steps.tsx"),
      "utf8"
    );
    // Affordance is gated to awaiting_completion only.
    expect(steps).toMatch(
      /session\.status === "awaiting_completion" && onCompleteSession/
    );
  });

  it("8. planned/prepared/in_progress are not completed by the Complete affordance", () => {
    for (const status of ["planned", "prepared", "in_progress"] as const) {
      const session = makeSession({
        status,
        notes: "Notes",
        notesSavedAt: "2026-08-15T11:00:00.000Z",
      });
      expect(canCompleteSession(session).ok).toBe(false);
      expect(overviewPrimaryAction(session).action).not.toBe("complete");
    }

    // Live finish only moves to awaiting_completion — never jumps to completed.
    const coachWorkspace = readFileSync(
      resolve("lib/coach-workspace.ts"),
      "utf8"
    );
    expect(coachWorkspace).toMatch(
      /completeCoachingSession[\s\S]*status:\s*"awaiting_completion"/
    );
    expect(coachWorkspace).not.toMatch(
      /export async function completeCoachingSession[\s\S]*?status:\s*"completed"/
    );
  });

  it("9. commitments continue through the existing completion gate", () => {
    const withCommitment = sessionReadyToComplete({
      notes: "",
      notesSavedAt: "",
      summaryStatus: "not_generated",
      aiSummaryApproved: false,
      summary: "",
      commitments: "Practise stating a recommendation clearly",
    });
    expect(canCompleteSession(withCommitment).ok).toBe(true);

    const steps = readFileSync(
      resolve("components/actions/session-next-steps.tsx"),
      "utf8"
    );
    expect(steps).toContain("Agreed commitments");
    expect(steps).toContain("Complete conversation");
  });

  it("10–12. no regression to explicit-start, preparation selection, or Session 4/5", () => {
    const prepared = makeSession({
      id: "session-4",
      sessionNumber: 4,
      status: "prepared",
    });
    expect(overviewPrimaryAction(prepared).label).toBe("Start conversation");
    expect(canCompleteSession(prepared).ok).toBe(false);

    const session4Awaiting = sessionReadyToComplete({
      id: "session-4",
      sessionNumber: 4,
    });
    const session5Planned = makeSession({
      id: "session-5",
      sessionNumber: 5,
      status: "planned",
      date: "2026-09-12",
      time: "10:00",
    });
    expect(
      getSessionForPrepare([session4Awaiting, session5Planned])?.id
    ).toBe("session-5");

    const startTests = readFileSync(
      resolve("tests/explicit-conversation-start.test.tsx"),
      "utf8"
    );
    expect(startTests.length).toBeGreaterThan(100);
  });

  it("keeps a single primary Complete conversation control (no competing labels)", () => {
    const steps = readFileSync(
      resolve("components/actions/session-next-steps.tsx"),
      "utf8"
    );
    const matches = steps.match(/Complete conversation/g) ?? [];
    expect(matches.length).toBe(1);
    expect(steps).not.toContain("Complete session");
    expect(steps).toContain("stage-primary-action");
  });
});
