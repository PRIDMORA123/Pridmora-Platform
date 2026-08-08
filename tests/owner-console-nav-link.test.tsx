/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseAuth = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

const platformOwner = vi.hoisted(() => ({
  isPlatformOwner: vi.fn(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({
    auth: supabaseAuth,
  }),
}));

vi.mock("@/lib/owner/platform-owner", () => ({
  isPlatformOwner: platformOwner.isPlatformOwner,
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

beforeEach(() => {
  supabaseAuth.getUser.mockReset();
  platformOwner.isPlatformOwner.mockReset();
});

afterEach(async () => {
  for (const entry of mounted.splice(0)) {
    await act(async () => {
      entry.root.unmount();
    });
    entry.container.remove();
  }
});

describe("OwnerConsoleNavLink", () => {
  it("shows Owner Console link for an active platform owner", async () => {
    supabaseAuth.getUser.mockResolvedValue({
      data: { user: { id: "owner-1" } },
      error: null,
    });
    platformOwner.isPlatformOwner.mockResolvedValue(true);

    const { OwnerConsoleNavLink } = await import(
      "@/components/owner/owner-console-nav-link"
    );
    const container = await renderView(<OwnerConsoleNavLink />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(platformOwner.isPlatformOwner).toHaveBeenCalledWith(
      expect.anything(),
      "owner-1"
    );
    const link = container.querySelector('a[href="/owner"]');
    expect(link).toBeTruthy();
    expect(link?.textContent).toContain("Owner Console");
  });

  it("hides Owner Console link for a normal authenticated user", async () => {
    supabaseAuth.getUser.mockResolvedValue({
      data: { user: { id: "manager-1" } },
      error: null,
    });
    platformOwner.isPlatformOwner.mockResolvedValue(false);

    const { OwnerConsoleNavLink } = await import(
      "@/components/owner/owner-console-nav-link"
    );
    const container = await renderView(<OwnerConsoleNavLink />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(platformOwner.isPlatformOwner).toHaveBeenCalledWith(
      expect.anything(),
      "manager-1"
    );
    expect(container.querySelector('a[href="/owner"]')).toBeNull();
    expect(container.textContent).not.toContain("Owner Console");
  });
});
