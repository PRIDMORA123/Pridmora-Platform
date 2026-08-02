/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreparationApproachControl } from "@/components/prepare/preparation-approach-control";
import { SessionBriefCard } from "@/components/prepare/session-brief-card";
import {
  PREPARATION_STYLE_DESCRIPTIONS,
  PREPARATION_STYLE_LABELS,
  PREPARATION_STYLE_SHORT_DESCRIPTIONS,
  preparationApproachScopeCopy,
} from "@/lib/preparation-style";

describe("preparation style label maps", () => {
  it("maps Manual to minimal, Assisted to guided, Comprehensive to enhanced", () => {
    expect(PREPARATION_STYLE_LABELS.minimal).toBe("Manual");
    expect(PREPARATION_STYLE_LABELS.guided).toBe("Assisted");
    expect(PREPARATION_STYLE_LABELS.enhanced).toBe("Comprehensive");
  });

  it("exposes the required coach-facing descriptions", () => {
    expect(PREPARATION_STYLE_DESCRIPTIONS.minimal).toBe(
      "No AI preparation. Use your own notes and professional judgement."
    );
    expect(PREPARATION_STYLE_DESCRIPTIONS.guided).toBe(
      "A concise briefing based on the latest approved coaching evidence."
    );
    expect(PREPARATION_STYLE_DESCRIPTIONS.enhanced).toBe(
      "A deeper briefing based on the wider approved coaching journey, including relevant themes and patterns."
    );
    expect(PREPARATION_STYLE_SHORT_DESCRIPTIONS.enhanced).toBe("Full context");
  });

  it("describes relationship and session scope accurately", () => {
    expect(preparationApproachScopeCopy("relationship")).toBe(
      "This approach will be used for future preparation in this coaching relationship."
    );
    expect(preparationApproachScopeCopy("session")).toBe(
      "This approach applies to this preparation only."
    );
  });
});

describe("PreparationApproachControl", () => {
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

  it("displays the current selection with description and scope wording", () => {
    act(() => {
      root.render(
        <PreparationApproachControl
          value="enhanced"
          defaultValue="guided"
          scope="relationship"
          onChangeApproach={() => undefined}
          onRefresh={() => undefined}
        />
      );
    });

    expect(container.textContent).toContain("Preparation approach");
    expect(container.textContent).toContain("Comprehensive");
    expect(container.textContent).toContain("Full context");
    expect(container.textContent).toContain(
      PREPARATION_STYLE_DESCRIPTIONS.enhanced
    );
    expect(container.textContent).toContain(
      preparationApproachScopeCopy("relationship")
    );
    expect(container.textContent).toContain("Your default: Assisted");
    expect(container.textContent).not.toContain("minimal");
    expect(container.textContent).not.toContain("enhanced");
  });

  it("keeps Refresh available when an update is needed and hides it while refreshing", () => {
    const onRefresh = vi.fn();

    act(() => {
      root.render(
        <PreparationApproachControl
          value="guided"
          refreshState="update_available"
          onChangeApproach={() => undefined}
          onRefresh={onRefresh}
        />
      );
    });

    const refreshButton = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "Refresh"
    ) as HTMLButtonElement;
    expect(refreshButton).toBeTruthy();

    act(() => {
      root.render(
        <PreparationApproachControl
          value="guided"
          refreshState="refreshing"
          isRefreshing
          onChangeApproach={() => undefined}
          onRefresh={onRefresh}
        />
      );
    });

    expect(
      Array.from(container.querySelectorAll("button")).some(
        button => button.textContent === "Refresh"
      )
    ).toBe(false);
  });

  it("surfaces failed refresh with try again while keeping the action available", () => {
    const onRefresh = vi.fn();

    act(() => {
      root.render(
        <PreparationApproachControl
          value="guided"
          refreshState="failed"
          onChangeApproach={() => undefined}
          onRefresh={onRefresh}
        />
      );
    });

    const tryAgain = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "Try again"
    ) as HTMLButtonElement;
    expect(tryAgain).toBeTruthy();

    act(() => {
      tryAgain.click();
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("hides refresh for Manual preparation", () => {
    act(() => {
      root.render(
        <PreparationApproachControl
          value="minimal"
          onChangeApproach={() => undefined}
          onRefresh={() => undefined}
        />
      );
    });

    expect(container.textContent).toContain("Manual");
    expect(container.textContent).not.toContain("Refresh");
  });
});

describe("SessionBriefCard preparation modes", () => {
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

  it("shows Manual preparation without generated brief content", () => {
    act(() => {
      root.render(
        <SessionBriefCard
          clientName="Sarah Thompson"
          mode="manual"
          purpose="Should not appear as AI focus"
          topics={["Hidden topic"]}
          questions={["Hidden question?"]}
          onStartSession={() => undefined}
          onReview={() => undefined}
        />
      );
    });

    expect(container.textContent).toContain("Preparation ready");
    expect(container.textContent).toContain("Manual preparation");
    expect(container.textContent).toContain("No generated brief is active.");
    expect(container.textContent).not.toContain("Primary focus");
    expect(container.textContent).not.toContain("Hidden topic");
    expect(container.textContent).not.toContain("Hidden question?");
    expect(
      Array.from(container.querySelectorAll("button")).some(
        button => button.textContent === "Add preparation notes"
      )
    ).toBe(true);
  });

  it("renders Assisted lists semantically and limits content", () => {
    act(() => {
      root.render(
        <SessionBriefCard
          clientName="Sarah Thompson"
          mode="assisted"
          hasApprovedEvidence
          purpose="Explore ownership of delivery."
          topics={[
            "Whether supervisors have taken greater ownership.",
            "Progress since the previous conversation.",
            "Standards being held across the team.",
            "Fourth topic should not show",
          ]}
          questions={[
            "What are you noticing?",
            "What has shifted?",
            "What would help next?",
            "Extra question?",
          ]}
          previousCommitment="Follow up with two supervisors"
          onStartSession={() => undefined}
          onReview={() => undefined}
        />
      );
    });

    expect(container.textContent).toContain("Preparation ready");
    expect(container.textContent).toContain(
      "Prepared from Sarah's approved coaching evidence."
    );
    expect(container.querySelector("ul.preparation-brief__list")).toBeTruthy();
    expect(
      container.querySelectorAll("ul.preparation-brief__list li")
    ).toHaveLength(3);
    expect(
      container.querySelector("ol.preparation-brief__questions")
    ).toBeTruthy();
    expect(
      container.querySelectorAll("ol.preparation-brief__questions li")
    ).toHaveLength(3);
    expect(container.textContent).toContain("Follow up with two supervisors");
    expect(container.textContent).not.toContain("Fourth topic should not show");
    expect(container.textContent).not.toContain("View deeper context");
    expect(container.querySelector(".session-brief-card__q-index")).toBeNull();
  });

  it("keeps Comprehensive concise with progressive disclosure", () => {
    act(() => {
      root.render(
        <SessionBriefCard
          clientName="Sarah Thompson"
          mode="comprehensive"
          purpose="Explore ownership."
          supportingInsight="A recurring pattern around ownership."
          deeperContextSlot={<p>Relevant pattern detail</p>}
          onStartSession={() => undefined}
          onReview={() => undefined}
        />
      );
    });

    expect(container.textContent).toContain("View deeper context");
    expect(container.textContent).not.toContain("Relevant pattern detail");
    expect(container.textContent).not.toContain(
      "A recurring pattern around ownership."
    );

    const deeper = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent === "View deeper context"
    ) as HTMLButtonElement;

    act(() => {
      deeper.click();
    });

    expect(container.textContent).toContain("Relevant pattern detail");
    expect(container.textContent).toContain(
      "A recurring pattern around ownership."
    );
  });

  it("shows the empty previous commitment state", () => {
    act(() => {
      root.render(
        <SessionBriefCard
          clientName="Alex"
          mode="assisted"
          purpose="Explore confidence."
          onStartSession={() => undefined}
          onReview={() => undefined}
        />
      );
    });

    expect(container.textContent).toContain(
      "No previous commitment was recorded."
    );
  });
});
