import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  clientBelongsToOrganisation,
  filterClientIdsToOrganisation,
} from "@/lib/organisations/workspace-scope";
import { resolveProductLanguage } from "@/lib/role-language";
import { MANAGER_SCENARIOS, getManagerScenario } from "@/lib/manager-scenarios";
import { BRAND } from "@/lib/brand";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("organisation workspace isolation", () => {
  it("listClientsFromDb always filters by organisation_id when provided", () => {
    const repository = read("lib/supabase/repository.ts");
    expect(repository).toContain('query = query.eq("organisation_id", organisationId)');
    expect(repository).not.toContain(
      "options.organisationId !== coachId"
    );
    expect(repository).toContain(
      "never return rows from another organisation"
    );
  });

  it("requireAssignedClientAccess rejects cross-organisation client IDs", () => {
    const source = read("lib/organisations/current-organisation.ts");
    expect(source).toContain("clientOrganisationId !== activeOrganisationId");
    expect(source).not.toContain(
      "client.organisation_id !== input.context.user.id"
    );
  });

  it("clients list and search APIs require organisation context", () => {
    expect(read("app/api/clients/route.ts")).toContain("requireOrganisationContext");
    expect(read("app/api/clients/search/route.ts")).toContain(
      "requireOrganisationContext"
    );
    expect(read("app/api/clients/[clientId]/route.ts")).toContain(
      "requireAssignedClientAccess"
    );
  });

  it("dashboard development APIs scope results to the active organisation", () => {
    const updates = read("app/api/development-updates/route.ts");
    const latest = read("app/api/development-reports/latest/route.ts");
    expect(updates).toContain("requireOrganisationContext");
    expect(updates).toContain("filterClientIdsToOrganisation");
    expect(latest).toContain("requireOrganisationContext");
    expect(latest).toContain("filterClientIdsToOrganisation");
  });

  it("organisation switch clears relationship state and hard-navigates", () => {
    const context = read("lib/organisations/organisation-context.tsx");
    const home = read("components/home-app.tsx");
    expect(context).toContain('window.location.assign("/?view=dashboard")');
    expect(context).toContain("clearHandler?.()");
    expect(home).toContain("onOrganisationSwitched");
    expect(home).toContain('setSelectedId("")');
    expect(home).toContain("setClients([])");
  });

  it("clientBelongsToOrganisation distinguishes workspaces", () => {
    expect(
      clientBelongsToOrganisation("org-northbridge", "org-personal")
    ).toBe(false);
    expect(
      clientBelongsToOrganisation("org-personal", "org-personal")
    ).toBe(true);
    expect(clientBelongsToOrganisation(null, "org-personal")).toBe(false);
  });

  it("filterClientIdsToOrganisation queries by organisation_id", async () => {
    const calls: unknown[] = [];
    const supabase = {
      from(table: string) {
        calls.push(table);
        return {
          select() {
            return this;
          },
          in() {
            return this;
          },
          eq(column: string, value: string) {
            calls.push([column, value]);
            return Promise.resolve({
              data: [{ id: "client-in-org" }],
              error: null,
            });
          },
        };
      },
    };

    const allowed = await filterClientIdsToOrganisation(
      supabase as never,
      "org-personal",
      ["client-in-org", "client-other"]
    );
    expect(allowed.has("client-in-org")).toBe(true);
    expect(calls.some(call => Array.isArray(call) && call[0] === "organisation_id" && call[1] === "org-personal")).toBe(true);
  });
});

describe("navigation sign-out accessibility", () => {
  it("keeps account/sign-out outside the scroll region", () => {
    const shell = read("components/app-shell.tsx");
    const css = read("app/globals.css");
    expect(shell).toContain("identity-sidebar-scroll");
    expect(shell).toContain("identity-sidebar-sign-out");
    expect(shell.indexOf("identity-sidebar-scroll")).toBeLessThan(
      shell.indexOf("identity-sidebar-account")
    );
    expect(shell.indexOf("identity-sidebar-account")).toBeLessThan(
      shell.indexOf("Sign out")
    );
    expect(css).toContain("identity-sidebar-scroll");
    expect(css).toContain("height:100dvh");
    expect(css).toContain("overflow-y:auto");
  });

  it("exposes primary manager navigation", () => {
    const shell = read("components/app-shell.tsx");
    expect(shell).toContain('label: "Home"');
    expect(shell).toContain('label: "Conversations"');
    expect(shell).toContain('label: "Development"');
    expect(shell).toContain('label: "Reports"');
    expect(shell).toContain('label: "Settings"');
  });
});

describe("manager repositioning foundations", () => {
  it("brands Aurelia as embedded intelligence", () => {
    expect(BRAND.intelligenceName).toBe("Aurelia");
    expect(BRAND.intelligenceRole).toContain("Manager Development");
    expect(BRAND.productDescriptor).toMatch(/Manager development/i);
  });

  it("uses role-aware people language", () => {
    const manager = resolveProductLanguage("manager");
    const coach = resolveProductLanguage("coach");
    expect(manager.homeTitle).toBe("My Management Overview");
    expect(manager.personSingular).toBe("team member");
    expect(coach.personSingular).toBe("client");
    expect(coach.homeTitle).toBe("Development Overview");
  });

  it("provides manager scenario entry points into preparation", () => {
    expect(MANAGER_SCENARIOS.length).toBeGreaterThanOrEqual(15);
    expect(getManagerScenario("difficult-conversation")?.sensitivity).toBe(
      "elevated"
    );
    expect(read("components/prepare/preparation-view.tsx")).toContain(
      "ManagerScenarioPicker"
    );
    expect(read("lib/manager-scenarios.ts")).toContain(
      "Do not provide HR, legal or disciplinary advice"
    );
  });

  it("keeps my development distinct from my people", () => {
    const view = read("components/my-development-view.tsx");
    expect(view).toContain("My development");
    expect(view).toContain("separate from the people you manage");
    expect(read("components/app-shell.tsx")).toContain("my-development");
  });
});
