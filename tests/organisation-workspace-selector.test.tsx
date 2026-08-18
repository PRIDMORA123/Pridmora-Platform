/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LEAD_WORKSPACE_PATH,
  MANAGER_WORKSPACE_PATH,
  resolvePostLoginDestination,
} from "@/lib/auth/post-login-destination";
import type { OrganisationWorkspaceState } from "@/lib/organisations/organisation-context";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

const apiJson = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: () => "/organisation",
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

vi.mock("@/lib/api-client", () => ({
  apiJson: (...args: unknown[]) => apiJson(...args),
}));

vi.mock("@/lib/auth/sign-out-client", () => ({
  signOutToSignIn: vi.fn(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
  }),
}));

vi.mock("@/lib/owner/platform-owner", () => ({
  isPlatformOwner: vi.fn().mockResolvedValue(false),
}));

import { OrganisationHeader } from "@/components/organisation/organisation-header";
import { OrganisationProvider } from "@/lib/organisations/organisation-context";

function membershipState(input: {
  multi: boolean;
  role: "oversight" | "owner" | "practitioner";
  professionalRole?: "manager" | null;
  organisationType?: "personal" | "business";
}): OrganisationWorkspaceState {
  const current = {
    organisation: {
      id: "org-current",
      name: "Customer #1 Rehearsal",
      slug: null,
      organisationType: "business" as const,
      status: "active" as const,
      createdBy: "user-1",
      defaultPreparationStyle: null,
      aiEnabled: true,
      dataRetentionPolicyLabel: "standard",
      brandingStatus: "none" as const,
      logoUrl: null,
      licence: {
        planName: "Pilot",
        seatsPurchased: 5,
        status: "active" as const,
        startsAt: null,
        endsAt: null,
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      archivedAt: null,
    },
    membership: {
      id: "mem-1",
      organisationId: "org-current",
      userId: "user-1",
      role: input.role,
      professionalRole: input.professionalRole ?? null,
      status: "active" as const,
      invitedBy: null,
      invitedAt: null,
      joinedAt: "2026-01-01T00:00:00.000Z",
      deactivatedAt: null,
      lastActiveAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  };

  const personal = {
    organisation: {
      ...current.organisation,
      id: "org-personal",
      name: "BAZZA Personal workspace",
      organisationType: "personal" as const,
    },
    membership: {
      ...current.membership,
      id: "mem-personal",
      organisationId: "org-personal",
      role: "owner" as const,
      professionalRole: null,
    },
  };

  return {
    organisation: current.organisation,
    membership: current.membership,
    role: input.role,
    professionalRole: input.professionalRole ?? null,
    organisations: input.multi
      ? [
          {
            organisation: current.organisation,
            membership: current.membership,
          },
          {
            organisation: personal.organisation,
            membership: personal.membership,
          },
        ]
      : [
          {
            organisation: current.organisation,
            membership: current.membership,
          },
        ],
  };
}

describe("Organisation Workspace selector", () => {
  let container: HTMLDivElement;
  let rootNode: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    rootNode = createRoot(container);
    apiJson.mockReset();
    apiJson.mockResolvedValue({
      profile: { fullName: "BAZZA", professionalTitle: null },
    });
  });

  afterEach(() => {
    act(() => {
      rootNode.unmount();
    });
    container.remove();
  });

  it("shows WorkspaceSelector for multi-membership oversight Lead", async () => {
    const initial = membershipState({ multi: true, role: "oversight" });
    await act(async () => {
      rootNode.render(
        <OrganisationProvider initial={initial}>
          <OrganisationHeader title="Overview" />
        </OrganisationProvider>
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(
      container.querySelector('select[aria-label="Switch organisation workspace"]')
    ).toBeTruthy();
    expect(container.querySelector(".organisation-header__account")).toBeTruthy();
  });

  it("hides WorkspaceSelector for single-membership users", async () => {
    const initial = membershipState({ multi: false, role: "oversight" });
    await act(async () => {
      rootNode.render(
        <OrganisationProvider initial={initial}>
          <OrganisationHeader title="Overview" />
        </OrganisationProvider>
      );
    });

    expect(
      container.querySelector('select[aria-label="Switch organisation workspace"]')
    ).toBeNull();
  });

  it("uses role-aware landing for personal vs oversight switches", () => {
    expect(
      resolvePostLoginDestination({
        requestedNext: "/",
        isPlatformOwner: false,
        membershipRole: "owner",
        professionalRole: null,
        organisationType: "personal",
      })
    ).toBe(MANAGER_WORKSPACE_PATH);

    expect(
      resolvePostLoginDestination({
        requestedNext: "/",
        isPlatformOwner: false,
        membershipRole: "oversight",
        professionalRole: null,
        organisationType: "business",
      })
    ).toBe(LEAD_WORKSPACE_PATH);

    expect(
      resolvePostLoginDestination({
        requestedNext: "/",
        isPlatformOwner: false,
        membershipRole: "practitioner",
        professionalRole: "manager",
        organisationType: "business",
      })
    ).toBe(MANAGER_WORKSPACE_PATH);
  });

  it("wires OrganisationProvider + role-aware switch without Manager People chrome", () => {
    const layout = read("app/organisation/layout.tsx");
    const provider = read(
      "components/organisation/organisation-workspace-provider.tsx"
    );
    const header = read("components/organisation/organisation-header.tsx");
    const context = read("lib/organisations/organisation-context.tsx");
    const shell = read("components/app-shell.tsx");

    expect(layout).toContain("OrganisationWorkspaceProvider");
    expect(provider).toContain("OrganisationProvider");
    expect(provider).toContain("/api/organisations/current");
    expect(header).toContain("WorkspaceSelector");
    expect(header).toContain("showWorkspaceSelector");
    expect(header).toContain("AccountMenu");
    expect(header).not.toContain("CoachSpace");
    expect(header).not.toContain('navigate("people")');

    expect(context).toContain("resolvePostLoginDestination");
    expect(context).toContain("organisationType");
    expect(context).toContain("window.location.assign(destination)");
    expect(context).not.toContain('window.location.assign("/?view=dashboard")');

    // Manager AppShell selector wiring unchanged.
    expect(shell).toContain("<WorkspaceSelector />");
    expect(shell).toContain("canEnterManagerPeopleWorkspace");
  });

  it("rejects non-member organisation IDs at preference API", () => {
    const route = read("app/api/organisations/current/route.ts");
    const repository = read("lib/organisations/repository.ts");
    expect(route).toContain("setCurrentOrganisationPreference");
    expect(repository).toContain("Not an active member of that organisation.");
  });
});
