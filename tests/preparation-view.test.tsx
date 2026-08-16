/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreparationView } from "@/components/prepare/preparation-view";
import { ToastProvider } from "@/components/feedback/toast-provider";
import type { PreparationIntelligenceViewModel } from "@/lib/preparation-intelligence";

const intelligence: PreparationIntelligenceViewModel = {
  suggestedFocus: "Clarify accountability without taking control.",
  suggestedQuestions: [
    "What would make this conversation useful today?",
    "Where does your involvement currently add the most value?",
    "Where might it unintentionally limit management ownership?",
  ],
  suggestedFramework: null,
  approachSummary: null,
  previousConversation: null,
  outstandingCommitments: [],
  recentReflection: null,
  developmentUpdates: [],
};

const baseProps = {
  conversationId: "session-2",
  clientName: "Sarah Thompson",
  intelligence,
  initialPreparation: {
    prepPurpose: "Clarify accountability without taking control.",
    prepTopics:
      "How pressure changes involvement\nWhere managers should own decisions\nWhat makes stepping back difficult",
    prepQuestions:
      "What would make this conversation useful today?\n\nWhere does your involvement currently add the most value?",
    prepRisks: "",
    prepPrivateNotes: "",
    focus: "Clarify accountability without taking control.",
  },
  preparationStyle: "guided" as const,
  refreshState: "idle" as const,
  briefSummary: "Clarify accountability without taking control.",
  focusTags: [
    "How pressure changes involvement",
    "Where managers should own decisions",
  ],
  commitmentStatements: [] as string[],
  suggestedTopics: [] as string[],
  suggestedQuestions: [] as string[],
  hasApprovedEvidence: true,
  isFirstSession: false,
  onSave: vi.fn(async () => undefined),
  onOpenContext: vi.fn(),
  onChangeApproach: vi.fn(),
  onStartSession: vi.fn(),
  onRefreshBrief: vi.fn(),
};

describe("PreparationView", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders one authoritative briefing and one Start conversation action", () => {
    act(() => {
      root.render(
        <ToastProvider>
          <PreparationView {...baseProps} />
        </ToastProvider>
      );
    });

    expect(container.textContent).toContain("Conversation focus");
    expect(container.textContent).not.toContain("Primary focus");
    expect(container.textContent).toContain("Areas to explore");
    expect(container.textContent).toContain("Questions to consider");
    expect(
      Array.from(container.querySelectorAll("button")).filter(
        button => button.textContent === "Start / Record Conversation" || button.textContent === "Start conversation"
      )
    ).toHaveLength(1);
    expect(container.textContent).not.toContain(
      "Your conversation draft is ready"
    );
    expect(container.textContent).not.toContain("Use prepared draft");
    expect(container.textContent).not.toContain("Review draft");
    expect(container.textContent).not.toContain("Open full brief");
    expect(container.textContent).not.toContain("Close session brief");
    expect(container.textContent).not.toContain("Review session brief");
  });

  it("shows complete primary-focus and area sentences", () => {
    act(() => {
      root.render(
        <ToastProvider>
          <PreparationView {...baseProps} />
        </ToastProvider>
      );
    });

    expect(container.textContent).toContain(
      "Clarify accountability without taking control."
    );
    expect(container.textContent).toContain("How pressure changes involvement");
    expect(container.textContent).not.toMatch(/accountability p…|accountability p\.\.\./);
  });

  it("exposes Refine preparation instead of duplicate draft surfaces", () => {
    act(() => {
      root.render(
        <ToastProvider>
          <PreparationView {...baseProps} />
        </ToastProvider>
      );
    });

    expect(container.textContent).toContain("Refine preparation");
    expect(container.textContent).toContain("Preparation ready");
  });

  it("supports Manual mode without generated briefing body", () => {
    act(() => {
      root.render(
        <ToastProvider>
          <PreparationView
            {...baseProps}
            preparationStyle="minimal"
            showAiPreparation={false}
          />
        </ToastProvider>
      );
    });

    expect(container.textContent).toContain("Manual preparation");
    expect(container.textContent).not.toContain("Primary focus");
  });

  it("shows update-available status copy when refresh is required", () => {
    act(() => {
      root.render(
        <ToastProvider>
          <PreparationView {...baseProps} refreshState="update_available" />
        </ToastProvider>
      );
    });

    expect(container.textContent).toContain("Update available");
    expect(container.textContent).toContain(
      "Refresh the briefing to use the latest approved evidence."
    );
  });

  it("shows refresh failure without removing the briefing", () => {
    act(() => {
      root.render(
        <ToastProvider>
          <PreparationView
            {...baseProps}
            refreshState="failed"
            hasSavedPreparation
          />
        </ToastProvider>
      );
    });

    expect(container.textContent).toContain(
      "Preparation could not be refreshed safely"
    );
    expect(container.textContent).toContain("Conversation focus");
    expect(container.textContent).not.toContain("Primary focus");
  });

  it("renders Development focus when longitudinal focus is supplied", () => {
    act(() => {
      root.render(
        <ToastProvider>
          <PreparationView
            {...baseProps}
            developmentFocus="Build consistency in judgement during senior meetings."
          />
        </ToastProvider>
      );
    });

    expect(container.textContent).toContain("Development focus");
    expect(container.textContent).toContain(
      "Build consistency in judgement during senior meetings."
    );
    expect(container.textContent).toContain("Conversation focus");
  });
});
