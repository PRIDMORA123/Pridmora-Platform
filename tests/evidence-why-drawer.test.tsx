/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EvidenceWhyDrawer } from "@/components/development-evidence/evidence-why-drawer";
import type { EvidenceWhyThisPayload } from "@/lib/development-evidence";

const payload: EvidenceWhyThisPayload = {
  insight: "Current position",
  confidence: {
    level: "moderate",
    label: "Moderate",
    basis: "Several reviewed sources support this interpretation.",
    independentSourceCount: 2,
    factors: {
      independentSources: 2,
      recentSources: 2,
      repeatedBehaviours: 1,
      consistencyScore: 0.6,
      humanValidated: true,
      contradictionCount: 0,
      specificityScore: 0.5,
      relevanceScore: 0.7,
    },
  },
  coverage: {
    level: "developing",
    label: "Developing",
    represented: ["feedback"],
    representedLabels: ["Feedback"],
    notRepresented: [],
    notRepresentedLabels: [],
    summary: "Feedback is represented.",
  },
  freshness: "current",
  freshnessLabel: "Current",
  supportingSources: [
    {
      id: "ev-1",
      title: "Alex feedback.docx",
      evidenceTypeLabel: "Stakeholder feedback",
      sourceKind: "uploaded",
      drilldownPath: "evidence:ev-1",
    },
  ],
  contradictoryEvidence: [],
  limitations: ["Single source"],
  observedBehaviours: ["Raises delivery concerns early"],
  developmentImplication: "Keep inviting early delivery concerns.",
};

describe("EvidenceWhyDrawer scrolling shell", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback) => {
        callback(0);
        return 0;
      }
    );
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.style.overflow = "";
    document
      .querySelectorAll(".evidence-drawer-backdrop")
      .forEach(node => node.remove());
    vi.unstubAllGlobals();
  });

  it("portals under document.body so viewport constraints are not clipped by ancestors", () => {
    act(() => {
      root.render(
        <EvidenceWhyDrawer open payload={payload} onClose={() => undefined} />
      );
    });

    const backdrop = document.body.querySelector(".evidence-drawer-backdrop");
    expect(backdrop).not.toBeNull();
    expect(backdrop?.parentElement).toBe(document.body);
    expect(container.querySelector(".evidence-drawer-backdrop")).toBeNull();
  });

  it("keeps the close control in the non-scrolling header and content in the body", () => {
    act(() => {
      root.render(
        <EvidenceWhyDrawer open payload={payload} onClose={() => undefined} />
      );
    });

    const drawer = document.body.querySelector(".evidence-drawer");
    const header = drawer?.querySelector(":scope > .evidence-drawer__header");
    const body = drawer?.querySelector(":scope > .evidence-drawer__body");
    const close = header?.querySelector(".evidence-drawer__close");

    expect(header).not.toBeNull();
    expect(body).not.toBeNull();
    expect(close).not.toBeNull();
    expect(body?.textContent).toContain("Supporting sources");
    expect(header?.textContent).toContain("Why this?");
    expect(header?.querySelector(".development-section")).toBeNull();
  });

  it("locks document scroll while open and restores on close", () => {
    act(() => {
      root.render(
        <EvidenceWhyDrawer open payload={payload} onClose={() => undefined} />
      );
    });
    expect(document.body.style.overflow).toBe("hidden");

    act(() => {
      root.render(
        <EvidenceWhyDrawer
          open={false}
          payload={payload}
          onClose={() => undefined}
        />
      );
    });
    expect(document.body.style.overflow).toBe("");
  });

  it("resets body scroll position when opened", () => {
    const scrollTo = vi.fn();
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      Element.prototype,
      "scrollTo"
    );
    Object.defineProperty(Element.prototype, "scrollTo", {
      configurable: true,
      writable: true,
      value: scrollTo,
    });

    try {
      act(() => {
        root.render(
          <EvidenceWhyDrawer open payload={payload} onClose={() => undefined} />
        );
      });
      expect(scrollTo).toHaveBeenCalled();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(Element.prototype, "scrollTo", originalDescriptor);
      }
    }
  });
});
