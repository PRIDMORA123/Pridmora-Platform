/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act, type ReactNode } from "react";
import {
  applyDebriefValuesToSession,
  SessionDebriefForm,
} from "@/components/reflect/session-debrief-form";
import { LiveSessionWorkspace } from "@/components/coach/live-session-workspace";
import { ToastProvider } from "@/components/feedback/toast-provider";
import { createBlankSession } from "@/lib/sessions";
import type { Session } from "@/lib/types";
import type { CoachWorkspaceViewModel } from "@/types/coach-workspace";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    ...createBlankSession({
      id: "session-1",
      clientId: "client-1",
      coachId: "coach-1",
      sessionNumber: 2,
      status: "awaiting_completion",
    }),
    ...overrides,
  };
}

async function renderNode(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return { container, root };
}

describe("SessionDebriefForm capture outcome polish", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the four approved fields with subtle What was agreed emphasis", async () => {
    const session = makeSession();
    const { container, root } = await renderNode(
      <SessionDebriefForm
        session={session}
        onSave={async () => session}
        onCreateSummary={async () => true}
      />
    );

    expect(container.textContent).toContain("What stood out");
    expect(container.textContent).toContain("What was agreed");
    expect(container.textContent).toContain("Private reflection");
    expect(container.textContent).toContain("Follow-up, optional");
    expect(container.textContent).toContain(
      "Record the specific action, commitment or decision the client agreed to carry forward."
    );
    expect(
      container.querySelector(".session-debrief-form__field--commitment")
    ).toBeTruthy();
    expect(container.textContent).toContain("No commitment was agreed");

    root.unmount();
    container.remove();
  });

  it("confirms before clearing existing commitment text", async () => {
    const session = makeSession({
      commitments: "Ask each manager before offering an answer.",
    });
    const { container, root } = await renderNode(
      <SessionDebriefForm
        session={session}
        onSave={async () => session}
        onCreateSummary={async () => true}
      />
    );

    const checkbox = container.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;
    expect(checkbox).toBeTruthy();

    await act(async () => {
      checkbox.click();
    });

    expect(window.confirm).toHaveBeenCalled();
    const agreed = container.querySelector(
      ".session-debrief-form__textarea--agreed"
    ) as HTMLTextAreaElement;
    expect(agreed.value).toBe("");
    expect(agreed.disabled).toBe(true);

    root.unmount();
    container.remove();
  });

  it("does not create an empty actionable commitment when none was agreed", () => {
    const next = applyDebriefValuesToSession(makeSession(), {
      narrative: "A useful pause appeared.",
      commitment: "Would have been cleared",
      privateReminder: "Private only",
      followUp: "",
      noCommitmentAgreed: true,
    });

    expect(next.commitments).toBe("No commitment was agreed");
    expect(next.agreedActions).toBe("");
  });
});

describe("LiveSessionWorkspace session notes polish", () => {
  it("retains only the approved live-session fields", async () => {
    const session = makeSession({
      status: "in_progress",
      sessionStartedAt: "2026-08-02T12:00:00.000Z",
      prepPurpose: "Support clearer ownership in supervision.",
      focus: "Ownership in supervision",
    });

    const initialData: CoachWorkspaceViewModel = {
      relationshipId: "client-1",
      conversationId: session.id,
      client: {
        name: "Daniel Roberts",
        role: "Director",
        organisation: "Example Org",
      },
      conversation: {
        title: "Ownership in supervision",
        sequenceLabel: "Session 2",
        date: "2 August 2026",
        focus: "Ownership in supervision",
        status: "in_progress",
        notes: "",
        elapsedSeconds: 0,
      },
      context: {
        commitments: [
          {
            id: "c1",
            text: "Invite supervisors to propose solutions first.",
            status: "open",
          },
        ],
        insights: [],
        suggestedQuestions: [],
      },
    };

    const { container, root } = await renderNode(
      <ToastProvider>
        <LiveSessionWorkspace
          initialData={initialData}
          session={session}
          clientName="Daniel Roberts"
          previousCommitment="Invite supervisors to propose solutions first."
          onPersist={async value => value}
          onSessionUpdated={() => undefined}
          onEnded={() => undefined}
        />
      </ToastProvider>
    );

    expect(container.textContent).toContain("Session focus");
    expect(container.textContent).toContain("Quick private note");
    expect(container.textContent).toContain("Visible only to you");
    expect(container.textContent).toContain("Additional live tools");
    expect(container.textContent).toContain("End conversation");
    expect(container.querySelector(".quick-private-note__field")).toBeTruthy();

    root.unmount();
    container.remove();
  });
});
