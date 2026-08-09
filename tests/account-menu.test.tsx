/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { join } from "node:path";
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

async function flushOwnerCheck() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function keyDown(target: EventTarget, key: string) {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
    );
  });
}

beforeEach(() => {
  supabaseAuth.getUser.mockReset();
  platformOwner.isPlatformOwner.mockReset();
  supabaseAuth.getUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
  platformOwner.isPlatformOwner.mockResolvedValue(false);
});

afterEach(async () => {
  for (const entry of mounted.splice(0)) {
    await act(async () => {
      entry.root.unmount();
    });
    entry.container.remove();
  }
});

describe("AccountMenu", () => {
  it("opens on click and exposes Profile / Settings and Sign out", async () => {
    const onOpenSettings = vi.fn();
    const onSignOut = vi.fn();
    const { AccountMenu } = await import("@/components/account-menu");

    const container = await renderView(
      <AccountMenu
        coachName="Alex Manager"
        coachTitle="Manager"
        coachInitials="AM"
        onOpenSettings={onOpenSettings}
        onSignOut={onSignOut}
      />
    );
    await flushOwnerCheck();

    const trigger = container.querySelector(
      'button[aria-label="Account menu"]'
    ) as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    await click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    // Menu is portalled to document.body (sidebar overflow:hidden would clip it).
    expect(document.body.querySelector('[role="menu"]')).toBeTruthy();
    expect(document.body.textContent).toContain("Profile / Settings");
    expect(document.body.textContent).toContain("Sign out");
    expect(document.body.querySelector('a[href="/owner"]')).toBeNull();
  });

  it("opens via button activation (Enter/Space → click) and closes with Escape", async () => {
    const { AccountMenu } = await import("@/components/account-menu");
    const container = await renderView(
      <AccountMenu
        coachName="Alex Manager"
        coachTitle="Manager"
        coachInitials="AM"
        onOpenSettings={() => undefined}
        onSignOut={() => undefined}
      />
    );
    await flushOwnerCheck();

    const trigger = container.querySelector(
      'button[aria-label="Account menu"]'
    ) as HTMLButtonElement;

    // Native <button> maps Enter/Space to click; assert that path.
    await click(trigger);
    expect(document.body.querySelector('[role="menu"]')).toBeTruthy();

    await keyDown(document, "Escape");
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows Owner Console only for platform owners and wires actions", async () => {
    platformOwner.isPlatformOwner.mockResolvedValue(true);
    const onOpenSettings = vi.fn();
    const onSignOut = vi.fn();
    const { AccountMenu } = await import("@/components/account-menu");

    const container = await renderView(
      <AccountMenu
        coachName="Platform Owner"
        coachTitle="Owner"
        coachInitials="PO"
        onOpenSettings={onOpenSettings}
        onSignOut={onSignOut}
      />
    );
    await flushOwnerCheck();

    const trigger = container.querySelector(
      'button[aria-label="Account menu"]'
    ) as HTMLButtonElement;
    await click(trigger);

    const ownerLink = document.body.querySelector(
      'a[href="/owner"]'
    ) as HTMLAnchorElement;
    expect(ownerLink).toBeTruthy();
    expect(ownerLink.textContent).toContain("Owner Console");

    const settingsItem = Array.from(
      document.body.querySelectorAll('[role="menuitem"]')
    ).find(node => node.textContent?.includes("Profile / Settings")) as
      | HTMLButtonElement
      | undefined;
    expect(settingsItem).toBeTruthy();
    await click(settingsItem!);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);

    await click(trigger);
    const signOutItem = Array.from(
      document.body.querySelectorAll('[role="menuitem"]')
    ).find(node => node.textContent?.includes("Sign out")) as
      | HTMLButtonElement
      | undefined;
    await click(signOutItem!);
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("is wired from AppShell sidebar account area and avoids overflow clipping", () => {
    const shell = readFileSync(
      join(process.cwd(), "components/app-shell.tsx"),
      "utf8"
    );
    const menu = readFileSync(
      join(process.cwd(), "components/account-menu.tsx"),
      "utf8"
    );
    const globals = readFileSync(
      join(process.cwd(), "app/globals.css"),
      "utf8"
    );
    expect(shell).toContain('from "@/components/account-menu"');
    expect(shell).toContain("<AccountMenu");
    expect(shell).toContain("onOpenSettings");
    expect(shell).toContain("onSignOut={onSignOut}");
    expect(shell).not.toContain("OwnerConsoleNavLink");
    expect(shell).not.toContain("identity-sidebar-sign-out");
    expect(menu).toContain("createPortal");
    expect(menu).toContain('"use client"');
    expect(globals).toMatch(
      /\.sidebar,\.identity-sidebar\{[^}]*overflow:hidden/
    );
  });
});
