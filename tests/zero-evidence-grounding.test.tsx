/** @vitest-environment jsdom */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { buildPersonSummary } from "@/lib/development-evidence/display-copy";
import { normalisePreparationBrief } from "@/lib/prepare/normalise-preparation-brief";
import { PreparationStatus } from "@/components/prepare/preparation-status";
import { evaluatePreparationIsolationAttempt } from "@/lib/coaching-intelligence/preparation-isolation";

describe("Zero-evidence person and preparation grounding", () => {
  it("A. zero conversations + zero evidence → no Current evidence suggests", () => {
    const summary = buildPersonSummary({
      name: "Alex Morgan",
      completedConversationCount: 0,
    });
    expect(summary.toLowerCase()).not.toContain("current evidence suggests");
    expect(summary).toContain(
      "There isn’t enough development evidence yet to describe a pattern."
    );
  });

  it("B. zero evidence → no management role claim", () => {
    const summary = buildPersonSummary({
      name: "Alex Morgan",
      completedConversationCount: 0,
    });
    expect(summary.toLowerCase()).not.toContain("management role");
    expect(summary.toLowerCase()).not.toContain("as a manager");
  });

  it("C. new Project Coordinator does not receive manager/delegation defaults", () => {
    const brief = normalisePreparationBrief({
      primaryFocus: "",
      areasToExplore: [],
      questions: [],
      mode: "assisted",
      isFirstSession: true,
      clientFirstName: "Alex",
      hasApprovedEvidence: false,
    });

    const joined = [...brief.areasToExplore, ...brief.questions, brief.primaryFocus]
      .join(" ")
      .toLowerCase();
    expect(joined).not.toContain("under pressure");
    expect(joined).not.toContain("alex's managers");
    expect(joined).not.toContain("stepping back");
    expect(joined).not.toContain("management ownership");
    expect(joined).not.toContain("delegation");
  });

  it("D. first preparation with no evidence uses neutral prompts", () => {
    const brief = normalisePreparationBrief({
      primaryFocus: "",
      areasToExplore: [],
      questions: [],
      mode: "assisted",
      isFirstSession: true,
      clientFirstName: "Alex",
      hasApprovedEvidence: false,
    });

    expect(brief.primaryFocus.toLowerCase()).toContain("useful");
    expect(brief.areasToExplore).toEqual([]);
    expect(brief.questions).toEqual([
      "What would make this conversation useful?",
      "What do you want to understand better?",
      "What would you like the person to leave clearer about?",
    ]);
  });

  it("G. real evidence still produces evidence-based Person summary", () => {
    const summary = buildPersonSummary({
      name: "Maria Lopez",
      currentPosition:
        "Growing confidence leading former peers while setting clearer expectations.",
      strengths: ["Clarity", "Accountability"],
      priorities: ["Delegation"],
      completedConversationCount: 1,
    });
    expect(summary).toMatch(/Current evidence suggests/);
    expect(summary).toContain("Growing confidence");
    expect(summary.toLowerCase()).not.toContain("management role");
  });

  it("H. cross-client isolation behaviour remains unchanged", () => {
    const result = evaluatePreparationIsolationAttempt({
      draftText:
        "Focus on supporting Jordan under pressure while Alex builds ownership.",
      context: {
        allowedClientName: "Alex Morgan",
        knownOtherNames: ["Jordan Lee"],
        organisationName: "Customer One",
        authorisedNames: ["Customer One"],
      },
      attempt: 1,
    });
    expect(result.maySave).toBe(false);
    expect(result.shouldRetry).toBe(true);
    expect(
      result.status === "definite_cross_client" ||
        result.status === "possible_cross_client"
    ).toBe(true);
  });
});

describe("PreparationStatus failure copy", () => {
  let container: HTMLDivElement;
  let root: Root;

  async function renderView(node: ReactNode) {
    await act(async () => {
      root.render(node);
    });
  }

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

  it("E. refresh failure with no saved prep does not claim existing preparation exists", async () => {
    await renderView(
      <PreparationStatus refreshState="failed" hasSavedPreparation={false} />
    );
    expect(container.textContent).toContain(
      "Preparation could not be generated right now."
    );
    expect(container.textContent).toContain(
      "continue without AI preparation"
    );
    expect(container.textContent).not.toContain(
      "existing preparation remains available"
    );
    expect(container.textContent).not.toContain(
      "Continue with existing preparation"
    );
  });

  it("F. refresh failure with genuine saved preparation still preserves it correctly", async () => {
    await renderView(
      <PreparationStatus
        refreshState="failed"
        hasSavedPreparation
        onContinueWithExisting={() => undefined}
      />
    );
    expect(container.textContent).toContain(
      "Preparation could not be refreshed safely"
    );
    expect(container.textContent).toContain(
      "existing preparation remains available"
    );
    expect(container.textContent).toContain(
      "Continue with existing preparation"
    );
  });
});
