/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PatternReviewPanel } from "@/components/identity-intelligence/pattern-review-panel";
import { PatternsOverTimeSection } from "@/components/patterns/pattern-panels";
import type { CoachingPattern } from "@/lib/patterns/types";

function makePattern(overrides: Partial<CoachingPattern> = {}): CoachingPattern {
  return {
    id: "pattern-1",
    relationshipId: "rel-1",
    title: "Delegation under pressure",
    description: "Leaving decisions with managers while clarifying outcomes.",
    strength: "emerging",
    status: "strengthening",
    evidenceCount: 2,
    evidence: [
      {
        sourceType: "development_observation",
        sourceId: "obs-1",
        sessionId: "session-1",
        sourceDate: "2026-08-01T09:23:57.013+00:00",
      },
    ],
    coachReviewed: false,
    coachAccepted: null,
    ...overrides,
  };
}

describe("PatternReviewPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    Element.prototype.scrollIntoView = vi.fn();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows pattern title, evidence, and coach decision actions", () => {
    const onSubmit = vi.fn(async () => undefined);
    const onClose = vi.fn();

    act(() => {
      root.render(
        <PatternReviewPanel
          pattern={makePattern()}
          sessionNumbers={new Map([["session-1", 1]])}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      );
    });

    expect(container.textContent).toContain("Review pattern");
    expect(container.textContent).toContain("Delegation under pressure");
    expect(container.textContent).toContain("Development observation");
    expect(container.textContent).toContain("1 August 2026");
    expect(container.textContent).not.toContain("2026-08-01T09:23:57");
    expect(container.textContent).toContain("Accept pattern");
    expect(container.textContent).toContain("Not relevant");
    expect(container.textContent).toContain("Close review");
  });

  it("moves focus to the review heading", () => {
    act(() => {
      root.render(
        <PatternReviewPanel
          pattern={makePattern()}
          onClose={() => undefined}
          onSubmit={async () => undefined}
        />
      );
    });

    const heading = container.querySelector(
      ".pattern-review-panel__title"
    ) as HTMLElement;
    expect(document.activeElement).toBe(heading);
  });

  it("accepts and rejects via coach actions", async () => {
    const onSubmit = vi.fn(async () => undefined);

    act(() => {
      root.render(
        <PatternReviewPanel
          pattern={makePattern()}
          onClose={() => undefined}
          onSubmit={onSubmit}
        />
      );
    });

    await act(async () => {
      const accept = Array.from(container.querySelectorAll("button")).find(
        button => button.textContent === "Accept pattern"
      );
      accept?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "accept" })
    );

    await act(async () => {
      const reject = Array.from(container.querySelectorAll("button")).find(
        button => button.textContent === "Not relevant"
      );
      reject?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "no_longer_relevant" })
    );
  });
});

describe("PatternsOverTimeSection inline review", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    Element.prototype.scrollIntoView = vi.fn();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("opens the review panel adjacent to the selected pattern", () => {
    const pattern = makePattern();

    act(() => {
      root.render(
        <PatternsOverTimeSection
          patterns={[pattern]}
          sessionNumbers={new Map([["session-1", 1]])}
          reviewingPattern={pattern}
          onReview={() => undefined}
          onCloseReview={() => undefined}
          onSubmitReview={async () => undefined}
        />
      );
    });

    const item = container.querySelector(".patterns-over-time__item");
    const panel = item?.querySelector(".pattern-review-panel--inline");
    expect(panel).not.toBeNull();
    expect(container.querySelectorAll(".pattern-review-panel").length).toBe(1);
    expect(
      container.querySelector("button.identity-button.is-secondary")?.textContent
    ).toMatch(/Review pattern|View reviewed pattern/);
  });
});
