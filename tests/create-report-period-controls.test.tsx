/**
 * @vitest-environment jsdom
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateReportFlow } from "@/components/reports/create-report-flow";
import { ToastProvider } from "@/components/feedback/toast-provider";
import type { Client } from "@/lib/types";
import type { DevelopmentReport } from "@/lib/reports/types";

const UAT_START = "2026-08-01";
const UAT_END = "2026-08-27";

const apiJson = vi.fn();

vi.mock("@/lib/api-client", () => ({
  apiJson: (...args: unknown[]) => apiJson(...args),
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
  toError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
}));

function client(): Client {
  return {
    id: "client-1",
    name: "Alex",
    initials: "A",
    organisation: "Northbridge",
    role: "Director",
    email: "",
    status: "Active",
    nextSession: "",
    currentFocus: "Build confidence in delegation",
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
  };
}

function createdReport(body: {
  clientId: string;
  type: DevelopmentReport["type"];
  audience: DevelopmentReport["audience"];
  title: string;
  reportingPeriodStart: string | null;
  reportingPeriodEnd: string | null;
  includeCoachStatement: boolean;
  coachingPurpose: string | null;
}): DevelopmentReport {
  return {
    id: "report-1",
    relationshipId: body.clientId,
    coachId: "coach-1",
    type: body.type,
    audience: body.audience,
    title: body.title,
    reportingPeriodStart: body.reportingPeriodStart,
    reportingPeriodEnd: body.reportingPeriodEnd,
    status: "draft",
    coachingPurpose: body.coachingPurpose,
    executiveSummary: null,
    progressSummary: null,
    developmentThemes: [],
    evidenceItems: [],
    commitments: [],
    futurePriorities: [],
    coachStatement: null,
    associatedIndicators: [],
    impactMetrics: null,
    includeCoachStatement: body.includeCoachStatement,
    parentReportId: null,
    confidentialityConfirmedAt: null,
    approvedAt: null,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
  };
}

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

async function renderView(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  mounted.push({ root, container });
  return container;
}

function dateInput(container: HTMLElement, label: string): HTMLInputElement {
  const field = [...container.querySelectorAll("label")].find(node =>
    node.textContent?.includes(label)
  );
  const input = field?.querySelector('input[type="date"]') as HTMLInputElement;
  expect(input).toBeTruthy();
  return input;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  );
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function createCalls() {
  return apiJson.mock.calls.filter(
    ([url, init]) =>
      url === "/api/development-reports" &&
      (init as { method?: string } | undefined)?.method === "POST"
  );
}

describe("Step 1 reporting period controls", () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    apiJson.mockReset();
    apiJson.mockImplementation(
      async (url: string, init?: { method?: string; body?: string }) => {
        if (url.includes("/api/development-profiles/")) {
          return {
            profile: { currentFocus: "Build confidence in delegation" },
            updates: [],
          };
        }
        if (url === "/api/development-reports" && init?.method === "POST") {
          const body = JSON.parse(init.body ?? "{}");
          return { report: createdReport(body) };
        }
        throw new Error(`unexpected request ${init?.method ?? "GET"} ${url}`);
      }
    );
  });

  afterEach(async () => {
    for (const entry of mounted.splice(0)) {
      await act(async () => {
        entry.root.unmount();
      });
      entry.container.remove();
    }
  });

  it("sends both committed dates in the Create payload", async () => {
    const container = await renderView(
      <ToastProvider>
        <CreateReportFlow
          client={client()}
          coachName="Jordan"
          initialType="progress_snapshot"
          onCancel={() => undefined}
          onCompleted={() => undefined}
        />
      </ToastProvider>
    );

    await act(async () => {
      setInputValue(dateInput(container, "Reporting period start"), UAT_START);
      setInputValue(dateInput(container, "Reporting period end"), UAT_END);
    });

    const createButton = [...container.querySelectorAll("button")].find(button =>
      button.textContent?.includes("Create report")
    );
    expect(createButton).toBeTruthy();

    await act(async () => {
      createButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(createCalls()).toHaveLength(1);
    const body = JSON.parse(
      (createCalls()[0]?.[1] as { body?: string }).body ?? "{}"
    );
    expect(body.reportingPeriodStart).toBe(UAT_START);
    expect(body.reportingPeriodEnd).toBe(UAT_END);
  });

  it("blocks Create when the end date is uncommitted", async () => {
    const container = await renderView(
      <ToastProvider>
        <CreateReportFlow
          client={client()}
          coachName="Jordan"
          initialType="progress_snapshot"
          onCancel={() => undefined}
          onCompleted={() => undefined}
        />
      </ToastProvider>
    );

    await act(async () => {
      setInputValue(dateInput(container, "Reporting period start"), UAT_START);
    });

    const createButton = [...container.querySelectorAll("button")].find(button =>
      button.textContent?.includes("Create report")
    );
    expect(createButton).toBeTruthy();

    await act(async () => {
      createButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(createCalls()).toHaveLength(0);
    expect(container.textContent).toContain("Step 1");
    expect(container.textContent).toContain("Report details");
    expect(container.textContent).toContain(
      "Enter a reporting period start and end date."
    );
    expect(container.textContent).not.toContain("Select approved evidence");
  });
});
