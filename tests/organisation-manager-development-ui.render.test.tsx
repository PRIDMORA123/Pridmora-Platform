/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagerDevelopmentIntelligenceView as Payload } from "@/lib/manager-development-intelligence";
import { LEAD_PRIVACY_BOUNDARY_COPY } from "@/lib/manager-development-intelligence/ui-copy";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { ManagerDevelopmentIntelligenceView } from "@/components/organisation/manager-development-intelligence-view";

function basePayload(overrides: Partial<Payload> = {}): Payload {
  return {
    status: "insufficient_evidence",
    privacyNote: "Server privacy note",
    readiness: { sufficientManagerPopulation: false },
    patterns: [],
    nextStep: null,
    message:
      "Not enough evidence yet to identify organisation-wide development patterns.",
    ...overrides,
  };
}

describe("Manager Development Intelligence Lead UI states", () => {
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

  function render(data: Payload, variant: "full" | "overview" = "full") {
    act(() => {
      root.render(
        <ManagerDevelopmentIntelligenceView data={data} variant={variant} />
      );
    });
  }

  it("shows privacy message and low-data state without near-threshold counts", () => {
    render(
      basePayload({
        readiness: { sufficientManagerPopulation: false },
      })
    );
    const text = container.textContent || "";
    expect(text).toContain(LEAD_PRIVACY_BOUNDARY_COPY);
    expect(text).toContain("Not enough evidence yet");
    expect(text).toContain("larger Manager population");
    expect(text).not.toMatch(/\b[1-4]\s+of\s+5\b/);
    expect(text).not.toContain("4 of 5");
    expect(text).not.toContain("%");
    expect(text).not.toMatch(/contributor/i);
    expect(text).not.toMatch(/source count/i);
  });

  it("shows population-ready but no-theme state without inventing patterns", () => {
    render(
      basePayload({
        readiness: { sufficientManagerPopulation: true },
        message: null,
      })
    );
    const text = container.textContent || "";
    expect(text).toContain(
      "Organisation-wide Manager development patterns are not yet available."
    );
    expect(text).not.toContain("Delegation");
    expect(text).not.toContain("larger Manager population");
    expect(container.querySelectorAll(".manager-dev-intel__pattern")).toHaveLength(
      0
    );
  });

  it("renders eligible patterns with qualitative strength only", () => {
    render(
      basePayload({
        status: "patterns_available",
        readiness: { sufficientManagerPopulation: true },
        message: null,
        patterns: [
          {
            themeKey: "delegation",
            themeLabel: "Delegation",
            strength: "emerging",
          },
          {
            themeKey: "feedback",
            themeLabel: "Feedback",
            strength: "developing",
          },
        ],
        nextStep: {
          title: "Strengthen delegation practice",
          suggestion:
            "Consider targeted development or peer learning around delegation, trust and appropriate ownership.",
        },
      })
    );
    const text = container.textContent || "";
    expect(text).toContain("Delegation");
    expect(text).toContain("Feedback");
    expect(text).toContain("Emerging");
    expect(text).toContain("Developing");
    expect(text).toContain("Strengthen delegation practice");
    expect(text).toContain("What you could do next");
    expect(text).toContain(LEAD_PRIVACY_BOUNDARY_COPY);
    expect(text).not.toContain("5 Managers");
    expect(text).not.toContain("contributor");
    expect(text).not.toMatch(/\d+%/);
    expect(text).not.toContain("sourceCount");
    expect(text).not.toContain("Alice");
    expect(text).not.toContain("Bob");
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(
      container.querySelectorAll('a[href*="/organisation/members"]')
    ).toHaveLength(0);
  });

  it("overview variant links only to the full Manager Development view", () => {
    render(
      basePayload({
        status: "patterns_available",
        readiness: { sufficientManagerPopulation: true },
        message: null,
        patterns: [
          {
            themeKey: "delegation",
            themeLabel: "Delegation",
            strength: "emerging",
          },
        ],
        nextStep: {
          title: "Strengthen delegation practice",
          suggestion: "Consider peer learning around delegation.",
        },
      }),
      "overview"
    );
    const links = Array.from(container.querySelectorAll("a")).map(a =>
      a.getAttribute("href")
    );
    expect(links).toEqual(["/organisation/manager-development"]);
    expect(container.textContent).toContain(
      "What should I know about management development here?"
    );
  });

  it("only binds Lead-safe pattern fields in the view", () => {
    render(
      basePayload({
        status: "patterns_available",
        readiness: { sufficientManagerPopulation: true },
        message: null,
        patterns: [
          {
            themeKey: "delegation",
            themeLabel: "Delegation",
            strength: "emerging",
          },
        ],
        nextStep: {
          title: "Strengthen delegation practice",
          suggestion: "Consider peer learning around delegation.",
        },
      })
    );
    const text = container.textContent || "";
    expect(text).toContain("Delegation");
    expect(text).toContain("Emerging");
    // Forbidden private-content markers must never appear from UI composition.
    expect(text).not.toMatch(/I reflected that/i);
    expect(text).not.toMatch(/Aurelia said/i);
    expect(text).not.toMatch(/raw focus/i);
  });
});
