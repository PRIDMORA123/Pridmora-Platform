/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const apiJson = vi.hoisted(() => vi.fn());
const signOutToSignIn = vi.hoisted(() => vi.fn());

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
  signOutToSignIn: (...args: unknown[]) => signOutToSignIn(...args),
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
import { OrganisationShell } from "@/components/organisation/organisation-shell";

describe("Organisation Workspace account / Sign out", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    apiJson.mockReset();
    signOutToSignIn.mockReset();
    apiJson.mockImplementation(async (url: string) => {
      if (url === "/api/organisations/current") {
        return { current: { role: "oversight" } };
      }
      if (url === "/api/profile") {
        return {
          profile: { fullName: "BAZZA", professionalTitle: "Manager" },
        };
      }
      return {};
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows Account menu with Sign out for oversight Organisation Workspace", async () => {
    await act(async () => {
      root.render(
        <OrganisationShell title="Overview">
          <p>Content</p>
        </OrganisationShell>
      );
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const trigger = container.querySelector(
      'button[aria-label="Account menu"]'
    ) as HTMLButtonElement | null;
    expect(trigger).toBeTruthy();

    await act(async () => {
      trigger!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("Sign out");
    expect(document.body.textContent).toContain("Profile / Settings");
  });

  it("Sign out uses the shared authentication helper", () => {
    const header = readFileSync(
      join(process.cwd(), "components/organisation/organisation-header.tsx"),
      "utf8"
    );
    const home = readFileSync(
      join(process.cwd(), "components/home-app.tsx"),
      "utf8"
    );
    const helper = readFileSync(
      join(process.cwd(), "lib/auth/sign-out-client.ts"),
      "utf8"
    );

    expect(header).toContain("AccountMenu");
    expect(header).toContain("signOutToSignIn");
    expect(home).toContain("signOutToSignIn");
    expect(helper).toContain("supabase.auth.signOut");
    expect(helper).toContain('/auth/sign-in');
  });

  it("does not reintroduce Manager People navigation for oversight", () => {
    const shell = readFileSync(
      join(process.cwd(), "components/app-shell.tsx"),
      "utf8"
    );
    const header = readFileSync(
      join(process.cwd(), "components/organisation/organisation-header.tsx"),
      "utf8"
    );
    expect(shell).toContain("canEnterManagerPeopleWorkspace");
    expect(shell).toContain("showManagerPeopleNav");
    expect(header).not.toContain("navigate(\"people\")");
    expect(header).not.toContain("CoachSpace");
    expect(header).toContain("LEAD_WORKSPACE_PATH");
  });

  it("Manager AppShell AccountMenu wiring remains unchanged", () => {
    const shell = readFileSync(
      join(process.cwd(), "components/app-shell.tsx"),
      "utf8"
    );
    expect(shell).toContain("<AccountMenu");
    expect(shell).toContain("onSignOut={onSignOut}");
    expect(shell).not.toContain("menuPlacement");
  });
});

describe("OrganisationHeader Sign out action", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    apiJson.mockReset();
    signOutToSignIn.mockReset();
    signOutToSignIn.mockResolvedValue(undefined);
    apiJson.mockResolvedValue({
      current: { role: "oversight" },
      profile: { fullName: "BAZZA" },
    });
    // Header calls two endpoints — return appropriate shapes per call order.
    apiJson
      .mockResolvedValueOnce({ current: { role: "oversight" } })
      .mockResolvedValueOnce({
        profile: { fullName: "BAZZA", professionalTitle: null },
      });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("invokes signOutToSignIn when Sign out is chosen", async () => {
    await act(async () => {
      root.render(
        <OrganisationHeader title="Overview" subtitle="Lead workspace" />
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const trigger = container.querySelector(
      'button[aria-label="Account menu"]'
    ) as HTMLButtonElement;
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const signOutItem = Array.from(
      document.body.querySelectorAll('[role="menuitem"]')
    ).find(node => node.textContent?.includes("Sign out")) as
      | HTMLButtonElement
      | undefined;
    expect(signOutItem).toBeTruthy();

    await act(async () => {
      signOutItem!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(signOutToSignIn).toHaveBeenCalledTimes(1);
  });
});
