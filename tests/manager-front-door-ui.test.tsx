/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManagerCommandCentre } from "@/components/identity/manager-command-centre";
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
  organisationState.showOrganisationNav = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/api/my-development/workspace")) {
        return Response.json({
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
        });
      }
      return Response.json({
        awaitingReview: [],
        recentlyApplied: [],
        report: null,
      });
    })
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

describe("Manager Front Door UI", () => {
  it("shows the six need-led actions and wires correct callbacks", async () => {
    const onTalkThrough = vi.fn();
    const onPrepareSomething = vi.fn();
    const onReflect = vi.fn();
    const onOpenMyDevelopment = vi.fn();
    const onOpenPeople = vi.fn();
    const onAddEvidence = vi.fn();

    const container = await renderView(
      <ManagerCommandCentre
        greeting="Good morning"
        coachName="Alex"
        onTalkThrough={onTalkThrough}
        onPrepareSomething={onPrepareSomething}
        onReflect={onReflect}
        onOpenMyDevelopment={onOpenMyDevelopment}
        onOpenPeople={onOpenPeople}
        onAddEvidence={onAddEvidence}
      />
    );

    expect(container.textContent).toContain("What would help you today?");
    expect(container.textContent).toContain("Talk something through");
    expect(container.textContent).toContain("Prepare for something");
    expect(container.textContent).toContain("Reflect on something");
    expect(container.textContent).toContain("Work on my development");
    expect(container.textContent).toContain("Develop someone in my team");
    expect(container.textContent).toContain("Add evidence");
    expect(container.textContent).toContain("Continue your development");
    expect(container.textContent).toContain("View My Development");

    const byAction = (id: string) =>
      container.querySelector(
        `[data-front-door-action="${id}"]`
      ) as HTMLButtonElement;

    await act(async () => {
      byAction("talk").click();
      byAction("prepare").click();
      byAction("reflect").click();
      byAction("my-development").click();
      byAction("my-people").click();
      byAction("add-evidence").click();
    });

    expect(onTalkThrough).toHaveBeenCalledTimes(1);
    expect(onPrepareSomething).toHaveBeenCalledTimes(1);
    expect(onReflect).toHaveBeenCalledTimes(1);
    expect(onOpenMyDevelopment).toHaveBeenCalledTimes(1);
    expect(onOpenPeople).toHaveBeenCalledTimes(1);
    expect(onAddEvidence).toHaveBeenCalledTimes(1);
  });

  it("handles empty Continue your development workspace without inventing data", async () => {
    const container = await renderView(
      <ManagerCommandCentre
        greeting="Good morning"
        coachName="Alex"
        onTalkThrough={() => undefined}
        onPrepareSomething={() => undefined}
        onReflect={() => undefined}
        onOpenMyDevelopment={() => undefined}
        onOpenPeople={() => undefined}
        onAddEvidence={() => undefined}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "No development focus, actions or evidence to show yet"
    );
    expect(container.textContent).not.toContain("Current focus");
    expect(container.textContent).not.toContain("Next action");
  });

  it("shows Manager front door for managers and not for coaches", async () => {
    const clients: Client[] = [pilotClientA];
    const onViewPeople = vi.fn();
    const onOpenMyDevelopment = vi.fn();
    const onOpenMyDevelopmentReflection = vi.fn();
    const onOpenMyDevelopmentEvidence = vi.fn();

    organisationState.professionalRole = "manager";
    const managerContainer = await renderView(
      <IdentityHomePage
        clients={clients}
        onOpenClient={() => undefined}
        onPrepare={() => undefined}
        onViewPeople={onViewPeople}
        onOpenMyDevelopment={onOpenMyDevelopment}
        onOpenMyDevelopmentReflection={onOpenMyDevelopmentReflection}
        onOpenMyDevelopmentEvidence={onOpenMyDevelopmentEvidence}
        coachName="Alex"
        userId="user-1"
        coachId="user-1"
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(managerContainer.textContent).toContain("What would help you today?");
    expect(managerContainer.textContent).toContain("Add evidence");

    await act(async () => {
      (
        managerContainer.querySelector(
          '[data-front-door-action="talk"]'
        ) as HTMLButtonElement
      ).click();
      (
        managerContainer.querySelector(
          '[data-front-door-action="reflect"]'
        ) as HTMLButtonElement
      ).click();
      (
        managerContainer.querySelector(
          '[data-front-door-action="add-evidence"]'
        ) as HTMLButtonElement
      ).click();
      (
        managerContainer.querySelector(
          '[data-front-door-action="my-people"]'
        ) as HTMLButtonElement
      ).click();
    });

    expect(onViewPeople).toHaveBeenCalled();
    expect(onOpenMyDevelopmentReflection).toHaveBeenCalledTimes(1);
    expect(onOpenMyDevelopmentEvidence).toHaveBeenCalledTimes(1);

    for (const entry of mounted.splice(0)) {
      await act(async () => {
        entry.root.unmount();
      });
      entry.container.remove();
    }

    organisationState.professionalRole = "coach";
    const coachContainer = await renderView(
      <IdentityHomePage
        clients={clients}
        onOpenClient={() => undefined}
        onPrepare={() => undefined}
        onViewPeople={() => undefined}
        coachName="Alex"
        userId="user-1"
        coachId="user-1"
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(coachContainer.textContent).not.toContain(
      "What would help you today?"
    );
    expect(
      coachContainer.querySelector("[data-front-door-action]")
    ).toBeNull();
  });
});
