/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("next/navigation", () => ({
  usePathname: () => "/organisation/members",
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

import { OrganisationShell } from "@/components/organisation/organisation-shell";
import { InviteMemberModal } from "@/components/organisation/invite-member-modal";
import { MemberRoleExplainer } from "@/components/organisation/member-role-explainer";

describe("organisation workspace UI", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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

  it("renders shared shell with Poppins title classes and active nav", () => {
    act(() => {
      root.render(
        <OrganisationShell title="Members" subtitle="Manage access.">
          <p>Content</p>
        </OrganisationShell>
      );
    });

    expect(
      container.querySelector(".organisation-header__eyebrow")?.textContent
    ).toBe("Organisation workspace");
    expect(
      container.querySelector(".organisation-header__title")?.textContent
    ).toBe("Members");
    expect(
      container.querySelector(".organisation-header__subtitle")?.textContent
    ).toBe("Manage access.");
    expect(
      container.querySelector(".organisation-header__back")?.textContent
    ).toContain("Back to workspace");

    const active = container.querySelector(
      '.organisation-nav__link[aria-current="page"]'
    );
    expect(active?.textContent).toBe("Members");

    const css = readFileSync(
      join(process.cwd(), "app/identity-design-system.css"),
      "utf8"
    );
    expect(css).toContain("organisation-header__title");
    expect(css).toContain("var(--font-poppins)");
    expect(css).not.toMatch(/Georgia/);
  });

  it("keeps invitation form behind Invite member and hides raw token initially", () => {
    const onInvite = vi.fn();
    act(() => {
      root.render(
        <InviteMemberModal
          open={false}
          roles={["practitioner", "viewer"]}
          busy={false}
          onClose={() => undefined}
          onInvite={onInvite}
        />
      );
    });
    expect(container.textContent).not.toContain("accept?token=");
    expect(container.querySelector("input[type='email']")).toBeNull();

    act(() => {
      root.render(
        <InviteMemberModal
          open
          roles={["practitioner", "viewer"]}
          busy={false}
          onClose={() => undefined}
          onInvite={onInvite}
        />
      );
    });

    expect(container.querySelector("input[type='email']")).not.toBeNull();
    expect(container.textContent).toContain("Send invitation");
    expect(container.textContent).toContain("Membership role");
    expect(container.textContent).not.toContain("accept?token=");
  });

  it("shows sent confirmation after invitation email without exposing tokens", () => {
    const modalSource = readFileSync(
      join(process.cwd(), "components/organisation/invite-member-modal.tsx"),
      "utf8"
    );
    expect(modalSource).toContain("Manager invitation sent");
    expect(modalSource).toContain("Invitation sent");
    expect(modalSource).toContain("An invitation email has been sent.");
    expect(modalSource).not.toContain("Invitation created");
    expect(modalSource).not.toContain("Copy invitation link");
    expect(modalSource).not.toContain("Share this single-use link:");
    expect(modalSource).not.toMatch(/<code>\{acceptPath\}<\/code>/);
  });

  it("exposes role explanations on demand", () => {
    act(() => {
      root.render(<MemberRoleExplainer />);
    });
    expect(container.textContent).toContain("Understand roles");
    expect(container.textContent).not.toContain(
      "Full organisation administration and commercial control."
    );

    const link = Array.from(container.querySelectorAll("button")).find(btn =>
      btn.textContent?.includes("Understand roles")
    );
    act(() => {
      link?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain(
      "Full organisation administration and commercial control."
    );
    expect(container.textContent).toContain(
      "Manages assigned developmental relationships."
    );
  });

  it("settings page removes developer branding status wording", () => {
    const settings = readFileSync(
      join(process.cwd(), "app/organisation/settings/page.tsx"),
      "utf8"
    );
    const format = readFileSync(
      join(process.cwd(), "lib/organisations/format.ts"),
      "utf8"
    );
    expect(settings).toContain("Custom organisation branding is not available");
    expect(settings).not.toContain("Status: {settings.brandingStatus}");
    expect(settings).toContain("Save changes");
    expect(settings).toContain("retentionPolicyDisplayLabel");
    expect(format).toContain("Standard retention policy");
  });

  it("overview groups metrics and uses personal workspace subtitle composition", () => {
    const overview = readFileSync(
      join(process.cwd(), "app/organisation/page.tsx"),
      "utf8"
    );
    expect(overview).toContain("Personal workspace");
    expect(overview).toContain('title="People"');
    expect(overview).toContain('title="Workflow"');
    expect(overview).toContain('title="Platform activity"');
    expect(overview).toContain("Active practitioners");
    expect(overview).toContain("Seats");
    expect(overview).toContain("seats.label");
  });

  it("settings page surfaces licence seats without billing UI", () => {
    const settings = readFileSync(
      join(process.cwd(), "app/organisation/settings/page.tsx"),
      "utf8"
    );
    expect(settings).toContain('title="Licence"');
    expect(settings).toContain("Seats");
    expect(settings).toContain("seatsLabel");
    expect(settings).not.toMatch(/stripe|invoice|payment/i);
  });

  it("assignments require end confirmation and labelled fields", () => {
    const assignments = readFileSync(
      join(process.cwd(), "components/organisation/assignment-list.tsx"),
      "utf8"
    );
    const form = readFileSync(
      join(process.cwd(), "components/organisation/assignment-form.tsx"),
      "utf8"
    );
    expect(assignments).toContain("End this assignment?");
    expect(assignments).toMatch(/Relationship\s+history will remain preserved/);
    expect(form).toContain(">Relationship</span>");
    expect(form).toContain(">Practitioner</span>");
    expect(form).toContain(">Assignment role</span>");
    expect(form).toContain("Save assignment");
  });

  it("usage groups operational metrics without fabricated percentages", () => {
    const usage = readFileSync(
      join(process.cwd(), "app/organisation/usage/page.tsx"),
      "utf8"
    );
    expect(usage).toContain("AI-supported activity");
    expect(usage).toContain("Development activity");
    expect(usage).toContain("Conversation activity");
    expect(usage).toContain("Preparations this month");
    expect(usage).not.toContain("%");
    expect(usage).not.toContain("AI insights created");
  });
});
