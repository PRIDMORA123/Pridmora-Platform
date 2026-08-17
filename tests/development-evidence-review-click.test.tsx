/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DevelopmentEvidenceView } from "@/components/development-evidence/development-evidence-view";
import type { Client } from "@/lib/types";

const apiJson = vi.fn();

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>(
    "@/lib/api-client"
  );
  return {
    ...actual,
    apiJson: (...args: unknown[]) => apiJson(...args),
    errorMessage: actual.errorMessage,
  };
});

function baseClient(): Client {
  return {
    id: "d3082253-71db-4fd5-a68b-a82d5069a70b",
    name: "Kate Pridmore",
    initials: "KP",
    organisation: "BSH",
    role: "Self development",
    email: "",
    identityMode: "standard",
    displayLabel: "My development",
    confidentialReference: null,
    aiNameAllowed: false,
    status: "Active",
    nextSession: "Not scheduled",
    currentFocus: "Personal development record",
    identitySummary: "",
    coachInsight: "",
    preparationStyleOverride: null,
    strengths: [],
    values: [],
    themes: [],
    goals: [],
    actions: [],
    quotes: [],
    sessions: [],
    journey: [],
    isSelfDevelopment: true,
  };
}

const pendingItem = {
  id: "ev-pending-1",
  title: "pilot-test-evidence.txt",
  evidenceType: "other_document",
  evidenceTypeLabel: "Other document",
  evidenceDate: null,
  sourceLabel: null,
  processingStatus: "ready",
  reviewStatus: "pending_review",
  freshnessLabel: "Current",
  freshnessClass: "current",
  includeInIntelligence: false,
  observationCount: 1,
  approvedObservationCount: 0,
};

const listPayload = {
  items: [pendingItem],
  confidence: {
    level: "low",
    label: "Low",
    basis: "Limited approved evidence.",
    independentSourceCount: 0,
    factors: {
      independentSources: 0,
      recentSources: 0,
      repeatedBehaviours: 0,
      consistencyScore: 0,
      humanValidated: false,
      contradictionCount: 0,
      specificityScore: 0,
      relevanceScore: 0,
    },
  },
  coverage: {
    level: "narrow",
    label: "Narrow",
    represented: [],
    representedLabels: [],
    notRepresented: [],
    notRepresentedLabels: [],
    summary: "No approved evidence yet.",
  },
  uploadableTypes: [{ value: "other_document", label: "Other document" }],
};

describe("Development Evidence Review button", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    apiJson.mockReset();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("clicking Review loads detail and shows the review panel", async () => {
    let resolveDetail: (value: unknown) => void = () => undefined;
    const detailPromise = new Promise(resolve => {
      resolveDetail = resolve;
    });

    apiJson.mockImplementation(async (url: string) => {
      if (
        String(url).includes("/api/development-evidence/") &&
        !String(url).includes("/item/")
      ) {
        return listPayload;
      }
      if (String(url).includes("/api/development-evidence/item/ev-pending-1")) {
        return detailPromise;
      }
      throw new Error(`Unexpected apiJson call: ${url}`);
    });

    await act(async () => {
      root.render(
        <DevelopmentEvidenceView client={baseClient()} onBack={() => undefined} />
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    const reviewButton = container.querySelector(
      '[data-testid="evidence-review-open-ev-pending-1"]'
    ) as HTMLButtonElement | null;
    expect(reviewButton).toBeTruthy();

    await act(async () => {
      reviewButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    });

    expect(
      container.querySelector('[data-testid="evidence-review-panel"]')
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="evidence-review-loading"]')
    ).toBeTruthy();
    expect(container.textContent).toContain("Loading observations for review");

    await act(async () => {
      resolveDetail({
        evidence: {
          id: "ev-pending-1",
          title: "pilot-test-evidence.txt",
          reviewStatus: "pending_review",
          processingStatus: "ready",
        },
        observations: [
          {
            id: "obs-1",
            title: "Observed calm pacing",
            description: "Kept the conversation paced and clear.",
            reviewStatus: "proposed",
            behaviouralEvidence: "Kept the conversation paced and clear.",
          },
        ],
        observationSourceEvidence: [],
        document: {
          id: "doc-1",
          fileName: "pilot-test-evidence.txt",
          hasExtractedText: true,
        },
      });
      await detailPromise;
      await Promise.resolve();
    });

    expect(
      container.querySelector('[data-testid="evidence-review-loading"]')
    ).toBeNull();
    expect(container.textContent).toContain("Include all");
    expect(container.textContent).toContain("Approve evidence");
    expect(
      container.querySelector('[data-testid="evidence-review-approve"]')
    ).toBeTruthy();
    expect(container.textContent).toMatch(
      /No uploaded evidence changes Development Intelligence until you approve it/
    );
  });

  it("surfaces an error when Review detail load fails", async () => {
    apiJson.mockImplementation(async (url: string) => {
      if (
        String(url).includes("/api/development-evidence/") &&
        !String(url).includes("/item/")
      ) {
        return listPayload;
      }
      if (String(url).includes("/api/development-evidence/item/ev-pending-1")) {
        throw new Error("Evidence not found or access denied.");
      }
      throw new Error(`Unexpected apiJson call: ${url}`);
    });

    await act(async () => {
      root.render(
        <DevelopmentEvidenceView client={baseClient()} onBack={() => undefined} />
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    const reviewButton = container.querySelector(
      '[data-testid="evidence-review-open-ev-pending-1"]'
    ) as HTMLButtonElement | null;

    await act(async () => {
      reviewButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
      await Promise.resolve();
    });

    expect(container.textContent).toMatch(
      /Evidence not found or access denied|Unable to load evidence for review/i
    );
    expect(
      container.querySelector('[data-testid="evidence-review-unavailable"]')
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="evidence-review-approve"]')
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="evidence-review-panel"]')
    ).toBeTruthy();
  });
});
