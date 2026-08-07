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
      /Generate intelligence/i.test(button.textContent || "")
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
      button => /Generate intelligence/i.test(button.textContent || "")
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
      button => /Generate intelligence/i.test(button.textContent || "")
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
