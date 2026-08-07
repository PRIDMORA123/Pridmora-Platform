/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreparationRefinement } from "@/components/prepare/preparation-refinement";
import { SessionBriefCard } from "@/components/prepare/session-brief-card";
import { PremiumPrepareWorkspace } from "@/components/coaching/premium-prepare-workspace";
import { ToastProvider } from "@/components/feedback/toast-provider";
import type { PreparationIntelligenceViewModel } from "@/lib/preparation-intelligence";

function pressKey(element: HTMLElement, key: string) {
  element.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
  );
  if (key === " " || key === "Enter") {
    element.click();
  }
}

describe("PreparationRefinement disclosure", () => {
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

  it("starts closed with review copy and no Show/Hide labels", () => {
    act(() => {
      root.render(
        <PreparationRefinement>
          <p>Editable fields</p>
        </PreparationRefinement>
      );
    });

    const toggle = container.querySelector(
      "button.preparation-refinement__toggle"
    ) as HTMLButtonElement;

    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBeTruthy();
    expect(toggle.textContent).toContain("Refine preparation");
    expect(toggle.textContent).toContain(
      "Adjust the focus, questions or private preparation notes only if useful."
    );
    expect(toggle.textContent).not.toMatch(/\bShow\b/);
    expect(toggle.textContent).not.toMatch(/\bHide\b/);
    expect(container.textContent).not.toContain("Optional refinements");
    expect(container.textContent).not.toContain("Editable fields");
  });

  it("opens on click and keyboard activation", () => {
    act(() => {
      root.render(
        <PreparationRefinement>
          <p>Editable fields</p>
        </PreparationRefinement>
      );
    });

    const toggle = container.querySelector(
      "button.preparation-refinement__toggle"
    ) as HTMLButtonElement;

    act(() => {
      toggle.click();
    });

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("Editable fields");

    act(() => {
      toggle.click();
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    act(() => {
      pressKey(toggle, "Enter");
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("SessionBriefCard", () => {
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

  it("shows brief-ready copy and keeps Start conversation primary", () => {
    const onStart = vi.fn();
    const onReview = vi.fn();

    act(() => {
      root.render(
        <SessionBriefCard
          clientName="John Smith"
          purpose="Help John separate observed team behaviour from assumptions."
          topics={[
            "Observable team behaviours",
            "Previous attempts and responses",
            "Influence and practical next steps",
            "Hidden fourth topic",
          ]}
          questions={[
            "What are you noticing in the team?",
            "What have you already tried?",
            "What would one practical next step be?",
            "What support do you need?",
            "How will you know it is working?",
          ]}
          previousCommitment="Follow up with two direct reports"
          onStartSession={onStart}
          onReview={onReview}
        />
      );
    });

    expect(container.textContent).toContain("Preparation ready");
    expect(container.textContent).toContain(
      "Prepared from the information currently available."
    );
    expect(container.textContent).not.toContain("Optional refinements");
    expect(container.textContent).not.toContain("Refine preparation");
    expect(container.textContent).not.toContain("Supporting context available");

    const buttons = Array.from(container.querySelectorAll("button"));
    expect(
      buttons.some(button => button.textContent === "Start / Record Conversation" || button.textContent === "Start conversation")
    ).toBe(true);
    expect(
      buttons.some(button => button.textContent === "Review session brief")
    ).toBe(true);

    const primary = container.querySelector(
      ".prepare-ready__actions .identity-button--primary, .prepare-ready__actions .is-primary"
    );
    expect(primary?.textContent).toMatch(/Start (\/ Record )?Conversation|Start conversation/);

    expect(container.textContent).toContain("Observable team behaviours");
    expect(container.textContent).not.toContain("Hidden fourth topic");
    expect(container.textContent).not.toContain("What support do you need?");
    expect(
      buttons.some(button =>
        /view \d+ more question/i.test(button.textContent || "")
      )
    ).toBe(false);

    const start = buttons.find(
      button => button.textContent === "Start / Record Conversation" || button.textContent === "Start conversation"
    );
    act(() => {
      start?.click();
    });
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("shows additional context actions when available", () => {
    const onOpenSupportingContext = vi.fn();
    const onViewDetailedBrief = vi.fn();

    act(() => {
      root.render(
        <SessionBriefCard
          clientName="Alex"
          purpose="Explore confidence."
          hasSupportingContext
          hasDetailedBrief
          onOpenSupportingContext={onOpenSupportingContext}
          onViewDetailedBrief={onViewDetailedBrief}
          onStartSession={() => undefined}
          onReview={() => undefined}
        />
      );
    });

    expect(container.textContent).toContain("Additional context available");
    expect(container.textContent).toContain("View additional context");
    expect(container.textContent).toContain("View detailed brief");
    expect(container.textContent).not.toContain("View supporting context");

    const contextButton = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "View additional context"
    );
    const briefButton = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "View detailed brief"
    );

    act(() => {
      contextButton?.click();
      briefButton?.click();
    });

    expect(onOpenSupportingContext).toHaveBeenCalledTimes(1);
    expect(onViewDetailedBrief).toHaveBeenCalledTimes(1);
  });

  it("omits context row when no supporting context or detailed brief", () => {
    act(() => {
      root.render(
        <SessionBriefCard
          clientName="Alex"
          purpose="Explore confidence."
          onStartSession={() => undefined}
          onReview={() => undefined}
        />
      );
    });

    expect(container.textContent).not.toContain("Additional context available");
    expect(container.textContent).not.toContain("View detailed brief");
  });

  it("wires review button aria state and busy start protection", () => {
    const onStart = vi.fn();
    const onReview = vi.fn();

    act(() => {
      root.render(
        <SessionBriefCard
          clientName="Alex"
          purpose="Explore confidence."
          startBusy
          reviewOpen={false}
          reviewPanelId="review-panel"
          onStartSession={onStart}
          onReview={onReview}
        />
      );
    });

    const review = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "Review session brief"
    ) as HTMLButtonElement;
    expect(review.getAttribute("aria-expanded")).toBe("false");
    expect(review.getAttribute("aria-controls")).toBe("review-panel");

    act(() => {
      review.click();
    });
    expect(onReview).toHaveBeenCalledTimes(1);

    const start = Array.from(container.querySelectorAll("button")).find(
      button => /starting/i.test(button.textContent || "")
    ) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    act(() => {
      start.click();
    });
    expect(onStart).not.toHaveBeenCalled();
  });

  it("uses Close session brief while review is open", () => {
    act(() => {
      root.render(
        <SessionBriefCard
          clientName="Alex"
          purpose="Explore confidence."
          reviewOpen
          reviewPanelId="review-panel"
          onStartSession={() => undefined}
          onReview={() => undefined}
        />
      );
    });

    expect(container.textContent).toContain("Close session brief");
  });
});

describe("PremiumPrepareWorkspace / PreparationView canvas", () => {
  let container: HTMLDivElement;
  let root: Root;

  const intelligence = {
    suggestedFocus: "Explore ownership",
    suggestedQuestions: ["What are you noticing?"],
    outstandingCommitments: [],
    previousConversation: null,
    recentReflection: null,
    developmentUpdates: [],
    suggestedFramework: null,
    approachSummary: null,
  } as PreparationIntelligenceViewModel;

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

  it("shows one briefing, refine disclosure, and a single Start conversation action", () => {
    act(() => {
      root.render(
        <ToastProvider>
          <PremiumPrepareWorkspace
            conversationId="session-1"
            clientName="Sarah Thompson"
            intelligence={intelligence}
            initialPreparation={{
              prepPurpose: "Explore ownership",
              prepTopics: "Delegation\nAccountability",
              prepQuestions: "What are you noticing?",
              prepRisks: "",
              prepPrivateNotes: "",
              focus: "Explore ownership",
            }}
            preparationStyle="guided"
            refreshState="idle"
            briefSummary="Explore ownership while maintaining standards."
            focusTags={["Delegation"]}
            commitmentStatements={[
              "Continue asking supervisors to propose solutions",
            ]}
            hasApprovedEvidence
            onSave={async () => undefined}
            onOpenContext={() => undefined}
            onChangeApproach={() => undefined}
            onStartSession={() => undefined}
          />
        </ToastProvider>
      );
    });

    expect(container.textContent).toContain("Preparation ready");
    expect(container.textContent).toContain("Preparation approach");
    expect(container.textContent).toContain("Standard");
    expect(container.textContent).toContain("Primary focus");
    expect(container.textContent).toContain("Refine preparation");
    expect(container.textContent).not.toContain("Your conversation draft is ready");
    expect(container.textContent).not.toContain("Use prepared draft");
    expect(container.textContent).not.toContain("Review session brief");
    expect(container.textContent).not.toContain("Close session brief");

    const startButtons = Array.from(container.querySelectorAll("button")).filter(
      button => button.textContent === "Start / Record Conversation" || button.textContent === "Start conversation"
    );
    expect(startButtons).toHaveLength(1);

    const refineButton = Array.from(container.querySelectorAll("button")).find(
      button => /Refine preparation/i.test(button.textContent || "")
    ) as HTMLButtonElement;

    expect(
      container.querySelector(".preparation-refinement__panel")
    ).toBeNull();

    act(() => {
      refineButton.click();
    });

    expect(
      container.querySelector(".preparation-refinement__panel")
    ).toBeTruthy();
    expect(refineButton.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("Purpose or primary focus");
    expect(container.textContent).toContain("Save changes");
  });
});
