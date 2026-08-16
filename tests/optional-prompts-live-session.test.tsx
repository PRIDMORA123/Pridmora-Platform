/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act, type ReactNode } from "react";
import { LiveSessionWorkspace } from "@/components/coach/live-session-workspace";
import { ToastProvider } from "@/components/feedback/toast-provider";
import {
  buildCoachWorkspaceViewModel,
  resolveSuggestedQuestionsForConversation,
} from "@/lib/coach-workspace";
import { EMPTY_PREPARATION_AI_BRIEF } from "@/lib/preparation-brief";
import { createBlankSession } from "@/lib/sessions";
import type { Client, Session } from "@/lib/types";
import type { CoachWorkspaceViewModel } from "@/types/coach-workspace";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    ...createBlankSession({
      id: "session-5",
      clientId: "client-alex",
      coachId: "coach-1",
      sessionNumber: 5,
      status: "in_progress",
    }),
    ...overrides,
  };
}

function makeClient(session: Session): Client {
  return {
    id: "client-alex",
    name: "Alex Morgan",
    initials: "AM",
    organisation: "Acme",
    role: "Project Coordinator",
    email: "",
    status: "Active",
    nextSession: "",
    currentFocus: "Build consistency in project judgement.",
    identitySummary: "",
    coachInsight: "",
    preparationStyleOverride: null,
    strengths: [],
    values: [],
    themes: [],
    goals: [],
    actions: [],
    quotes: [],
    sessions: [session],
    journey: [],
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

describe("resolveSuggestedQuestionsForConversation", () => {
  it("prefers prepQuestions over prepAiBrief.questions", () => {
    const questions = resolveSuggestedQuestionsForConversation(
      makeSession({
        prepQuestions:
          "What enabled the progress visible since the last conversation?\n\nWhat still feels difficult with senior colleagues?",
        prepAiBrief: {
          ...EMPTY_PREPARATION_AI_BRIEF,
          questions: [
            "Brief-only question one?",
            "Brief-only question two?",
          ],
        },
      })
    );

    expect(questions).toHaveLength(2);
    expect(questions[0]?.text).toMatch(/enabled the progress/i);
    expect(questions.map(item => item.text).join(" ")).not.toMatch(
      /Brief-only/
    );
  });

  it("falls back to prepAiBrief.questions when prepQuestions is empty", () => {
    const questions = resolveSuggestedQuestionsForConversation(
      makeSession({
        prepQuestions: "",
        prepAiBrief: {
          ...EMPTY_PREPARATION_AI_BRIEF,
          questions: [
            "Where did the recommendation practice show up?",
            "What remains unresolved about ownership?",
            "What enabled progress?",
            "What still feels hard?",
            "Extra fifth question should not appear?",
          ],
        },
      })
    );

    expect(questions).toHaveLength(4);
    expect(questions[0]?.text).toMatch(/recommendation practice/i);
    expect(questions.map(item => item.text).join(" ")).not.toMatch(/fifth/i);
  });

  it("returns empty when no preparation questions exist", () => {
    expect(
      resolveSuggestedQuestionsForConversation(
        makeSession({
          prepQuestions: "",
          prepAiBrief: null,
          coachingQuestions: [],
        })
      )
    ).toEqual([]);
  });
});

describe("LiveSessionWorkspace optional prompts", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("Optional prompts must not call the network");
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows up to four preparation questions without AI calls", async () => {
    const session = makeSession({
      prepQuestions: [
        "What enabled the progress visible since the last conversation?",
        "What still feels difficult with senior colleagues?",
        "Where did behaviour differ from intention?",
        "What is the next developmental edge?",
        "Should not appear as fifth?",
      ].join("\n\n"),
    });
    const initialData = buildCoachWorkspaceViewModel(
      makeClient(session),
      session
    );

    const { container, root } = await renderNode(
      <ToastProvider>
        <LiveSessionWorkspace
          initialData={initialData}
          session={session}
          clientName="Alex Morgan"
          onPersist={async value => value}
          onSessionUpdated={() => undefined}
          onEnded={() => undefined}
        />
      </ToastProvider>
    );

    const details = container.querySelector(
      ".live-session-workspace__advanced"
    ) as HTMLDetailsElement;
    expect(details).toBeTruthy();
    await act(async () => {
      details.open = true;
    });

    expect(container.textContent).toContain(
      "Keep attention on the person. Use prompts only if helpful."
    );
    expect(container.textContent).toContain(
      "What enabled the progress visible since the last conversation?"
    );
    expect(container.textContent).toContain(
      "What is the next developmental edge?"
    );
    expect(container.textContent).not.toContain("Should not appear as fifth?");
    expect(
      container.querySelectorAll(".live-session-workspace__optional-prompts li")
        .length
    ).toBe(4);
    expect(globalThis.fetch).not.toHaveBeenCalled();

    root.unmount();
    container.remove();
  });

  it("keeps helper copy when no prompts are available", async () => {
    const session = makeSession({
      prepQuestions: "",
      prepAiBrief: null,
      coachingQuestions: [],
    });
    const initialData: CoachWorkspaceViewModel = buildCoachWorkspaceViewModel(
      makeClient(session),
      session
    );

    const { container, root } = await renderNode(
      <ToastProvider>
        <LiveSessionWorkspace
          initialData={initialData}
          session={session}
          clientName="Alex Morgan"
          onPersist={async value => value}
          onSessionUpdated={() => undefined}
          onEnded={() => undefined}
        />
      </ToastProvider>
    );

    expect(container.textContent).toContain("Optional prompts");
    expect(container.textContent).toContain(
      "Keep attention on the person. Use prompts only if helpful."
    );
    expect(
      container.querySelector(".live-session-workspace__optional-prompts")
    ).toBeNull();

    root.unmount();
    container.remove();
  });
});
