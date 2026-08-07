import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  clientBelongsToOrganisation,
  filterClientIdsToOrganisation,
} from "@/lib/organisations/workspace-scope";
import {
  resolveAccountRoleTitle,
  resolveProductLanguage,
} from "@/lib/role-language";
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
    expect(manager.activeWorkDescription).toMatch(/management work/i);
    expect(manager.momentsTitle).toBe("Development moments");
    expect(manager.accountRoleTitle).toBe("Manager");
    expect(coach.personSingular).toBe("client");
    expect(coach.homeTitle).toBe("Development Overview");
    expect(coach.activeWorkDescription).toMatch(/coaching work/i);
    expect(coach.momentsTitle).toBe("Coaching Moments");
    expect(coach.accountRoleTitle).toBe("Professional Coach");
    expect(
      resolveAccountRoleTitle({
        professionalRole: "manager",
        profileTitle: "Professional Coach",
      })
    ).toBe("Manager");
    expect(
      resolveAccountRoleTitle({
        professionalRole: "coach",
        profileTitle: "Executive Coach",
      })
    ).toBe("Executive Coach");
    expect(
      resolveAccountRoleTitle({
        professionalRole: "coach",
        profileTitle: null,
      })
    ).toBe("Professional Coach");
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

describe("averly sample organisation positioning", () => {
  it("ships Averly as the only installable sample pack", () => {
    const types = read("lib/sample-organisations/types.ts");
    const registry = read("lib/sample-organisations/registry.ts");
    const page = read("components/sample-organisation/sample-organisation-page.tsx");
    expect(types).toContain('DEFAULT_SAMPLE_PACK_KEY: SamplePackKey = "averly-services-group"');
    expect(registry).toContain('packKey: "averly-services-group"');
    expect(registry).toContain("installable: true");
    expect(registry).toContain('packKey: "northbridge-healthcare"');
    expect(registry).toContain("installable: false");
    expect(page).toContain("Averly Services Group");
    expect(page).toContain("Manager Development Demonstration");
    expect(page).toContain("/api/sample-organisations");
    expect(page).not.toContain("/api/sample-organisations/northbridge-healthcare");
  });

  it("preserves legacy Northbridge cleanup without converting on reset", () => {
    const install = read("lib/sample-organisations/install.ts");
    const reset = read("lib/sample-organisations/reset-remove.ts");
    const page = read("components/sample-organisation/sample-organisation-page.tsx");
    expect(install).toContain("PACK_NOT_AVAILABLE");
    expect(reset).toContain("packKey: installation.packKey");
    expect(page).toContain("Previous sample organisation");
    expect(page).toContain("will not convert to Averly");
  });

  it("uses management terminology in the Averly pack", () => {
    const sessions = read("sample-data/averly-services-group/sessions.json");
    const relationships = read(
      "sample-data/averly-services-group/relationships.json"
    );
    const manifest = read("sample-data/averly-services-group/manifest.json");
    expect(manifest).toContain("Manager Development Demonstration");
    expect(sessions.toLowerCase()).not.toContain("coachee");
    expect(sessions).toMatch(
      /Development conversation|Management conversation|One-to-one|Feedback conversation|Performance conversation/
    );
    expect(relationships).toContain("Sophie Bennett");
    expect(relationships).toContain("Marcus Reed");
    expect(relationships).toContain("Senior Leader A");
    expect(relationships).toContain("Manager B");
    expect(sessions).toContain("sophie-bennett-session-1");
    expect(sessions).toContain("marcus-reed-session-6");
  });
});
