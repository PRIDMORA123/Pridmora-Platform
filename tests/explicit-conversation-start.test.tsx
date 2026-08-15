/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act, type ReactNode } from "react";
import { LiveSessionWorkspace } from "@/components/coach/live-session-workspace";
import { ToastProvider } from "@/components/feedback/toast-provider";
import { createBlankSession } from "@/lib/sessions";
import { startCoachingSession } from "@/lib/coach-workspace";
import { hasPreparationContent } from "@/lib/session-workflow";
import { buildPersonNextConversationModel } from "@/lib/relationship-workspace/person-next-conversation";
import type { Session } from "@/lib/types";
import type { CoachWorkspaceViewModel } from "@/types/coach-workspace";
import type { PreparationAiBrief } from "@/lib/preparation-brief";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    ...createBlankSession({
      id: overrides.id ?? "session-4",
      clientId: "client-alex",
      coachId: "coach-1",
      sessionNumber: overrides.sessionNumber ?? 4,
      status: overrides.status ?? "planned",
      date: overrides.date ?? "2026-08-30",
      time: overrides.time ?? "10:00",
    }),
    ...overrides,
  };
}

function makeBrief(): PreparationAiBrief {
  return {
    themes: [{ title: "Speak up earlier", basis: "Prior session" }],
    exploration: "Review a recent project discussion.",
    questions: ["What did you recommend?"],
    reflectionPrompt: "Agree one practice.",
    patterns: [],
    developmentDirection: "Recommendation clarity",
    historicalContext: [],
    additionalQuestions: [],
    removedSections: [],
  };
}

function makeWorkspaceData(session: Session): CoachWorkspaceViewModel {
  return {
    relationshipId: "client-alex",
    conversationId: session.id,
    client: {
      name: "Alex Morgan",
      role: "Project Coordinator",
      organisation: "Customer #1 Rehearsal",
    },
    conversation: {
      title: `Session ${session.sessionNumber}`,
      sequenceLabel: `Session ${session.sessionNumber}`,
      date: session.date || null,
      focus: session.focus?.trim() || null,
      status:
        session.status === "in_progress"
          ? "in_progress"
          : session.status === "paused"
            ? "paused"
            : session.status === "prepared"
              ? "prepared"
              : "not_started",
      notes: session.notes || "",
      elapsedSeconds: 0,
    },
    context: {
      commitments: [],
      insights: [],
      suggestedQuestions: [],
    },
  };
}

async function renderNode(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ToastProvider>{node}</ToastProvider>);
  });
  return { container, root };
}

describe("explicit conversation start lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not auto-start a planned session when LiveSessionWorkspace mounts", async () => {
    const session = makeSession({ status: "planned" });
    const onPersist = vi.fn(async (value: Session) => value);
    const onSessionUpdated = vi.fn();

    const { container, root } = await renderNode(
      <LiveSessionWorkspace
        initialData={makeWorkspaceData(session)}
        session={session}
        clientName="Alex Morgan"
        onPersist={onPersist}
        onSessionUpdated={onSessionUpdated}
        onEnded={() => undefined}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      container.querySelector('[data-testid="live-session-awaiting-start"]')
    ).toBeTruthy();
    expect(container.textContent).toContain("Start conversation");
    expect(onPersist).not.toHaveBeenCalled();
    expect(onSessionUpdated).not.toHaveBeenCalled();

    root.unmount();
    container.remove();
  });

  it("does not auto-start a prepared session when LiveSessionWorkspace mounts", async () => {
    const session = makeSession({
      status: "prepared",
      prepAiBrief: makeBrief(),
      prepAiBriefGeneratedAt: "2026-08-15T10:00:00.000Z",
    });
    const onPersist = vi.fn(async (value: Session) => value);

    const { container, root } = await renderNode(
      <LiveSessionWorkspace
        initialData={makeWorkspaceData(session)}
        session={session}
        clientName="Alex Morgan"
        onPersist={onPersist}
        onSessionUpdated={() => undefined}
        onEnded={() => undefined}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(onPersist).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="live-session-explicit-start"]')
    ).toBeTruthy();

    root.unmount();
    container.remove();
  });

  it("explicit Start conversation sets in_progress and timestamps", async () => {
    const session = makeSession({ status: "prepared", prepPurpose: "Focus" });
    const onPersist = vi.fn(async (value: Session) => value);
    const onSessionUpdated = vi.fn();

    const { container, root } = await renderNode(
      <LiveSessionWorkspace
        initialData={makeWorkspaceData(session)}
        session={session}
        clientName="Alex Morgan"
        onPersist={onPersist}
        onSessionUpdated={onSessionUpdated}
        onEnded={() => undefined}
      />
    );

    await act(async () => {
      container
        .querySelector('[data-testid="live-session-explicit-start"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onPersist).toHaveBeenCalledOnce();
    const saved = onPersist.mock.calls[0][0] as Session;
    expect(saved.status).toBe("in_progress");
    expect(saved.sessionStartedAt).toBeTruthy();
    expect(saved.timerStartedAt).toBeTruthy();
    expect(onSessionUpdated).toHaveBeenCalled();

    root.unmount();
    container.remove();
  });

  it("recovers missing sessionStartedAt for an already in_progress session", async () => {
    const session = makeSession({
      status: "in_progress",
      sessionStartedAt: null,
      timerStartedAt: null,
    });
    const onPersist = vi.fn(async (value: Session) => value);

    const { root, container } = await renderNode(
      <LiveSessionWorkspace
        initialData={makeWorkspaceData(session)}
        session={session}
        clientName="Alex Morgan"
        onPersist={onPersist}
        onSessionUpdated={() => undefined}
        onEnded={() => undefined}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onPersist).toHaveBeenCalled();
    const saved = onPersist.mock.calls[0][0] as Session;
    expect(saved.status).toBe("in_progress");
    expect(saved.sessionStartedAt).toBeTruthy();

    root.unmount();
    container.remove();
  });

  it("startCoachingSession persists in_progress and timestamps", async () => {
    const session = makeSession({ status: "planned" });
    const persist = vi.fn(async (value: Session) => value);
    const started = await startCoachingSession({
      relationshipId: "client-alex",
      conversationId: session.id,
      session,
      persist,
    });
    expect(started.status).toBe("in_progress");
    expect(started.sessionStartedAt).toBeTruthy();
    expect(started.timerStartedAt).toBeTruthy();
  });

  it("counts prep_ai_brief as preparation content", () => {
    const empty = makeSession({ status: "planned", prepAiBrief: null });
    expect(hasPreparationContent(empty)).toBe(false);

    const withBrief = makeSession({
      status: "planned",
      prepAiBrief: makeBrief(),
    });
    expect(hasPreparationContent(withBrief)).toBe(true);
  });

  it("prepared Session 4 with AI brief shows Review preparation, not Continue", () => {
    const session = makeSession({
      id: "session-4",
      sessionNumber: 4,
      status: "planned",
      date: "2026-08-30",
      time: "10:00",
      prepAiBrief: makeBrief(),
      prepAiBriefGeneratedAt: "2026-08-15T10:37:00.000Z",
    });
    const model = buildPersonNextConversationModel([session], {
      clientFirstName: "Alex",
    });
    expect(model.kind).toBe("review_preparation");
    expect(model.primaryLabel).toBe("Review preparation");
    expect(model.primaryAction).toBe("prepare");
    expect(model.secondaryLabel).toBe("Record conversation");
  });

  it("existing in_progress session still displays Continue conversation", () => {
    const session = makeSession({
      status: "in_progress",
      sessionStartedAt: "2026-08-15T10:23:35.000Z",
      timerStartedAt: "2026-08-15T10:23:35.000Z",
    });
    const model = buildPersonNextConversationModel([session]);
    expect(model.kind).toBe("continue");
    expect(model.primaryLabel).toBe("Continue conversation");
    expect(model.supportingCopy).toContain("already under way");
  });
});
