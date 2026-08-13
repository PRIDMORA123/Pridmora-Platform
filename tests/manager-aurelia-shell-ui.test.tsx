/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManagerAureliaView } from "@/components/aurelia/manager-aurelia-view";
import { IdentityHomePage } from "@/components/today-view";
import { pilotClientA } from "@/lib/pilot-fixtures";
import type { ProfessionalRole } from "@/lib/organisations/types";
import type { Client } from "@/lib/types";

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

const organisationState: {
  organisation: {
    id: string;
    name: string;
    slug: string;
    status: "active";
    createdAt: string;
    updatedAt: string;
  };
  membership: {
    id: string;
    organisationId: string;
    userId: string;
    role: "practitioner";
    status: "active";
    createdAt: string;
    updatedAt: string;
  };
  role: "practitioner";
  professionalRole: ProfessionalRole;
  organisations: [];
  showWorkspaceSelector: boolean;
  showOrganisationNav: boolean;
  switchOrganisation: () => Promise<void>;
  refreshOrganisations: () => Promise<void>;
  clearRelationshipSelection: () => void;
  onClearRelationshipSelection: null;
} = {
  organisation: {
    id: "org-1",
    name: "Acme",
    slug: "acme",
    status: "active",
    createdAt: "",
    updatedAt: "",
  },
  membership: {
    id: "mem-1",
    organisationId: "org-1",
    userId: "user-1",
    role: "practitioner",
    status: "active",
    createdAt: "",
    updatedAt: "",
  },
  role: "practitioner",
  professionalRole: "manager",
  organisations: [],
  showWorkspaceSelector: false,
  showOrganisationNav: false,
  switchOrganisation: async () => undefined,
  refreshOrganisations: async () => undefined,
  clearRelationshipSelection: () => undefined,
  onClearRelationshipSelection: null,
};

vi.mock("@/lib/organisations/organisation-context", () => ({
  useOrganisation: () => organisationState,
}));

beforeEach(() => {
  organisationState.professionalRole = "manager";
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        awaitingReview: [],
        recentlyApplied: [],
        report: null,
        workspace: {
          client: { id: "self-1", name: "Manager", isSelfDevelopment: true },
          focusItems: [],
          actions: [],
          evidence: [],
          reflections: [],
          reflectionPatterns: [],
          intelligencePatterns: [],
          maturity: {
            includedSourceCount: 0,
            totalEvidenceCount: 0,
            focusCount: 0,
            actionCount: 0,
            reflectionCount: 0,
            confidenceLabel: "Emerging",
            headline: "",
            supportCopy: "",
            isEmpty: true,
          },
        },
      })
    )
  );
});

afterEach(async () => {
  for (const entry of mounted.splice(0)) {
    await act(async () => {
      entry.root.unmount();
    });
    entry.container.remove();
  }
  vi.unstubAllGlobals();
});

describe("Manager Aurelia shell UI", () => {
  it("renders the conversation shell with privacy notice", async () => {
    const onBackHome = vi.fn();
    const container = await renderView(
      <ManagerAureliaView onBackHome={onBackHome} />
    );

    expect(container.textContent).toContain("Aurelia");
    expect(container.textContent).toContain("Talk something through");
    expect(container.textContent).toContain("What’s on your mind?");
    expect(container.textContent).toContain("private working session");
    expect(container.textContent).toContain("It is not saved");
    expect(container.textContent).toContain(
      "current development focus and actions"
    );

    const takeForward = container.querySelector(
      '[data-testid="manager-aurelia-take-forward"]'
    ) as HTMLButtonElement;
    // Enabled only after conversation turns exist.
    expect(takeForward.disabled).toBe(true);

    await act(async () => {
      (
        container.querySelector("button.identity-button.is-quiet") as HTMLButtonElement
      ).click();
    });
    expect(onBackHome).toHaveBeenCalledTimes(1);
  });

  it("routes Talk something through to onOpenManagerAurelia", async () => {
    const clients: Client[] = [pilotClientA];
    const onOpenManagerAurelia = vi.fn();
    const onViewPeople = vi.fn();

    const container = await renderView(
      <IdentityHomePage
        clients={clients}
        onOpenClient={() => undefined}
        onPrepare={() => undefined}
        onViewPeople={onViewPeople}
        onOpenManagerAurelia={onOpenManagerAurelia}
        coachName="Alex"
        userId="user-1"
        coachId="user-1"
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      (
        container.querySelector(
          '[data-front-door-action="talk"]'
        ) as HTMLButtonElement
      ).click();
    });

    expect(onOpenManagerAurelia).toHaveBeenCalledTimes(1);
    expect(onViewPeople).not.toHaveBeenCalled();
  });
});
