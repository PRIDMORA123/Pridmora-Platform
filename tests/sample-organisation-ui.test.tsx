/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SampleOrganisationPage } from "@/components/sample-organisation/sample-organisation-page";

const apiJson = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/settings/sample-organisation",
}));

vi.mock("@/lib/api-client", () => ({
  apiJson: (...args: unknown[]) => apiJson(...args),
}));

vi.mock("@/components/organisation/organisation-shell", () => ({
  OrganisationShell: ({
    children,
    title,
    eyebrow,
  }: {
    children: ReactNode;
    title: string;
    eyebrow?: string;
  }) => (
    <div>
      <p>{eyebrow}</p>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

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

const packPayload = {
  pack: {
    packKey: "northbridge-healthcare",
    packVersion: "1.0.0",
    title: "Northbridge Healthcare Trust",
    summary:
      "Create a realistic fictional coaching environment for demonstrations, training and evaluation.",
    features: [
      "12 coaching relationships",
      "72 development conversations",
      "Organisation Intelligence included",
    ],
    estimatedSetupSeconds: 60,
    expectedCounts: {
      organisations: 1,
      relationships: 12,
      standardRelationships: 10,
      confidentialRelationships: 2,
      sessions: 72,
      actions: 72,
      developmentUpdates: 24,
      intelligenceItems: 72,
      organisationIntelligenceSnapshots: 1,
    },
    privacyNote: "All names and coaching records in this sample are fictional.",
    installation: null,
    organisationIntelligenceGenerationAvailable: false,
  },
};

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => {
      entry.root.unmount();
    });
    entry.container.remove();
  }
});

describe("sample organisation UI", () => {
  beforeEach(() => {
    apiJson.mockReset();
    apiJson.mockResolvedValue(packPayload);
  });

  it("renders available pack and opens install confirmation", async () => {
    const container = await renderView(<SampleOrganisationPage />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Northbridge Healthcare Trust");
    expect(container.textContent).toContain("Available pack");
    expect(container.textContent).toContain("Around one minute");
    expect(container.textContent).toContain("Install sample organisation");

    const installButton = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent?.includes("Install sample organisation")
    );
    expect(installButton).toBeTruthy();

    await act(async () => {
      installButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Install sample organisation?");
    expect(container.textContent).toContain("Around one minute");
    expect(container.textContent).toContain(
      "Existing organisation data will not be changed"
    );
    expect(container.textContent).toContain("Cancel");
  });

  it("renders installed state and requires REMOVE confirmation", async () => {
    apiJson.mockResolvedValue({
      pack: {
        ...packPayload.pack,
        installation: {
          id: "11111111-1111-4111-8111-111111111111",
          organisationId: "22222222-2222-4222-8222-222222222222",
          sourceOrganisationId: "33333333-3333-4333-8333-333333333333",
          packKey: "northbridge-healthcare",
          packVersion: "1.0.0",
          status: "ready",
          stage: "ready",
          stageLabel: "Ready",
          installedBy: "user",
          installedByName: "Alex Coach",
          installedAt: "2026-08-04T10:00:00.000Z",
          updatedAt: "2026-08-04T10:00:00.000Z",
          counts: {
            relationships: 12,
            sessions: 72,
            actions: 72,
            developmentUpdates: 24,
            intelligenceItems: 72,
          },
          errorSummary: null,
          failureCategory: null,
          progressPercent: 100,
          canRetryIntelligence: false,
        },
      },
    });

    const container = await renderView(<SampleOrganisationPage />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Installed");
    expect(container.textContent).toContain("Alex Coach");
    expect(container.textContent).toContain("Open sample organisation");
    expect(container.textContent).toContain("Reset sample organisation");
    expect(container.textContent).toContain("Remove sample organisation");
    expect(container.textContent).not.toContain("Install sample organisation");

    const removeButton = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent?.trim() === "Remove sample organisation"
    );
    await act(async () => {
      removeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Remove sample organisation?");
    const confirmRemove = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent?.trim() === "Remove"
    ) as HTMLButtonElement | undefined;
    expect(confirmRemove?.disabled).toBe(true);
    expect(container.querySelector("input")).toBeTruthy();
  });

  it("renders intelligence_pending as ready without a failing Retry action", async () => {
    apiJson.mockResolvedValue({
      pack: {
        ...packPayload.pack,
        organisationIntelligenceGenerationAvailable: false,
        installation: {
          id: "11111111-1111-4111-8111-111111111111",
          organisationId: "22222222-2222-4222-8222-222222222222",
          sourceOrganisationId: "33333333-3333-4333-8333-333333333333",
          packKey: "northbridge-healthcare",
          packVersion: "1.0.0",
          status: "intelligence_pending",
          stage: "generating_organisation_intelligence",
          stageLabel: "Generating Organisation Intelligence",
          installedBy: "user",
          installedByName: "Alex Coach",
          installedAt: "2026-08-04T10:00:00.000Z",
          updatedAt: "2026-08-04T10:00:00.000Z",
          counts: {
            relationships: 12,
            sessions: 72,
            actions: 72,
            developmentUpdates: 24,
            intelligenceItems: 72,
          },
          errorSummary:
            "Sample data was created but Organisation Intelligence could not be generated.",
          failureCategory: "intelligence_generation",
          progressPercent: 90,
          canRetryIntelligence: false,
        },
      },
    });

    const container = await renderView(<SampleOrganisationPage />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Sample organisation ready");
    expect(container.textContent).toContain("Organisation Intelligence");
    expect(container.textContent).toContain("Not yet available");
    expect(container.textContent).toContain(
      "Organisation Intelligence will become available when the organisation intelligence module is released."
    );
    expect(container.textContent).toContain("Open sample organisation");
    expect(container.textContent).toContain("Reset sample organisation");
    expect(container.textContent).toContain("Remove sample organisation");
    expect(container.textContent).not.toContain("Retry intelligence generation");
    expect(container.textContent).not.toContain("Organisation Intelligence ready");
    expect(container.textContent).not.toContain("Executive brief ready");
    expect(container.textContent).not.toContain("Intelligence generated");
    expect(container.textContent).not.toContain("View Organisation Intelligence");
    expect(container.textContent).not.toContain("Sample organisation is not ready.");
    expect(container.querySelector(".organisation-error")).toBeNull();
  });

  it("keeps Open available for intelligence_pending without an error banner", async () => {
    const installationId = "11111111-1111-4111-8111-111111111111";
    apiJson.mockImplementation(async (url: string) => {
      if (String(url).includes("/open")) {
        return { organisationId: "22222222-2222-4222-8222-222222222222" };
      }
      return {
        pack: {
          ...packPayload.pack,
          organisationIntelligenceGenerationAvailable: false,
          installation: {
            id: installationId,
            organisationId: "22222222-2222-4222-8222-222222222222",
            sourceOrganisationId: "33333333-3333-4333-8333-333333333333",
            packKey: "northbridge-healthcare",
            packVersion: "1.0.0",
            status: "intelligence_pending",
            stage: "generating_organisation_intelligence",
            stageLabel: "Generating Organisation Intelligence",
            installedBy: "user",
            installedByName: "Alex Coach",
            installedAt: "2026-08-04T10:00:00.000Z",
            updatedAt: "2026-08-04T10:00:00.000Z",
            counts: {
              relationships: 12,
              sessions: 72,
              actions: 72,
              developmentUpdates: 24,
              intelligenceItems: 72,
            },
            errorSummary:
              "Sample data was created but Organisation Intelligence could not be generated.",
            failureCategory: "intelligence_generation",
            progressPercent: 90,
            canRetryIntelligence: false,
          },
        },
      };
    });

    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign },
    });

    const container = await renderView(<SampleOrganisationPage />);
    await act(async () => {
      await Promise.resolve();
    });

    const openButton = Array.from(container.querySelectorAll("button")).find(
      button => button.textContent?.trim() === "Open sample organisation"
    );
    expect(openButton).toBeTruthy();

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(apiJson).toHaveBeenCalledWith(
      `/api/sample-organisations/installations/${installationId}/open`,
      expect.objectContaining({ method: "POST" })
    );
    expect(container.querySelector(".organisation-error")).toBeNull();
    expect(container.textContent).not.toContain("Sample organisation is not ready.");
    expect(container.textContent).toContain("Sample organisation ready");
    expect(container.textContent).toContain("Not yet available");
  });

  it("shows a safe error for failed status and keeps ready free of error banners", async () => {
    apiJson.mockResolvedValue({
      pack: {
        ...packPayload.pack,
        installation: {
          id: "11111111-1111-4111-8111-111111111111",
          organisationId: "22222222-2222-4222-8222-222222222222",
          sourceOrganisationId: "33333333-3333-4333-8333-333333333333",
          packKey: "northbridge-healthcare",
          packVersion: "1.0.0",
          status: "failed",
          stage: "failed",
          stageLabel: "Failed",
          installedBy: "user",
          installedByName: "Alex Coach",
          installedAt: null,
          updatedAt: "2026-08-04T10:00:00.000Z",
          counts: {
            relationships: 0,
            sessions: 0,
            actions: 0,
            developmentUpdates: 0,
            intelligenceItems: 0,
          },
          errorSummary:
            "Sample organisation installation failed. Created records were removed.",
          failureCategory: "install_failed",
          progressPercent: 0,
          canRetryIntelligence: false,
        },
      },
    });

    const failedContainer = await renderView(<SampleOrganisationPage />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(failedContainer.querySelector(".organisation-error")?.textContent).toContain(
      "Sample organisation installation failed. Created records were removed."
    );
    expect(failedContainer.textContent).toContain("Available pack");
    expect(failedContainer.textContent).toContain("Install sample organisation");

    for (const entry of mounted.splice(0)) {
      act(() => {
        entry.root.unmount();
      });
      entry.container.remove();
    }

    apiJson.mockResolvedValue({
      pack: {
        ...packPayload.pack,
        installation: {
          id: "11111111-1111-4111-8111-111111111111",
          organisationId: "22222222-2222-4222-8222-222222222222",
          sourceOrganisationId: "33333333-3333-4333-8333-333333333333",
          packKey: "northbridge-healthcare",
          packVersion: "1.0.0",
          status: "ready",
          stage: "ready",
          stageLabel: "Ready",
          installedBy: "user",
          installedByName: "Alex Coach",
          installedAt: "2026-08-04T10:00:00.000Z",
          updatedAt: "2026-08-04T10:00:00.000Z",
          counts: {
            relationships: 12,
            sessions: 72,
            actions: 72,
            developmentUpdates: 24,
            intelligenceItems: 72,
          },
          errorSummary: null,
          failureCategory: null,
          progressPercent: 100,
          canRetryIntelligence: false,
        },
      },
    });

    const readyContainer = await renderView(<SampleOrganisationPage />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(readyContainer.querySelector(".organisation-error")).toBeNull();
    expect(readyContainer.textContent).toContain("Installed");
    expect(readyContainer.textContent).toContain("Sample organisation ready");
    expect(readyContainer.textContent).toContain("Open sample organisation");
    expect(readyContainer.textContent).not.toContain("Sample organisation is not ready.");
  });
});
