/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/organisation/intelligence",
}));

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

const apiJson = vi.fn(
  async (..._args: unknown[]): Promise<Record<string, unknown>> => ({
    snapshot: null,
    history: [],
    defaultPeriod: {
      preset: "last_90_days",
      periodStart: "2026-05-07",
      periodEnd: "2026-08-04",
      previousPeriodStart: "2026-02-06",
      previousPeriodEnd: "2026-05-06",
      label: "Last 90 days",
      comparisonLabel: "Compared with previous period",
    },
    privacyNote: "Privacy note",
    confidentialityNote: "Confidentiality note",
  })
);

vi.mock("@/lib/api-client", () => ({
  apiJson: (...args: unknown[]) => apiJson(...args),
}));

import OrganisationIntelligencePage from "@/app/organisation/intelligence/page";

describe("organisation intelligence empty-state UI", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    apiJson.mockReset();
    apiJson.mockImplementation(async () => ({
      snapshot: null,
      history: [],
      defaultPeriod: {
        preset: "last_90_days",
        periodStart: "2026-05-07",
        periodEnd: "2026-08-04",
        previousPeriodStart: "2026-02-06",
        previousPeriodEnd: "2026-05-06",
        label: "Last 90 days",
        comparisonLabel: "Compared with previous period",
      },
      privacyNote: "Privacy note",
      confidentialityNote: "Confidentiality note",
    }));
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

  async function renderPage() {
    await act(async () => {
      root.render(<OrganisationIntelligencePage />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("shows one generate action, privacy notice, controls and value steps", async () => {
    await renderPage();

    expect(container.textContent).toContain("Privacy protected");
    expect(container.textContent).toContain("Reporting period");
    expect(container.textContent).toContain("Not yet generated");
    expect(container.textContent).toContain("5 relationships");
    expect(container.textContent).toContain("People Development Intelligence");
    expect(container.textContent).toContain(
      "Patterns emerging through developmental work with people"
    );
    expect(container.textContent).toContain("Manager Development");
    expect(container.textContent).toContain(
      "Your organisation is beginning to build a clearer picture."
    );
    expect(container.textContent).toContain("Record development evidence");
    expect(container.textContent).toContain("Aggregate it safely");
    expect(container.textContent).toContain("Identify development patterns");
    expect(container.textContent).toContain("Support informed decisions");
    expect(container.textContent).not.toContain("[object Event]");

    const generateButtons = Array.from(
      container.querySelectorAll("button")
    ).filter(button =>
      /Generate Executive Brief/i.test(button.textContent || "")
    );
    expect(generateButtons).toHaveLength(1);

    const review = container.querySelector(
      'a[href="/organisation"].btn.secondary'
    );
    expect(review?.textContent).toContain("Review coaching activity");

    const tipTrigger = container.querySelector(
      'button[aria-label="About the privacy threshold"]'
    );
    expect(tipTrigger).not.toBeNull();
    await act(async () => {
      tipTrigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain(
      "A minimum of five contributing relationships helps reduce the risk of identifying individuals."
    );
    expect(container.textContent).not.toContain("[object Event]");
  });

  it("changes reporting period without storing an Event object", async () => {
    await renderPage();

    const select = container.querySelector(
      'select[aria-label="Reporting period"]'
    ) as HTMLSelectElement | null;
    expect(select).not.toBeNull();

    await act(async () => {
      select!.value = "last_30_days";
      select!.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(select!.value).toBe("last_30_days");
    expect(container.textContent).toContain("Selected reporting period: Last 30 days");
    expect(container.textContent).not.toContain("[object Event]");
  });

  it("generate intelligence does not pass a click Event into the API body", async () => {
    await renderPage();
    apiJson.mockClear();

    apiJson.mockImplementation(async (url: unknown, init?: unknown) => {
      if (String(url).includes("/generate")) {
        const body = JSON.parse(
          String((init as RequestInit | undefined)?.body || "{}")
        ) as {
          period?: unknown;
        };
        expect(body.period).toBe("last_90_days");
        expect(typeof body.period).toBe("string");
        throw new Error("Generation unavailable in test");
      }
      return {
        snapshot: null,
        history: [],
        defaultPeriod: {
          preset: "last_90_days",
          periodStart: "2026-05-07",
          periodEnd: "2026-08-04",
          previousPeriodStart: "2026-02-06",
          previousPeriodEnd: "2026-05-06",
          label: "Last 90 days",
          comparisonLabel: "Compared with previous period",
        },
        privacyNote: "Privacy note",
        confidentialityNote: "Confidentiality note",
      };
    });

    const generate = Array.from(container.querySelectorAll("button")).find(
      button => /Generate Executive Brief/i.test(button.textContent || "")
    );
    expect(generate).toBeTruthy();

    await act(async () => {
      generate?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Generation unavailable in test");
    expect(container.textContent).not.toContain("[object Event]");
  });

  it("surfaces a safe message when an Event is thrown and never renders [object Event]", async () => {
    await renderPage();
    apiJson.mockClear();

    apiJson.mockImplementation(async (url: unknown, init?: unknown) => {
      if (String(url).includes("/generate")) {
        const body = JSON.parse(
          String((init as RequestInit | undefined)?.body || "{}")
        ) as {
          period?: unknown;
        };
        expect(typeof body.period).toBe("string");
        throw new Event("click");
      }
      expect(String(url)).not.toContain("[object");
      return {
        snapshot: null,
        history: [],
        defaultPeriod: {
          preset: "last_90_days",
          periodStart: "2026-05-07",
          periodEnd: "2026-08-04",
          previousPeriodStart: "2026-02-06",
          previousPeriodEnd: "2026-05-06",
          label: "Last 90 days",
          comparisonLabel: "Compared with previous period",
        },
        privacyNote: "Privacy note",
        confidentialityNote: "Confidentiality note",
      };
    });

    const generate = Array.from(container.querySelectorAll("button")).find(
      button => /Generate Executive Brief/i.test(button.textContent || "")
    );
    expect(generate).toBeTruthy();

    await act(async () => {
      generate?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "Unable to generate organisation intelligence."
    );
    expect(container.textContent).not.toContain("[object Event]");
  });

  it("loads a history snapshot id as a string query param", async () => {
    apiJson.mockImplementation(async (url: unknown) => ({
      snapshot: null,
      history: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          periodStart: "2026-05-07",
          periodEnd: "2026-08-04",
          periodKey: "last_90_days",
          generatedAt: "2026-08-04T10:00:00.000Z",
          confidenceLevel: "low",
          status: "ready",
          sourceRelationshipCount: 2,
        },
      ],
      defaultPeriod: {
        preset: "last_90_days",
        periodStart: "2026-05-07",
        periodEnd: "2026-08-04",
        previousPeriodStart: "2026-02-06",
        previousPeriodEnd: "2026-05-06",
        label: "Last 90 days",
        comparisonLabel: "Compared with previous period",
      },
      privacyNote: "Privacy note",
      confidentialityNote: "Confidentiality note",
    }));

    await renderPage();

    const historyButton = Array.from(container.querySelectorAll("button")).find(
      button => /2026-05-07 to 2026-08-04/i.test(button.textContent || "")
    );
    expect(historyButton).toBeTruthy();

    apiJson.mockClear();
    apiJson.mockImplementation(async (url: unknown) => {
      expect(String(url)).toContain(
        "snapshotId=11111111-1111-4111-8111-111111111111"
      );
      expect(String(url)).not.toContain("[object");
      return {
        snapshot: null,
        history: [],
        defaultPeriod: {
          preset: "last_90_days",
          periodStart: "2026-05-07",
          periodEnd: "2026-08-04",
          previousPeriodStart: "2026-02-06",
          previousPeriodEnd: "2026-05-06",
          label: "Last 90 days",
          comparisonLabel: "Compared with previous period",
        },
        privacyNote: "Privacy note",
        confidentialityNote: "Confidentiality note",
      };
    });

    await act(async () => {
      historyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain("[object Event]");
  });
  it("privacy tooltip opens with keyboard activation", async () => {
    await renderPage();

    const tipTrigger = container.querySelector(
      'button[aria-label="About the privacy threshold"]'
    ) as HTMLButtonElement | null;
    expect(tipTrigger).not.toBeNull();

    await act(async () => {
      tipTrigger?.focus();
      tipTrigger?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
      tipTrigger?.click();
    });

    expect(container.textContent).toContain(
      "A minimum of five contributing relationships helps reduce the risk of identifying individuals."
    );

    await act(async () => {
      tipTrigger?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });

    expect(container.textContent).not.toContain(
      "A minimum of five contributing relationships helps reduce the risk of identifying individuals."
    );
    expect(container.textContent).not.toContain("[object Event]");
  });
});

describe("Gate 3.4C Lead intelligence presentation polish", () => {
  let container: HTMLDivElement;
  let root: Root;

  const readySnapshot = {
    id: "snap-ready",
    organisationId: "org-1",
    organisationName: "UAT-G34-ORG-DI",
    period: {
      preset: "last_90_days",
      periodStart: "2026-05-19",
      periodEnd: "2026-08-16",
      previousPeriodStart: "2026-02-18",
      previousPeriodEnd: "2026-05-18",
      label: "Last 90 days",
      comparisonLabel: "Compared with previous period",
    },
    generatedAt: "2026-08-16T21:28:39.671Z",
    generatedBy: "lead-1",
    status: "ready",
    emptyState: false,
    emptyStateReason: null,
    confidenceLevel: "moderate",
    privacyThreshold: 5,
    sourceRelationshipCount: 7,
    sourceConversationCount: 6,
    sourceEvidenceCount: 21,
    restrictedEvidenceExcluded: false,
    executiveBrief:
      "The available evidence indicates Accountability and Psychological Safety are reportable organisational themes for this period.\n\nThemes to monitor\n\nContinue reviewing Accountability across contributing relationships.\n\nEvidence base\n\n21 authorised evidence items across 6 conversations.",
    metrics: [
      {
        metricKey: "active_relationships",
        metricLabel: "Active relationships",
        metricValue: 7,
        displayValue: "7",
        previousValue: null,
        direction: "insufficient_evidence",
        confidenceLevel: "moderate",
        evidenceCount: 21,
        relationshipCount: 7,
        suppressed: false,
        comparisonAvailable: false,
        metadata: {},
      },
      {
        metricKey: "active_practitioners",
        metricLabel: "Active practitioners",
        metricValue: 3,
        displayValue: "3",
        previousValue: null,
        direction: "insufficient_evidence",
        confidenceLevel: "moderate",
        evidenceCount: 6,
        relationshipCount: 7,
        suppressed: false,
        comparisonAvailable: false,
        metadata: {},
      },
      {
        metricKey: "development_conversations",
        metricLabel: "Conversations",
        metricValue: 6,
        displayValue: "6",
        previousValue: null,
        direction: "insufficient_evidence",
        confidenceLevel: "moderate",
        evidenceCount: 6,
        relationshipCount: 7,
        suppressed: false,
        comparisonAvailable: false,
        metadata: {},
      },
      {
        metricKey: "evidence_items",
        metricLabel: "Evidence items",
        metricValue: 21,
        displayValue: "21",
        previousValue: null,
        direction: "insufficient_evidence",
        confidenceLevel: "moderate",
        evidenceCount: 21,
        relationshipCount: 7,
        suppressed: false,
        comparisonAvailable: false,
        metadata: {},
      },
      {
        metricKey: "development_momentum",
        metricLabel: "Development Momentum",
        metricValue: 42,
        displayValue: "42",
        previousValue: null,
        direction: "insufficient_evidence",
        confidenceLevel: "moderate",
        evidenceCount: 21,
        relationshipCount: 7,
        suppressed: false,
        comparisonAvailable: false,
        metadata: {
          components: {
            conversations: 10,
            actions: 8,
            reflections: 6,
            developmentUpdates: 8,
            evidence: 10,
          },
        },
      },
    ],
    themes: [
      {
        themeKey: "accountability",
        themeLabel: "Accountability",
        direction: "increasing_prevalence",
        confidenceLevel: "low",
        evidenceCount: 7,
        relationshipCount: 7,
        summary: "Accountability appears across seven relationships.",
        suppressed: false,
        relatedCapabilities: ["accountability_and_ownership"],
        evidenceTypes: ["development_evidence"],
        metadata: {},
      },
      {
        themeKey: "psychological_safety",
        themeLabel: "Psychological Safety",
        direction: "unchanged_prevalence",
        confidenceLevel: "low",
        evidenceCount: 5,
        relationshipCount: 5,
        summary: "Psychological Safety appears across five relationships.",
        suppressed: false,
        relatedCapabilities: ["psychological_safety"],
        evidenceTypes: ["development_evidence"],
        metadata: {},
      },
    ],
    capabilities: [
      {
        key: "psychological_safety",
        label: "Psychological Safety",
        direction: "unchanged_prevalence",
        changeLabel: "Unchanged prevalence",
        evidenceCount: 5,
        relationshipCount: 5,
        confidenceLevel: "low",
        suppressed: false,
      },
      {
        key: "accountability_and_ownership",
        label: "Accountability and Ownership",
        direction: "increasing_prevalence",
        changeLabel: "Increasing prevalence",
        evidenceCount: 7,
        relationshipCount: 7,
        confidenceLevel: "low",
        suppressed: false,
      },
    ],
    recommendations: [
      {
        priority: 1,
        title: "Review Accountability support",
        rationale: "Accountability is reportable across seven relationships.",
        recommendation: "Decide whether targeted support is needed.",
        confidenceLevel: "low",
        evidenceCount: 7,
        relationshipCount: 7,
      },
    ],
    attentionAreas: [
      {
        key: "accountability",
        label: "Accountability",
        kind: "theme",
        direction: "increasing_prevalence",
        confidenceLevel: "low",
        reason: "Accountability is appearing across more relationships.",
        recommendedReview: "Review aggregated theme evidence.",
      },
      {
        key: "psychological_safety",
        label: "Psychological safety",
        kind: "theme",
        direction: "unchanged_prevalence",
        confidenceLevel: "low",
        reason: "Psychological safety remains a reportable theme.",
        recommendedReview: "Continue monitoring aggregated theme evidence.",
      },
      {
        key: "accountability_and_ownership",
        label: "Accountability and Ownership",
        kind: "capability",
        direction: "increasing_prevalence",
        confidenceLevel: "low",
        reason: "Foundation roll-up for Accountability.",
        recommendedReview: "Review foundation trends.",
      },
      {
        key: "psychological_safety",
        label: "Psychological Safety",
        kind: "capability",
        direction: "increasing_prevalence",
        confidenceLevel: "low",
        reason: "Foundation roll-up duplicate of the theme.",
        recommendedReview: "Review foundation trends.",
      },
    ],
    coachingImpact: [
      {
        key: "evidence_progression",
        label: "Authorised evidence volume",
        statement:
          "21 authorised development evidence items were recorded during the period.",
        direction: "insufficient_evidence",
        confidenceLevel: "moderate",
        evidenceCount: 21,
      },
    ],
    evidenceTraces: [],
  };

  beforeEach(() => {
    apiJson.mockReset();
    apiJson.mockImplementation(async () => ({
      snapshot: readySnapshot,
      history: [],
      defaultPeriod: readySnapshot.period,
      privacyNote: "Privacy note",
      confidentialityNote: "Confidentiality note",
      evidenceIndicators: null,
    }));
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

  async function renderPage() {
    await act(async () => {
      root.render(<OrganisationIntelligencePage />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("keeps one executive narrative and clarifies confidence labels", async () => {
    await renderPage();
    const text = container.textContent || "";
    const narrative =
      "The available evidence indicates Accountability and Psychological Safety are reportable organisational themes for this period.";

    expect(text).toContain("Executive brief");
    expect(text).toContain(narrative);
    expect(text.split(narrative).length - 1).toBe(1);
    expect(text).toContain("Evidence base confidence: Moderate");
    expect(text).toContain("Theme confidence: Low");
    expect(text).toContain(
      "Evidence base confidence reflects the overall anonymised sample"
    );
    // Structured scan-summary duplicate must be absent.
    expect(text).not.toContain("Overall position");
    expect(text).not.toContain("Themes with increasing prevalence");
    expect(text).not.toContain("Development activity momentum");
    expect(text).not.toContain("Brief summary");
    expect(container.querySelector(".org-intelligence-brief__scan")).toBeNull();
    expect(container.querySelector(".org-intelligence-brief__scan-list")).toBeNull();
  });

  it("keeps theme monitoring primary and does not repeat foundation monitor rows", async () => {
    await renderPage();
    const text = container.textContent || "";

    expect(text).toContain("Emerging themes");
    expect(text).toContain("Themes to monitor");
    expect(text).toContain("Capability trends");
    expect(text).toContain("Development indicators");
    expect(text).not.toContain("Coaching impact");
    expect(text).toContain("do not claim causation");

    const attentionHeading = Array.from(container.querySelectorAll("h2")).find(
      node => node.textContent === "Themes to monitor"
    );
    expect(attentionHeading).toBeTruthy();
    const attentionSection = attentionHeading?.closest("section");
    const attentionText = attentionSection?.textContent || "";
    expect(attentionText).toContain("Accountability");
    expect(attentionText).toContain("Psychological safety");
    // Capability/foundation label must not appear in theme monitor list.
    expect(attentionText).not.toContain("Psychological Safety");
    expect(attentionText).not.toContain("Accountability and Ownership");
    expect(attentionText).not.toContain("Foundation roll-up duplicate");
    expect(attentionText).not.toContain("kind === \"capability\"");

    const capabilityHeading = Array.from(container.querySelectorAll("h2")).find(
      node => node.textContent === "Capability trends"
    );
    const capabilityText = capabilityHeading?.closest("section")?.textContent || "";
    expect(capabilityText).toContain("Accountability and Ownership");
    expect(capabilityText).toContain("Psychological Safety");
    expect(capabilityText).toContain("Capability confidence");
  });

  it("excludes kind === capability from Themes to monitor even when labels collide", async () => {
    await renderPage();
    const attentionHeading = Array.from(container.querySelectorAll("h2")).find(
      node => node.textContent === "Themes to monitor"
    );
    const items = Array.from(
      attentionHeading?.closest("section")?.querySelectorAll("h3") || []
    ).map(node => node.textContent?.trim());
    expect(items).toEqual(["Accountability", "Psychological safety"]);
    expect(items.filter(label => label === "Psychological Safety")).toHaveLength(
      0
    );
  });

  it("preserves buyer hierarchy and privacy language", async () => {
    await renderPage();
    const headings = Array.from(container.querySelectorAll("h2")).map(
      node => node.textContent
    );
    const briefIdx = headings.indexOf("Executive brief");
    const themesIdx = headings.indexOf("Emerging themes");
    const monitorIdx = headings.indexOf("Themes to monitor");
    const priorityIdx = headings.indexOf("Priority areas");
    expect(briefIdx).toBeGreaterThanOrEqual(0);
    expect(themesIdx).toBeGreaterThan(briefIdx);
    expect(monitorIdx).toBeGreaterThan(themesIdx);
    expect(priorityIdx).toBeGreaterThan(monitorIdx);

    expect(container.textContent).toContain("Privacy protected");
    expect(container.textContent).toContain("anonymised");
    expect(container.textContent).not.toContain("contributorKey");
  });
});
