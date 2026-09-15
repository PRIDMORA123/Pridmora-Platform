/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/app-shell";
import type {
  MembershipRole,
  ProfessionalRole,
} from "@/lib/organisations/types";

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

const organisationState = {
  organisation: {
    id: "org-1",
    name: "Acme",
    slug: "acme",
    status: "active" as const,
    createdAt: "",
    updatedAt: "",
  },
  membership: {
    id: "mem-1",
    organisationId: "org-1",
    userId: "user-1",
    role: "practitioner" as MembershipRole,
    status: "active" as const,
    createdAt: "",
    updatedAt: "",
  },
  role: "practitioner" as MembershipRole,
  professionalRole: "manager" as ProfessionalRole,
  organisations: [],
  showWorkspaceSelector: false,
  showOrganisationNav: false,
  switchOrganisation: async () => undefined,
  refreshOrganisations: async () => undefined,
  clearRelationshipSelection: () => undefined,
  onClearRelationshipSelection: null,
};

let canManageSampleOrganisation = false;

vi.mock("@/lib/organisations/organisation-context", () => ({
  useOrganisation: () => organisationState,
}));

vi.mock(
  "@/lib/organisations/use-can-manage-sample-organisation",
  () => ({
    useCanManageSampleOrganisation: () => canManageSampleOrganisation,
  })
);

function setRole(input: {
  professionalRole: ProfessionalRole;
  role: MembershipRole;
  showOrganisationNav: boolean;
  sampleOrganisation?: boolean;
}) {
  organisationState.professionalRole = input.professionalRole;
  organisationState.role = input.role;
  organisationState.membership.role = input.role;
  organisationState.showOrganisationNav = input.showOrganisationNav;
  canManageSampleOrganisation = input.sampleOrganisation ?? false;
}

async function renderShell() {
  return renderView(
    <AppShell
      view="dashboard"
      onNavigate={() => undefined}
      onNewClient={() => undefined}
      onSignOut={() => undefined}
      mobileOpen={false}
      setMobileOpen={() => undefined}
      coachName="Test User"
      coachTitle="Test role"
      coachInitials="TU"
    >
      <div>Content</div>
    </AppShell>
  );
}

function primaryNavText(container: HTMLElement) {
  return container.querySelector('nav[aria-label="Primary"]')?.textContent ?? "";
}

beforeEach(() => {
  setRole({
    professionalRole: "manager",
    role: "practitioner",
    showOrganisationNav: false,
  });
});

afterEach(async () => {
  for (const entry of mounted.splice(0)) {
    await act(async () => {
      entry.root.unmount();
    });
    entry.container.remove();
  }

  vi.clearAllMocks();
});

describe("AppShell role navigation contract", () => {
  it("keeps an ordinary Manager in the Manager experience", async () => {
    setRole({
      professionalRole: "manager",
      role: "practitioner",
      showOrganisationNav: false,
    });

    const container = await renderShell();
    const nav = primaryNavText(container);

    expect(nav).toContain("Home");
    expect(nav).toContain("People");
    expect(nav).toContain("My Development");
    expect(nav).toContain("Reports");
    expect(nav).toContain("Settings");

    expect(nav).not.toContain("Conversations");
    expect(nav).not.toContain("Organisation");
    expect(nav).not.toContain("Sample organisation");
  });

  it("keeps a Coach in the coaching experience", async () => {
    setRole({
      professionalRole: "coach",
      role: "practitioner",
      showOrganisationNav: false,
    });

    const container = await renderShell();
    const nav = primaryNavText(container);

    expect(nav).toContain("Home");
    expect(nav).toContain("People");
    expect(nav).toContain("Conversations");
    expect(nav).toContain("Development");
    expect(nav).toContain("Reports");
    expect(nav).toContain("Settings");

    expect(nav).not.toContain("My Development");
    expect(nav).not.toContain("Organisation");
    expect(nav).not.toContain("Sample organisation");
  });

  it("keeps an oversight Lead out of the practitioner People workspace", async () => {
    setRole({
      professionalRole: "manager",
      role: "oversight",
      showOrganisationNav: true,
    });

    const container = await renderShell();
    const nav = primaryNavText(container);

    expect(nav).toContain("Home");
    expect(nav).toContain("My Development");
    expect(nav).toContain("Reports");
    expect(nav).toContain("Settings");
    expect(nav).toContain("Organisation");

    expect(nav).not.toContain("People");
    expect(nav).not.toContain("Conversations");
    expect(nav).not.toContain("Sample organisation");
  });

  it("preserves Manager experience while adding owner authority", async () => {
    setRole({
      professionalRole: "manager",
      role: "owner",
      showOrganisationNav: true,
      sampleOrganisation: true,
    });

    const container = await renderShell();
    const nav = primaryNavText(container);

    expect(nav).toContain("Home");
    expect(nav).toContain("People");
    expect(nav).toContain("My Development");
    expect(nav).toContain("Reports");
    expect(nav).toContain("Settings");
    expect(nav).toContain("Organisation");
    expect(nav).toContain("Sample organisation");

    expect(nav).not.toContain("Conversations");
  });
});
