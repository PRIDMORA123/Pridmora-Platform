import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveManagerHomeOrganisationIdentity } from "@/lib/organisations/manager-home-organisation-identity";

const root = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("FIX-2 Manager Home organisation identity", () => {
  it("1: organisation-linked manager resolves the authorised organisation name", () => {
    expect(
      resolveManagerHomeOrganisationIdentity({
        organisationName: "Customer One NHS Trust",
        organisationType: "public_sector",
      })
    ).toEqual({
      name: "Customer One NHS Trust",
      multiOrganisation: false,
    });
  });

  it("2: Organisation A identity does not resolve as Organisation B", () => {
    const orgA = resolveManagerHomeOrganisationIdentity({
      organisationName: "Organisation A",
      organisationType: "business",
    });
    const orgB = resolveManagerHomeOrganisationIdentity({
      organisationName: "Organisation B",
      organisationType: "business",
    });
    expect(orgA?.name).toBe("Organisation A");
    expect(orgB?.name).toBe("Organisation B");
    expect(orgA?.name).not.toBe(orgB?.name);
  });

  it("3: personal / non-org context does not show a misleading organisation label", () => {
    expect(
      resolveManagerHomeOrganisationIdentity({
        organisationName: "Personal workspace",
        organisationType: "personal",
      })
    ).toBeNull();
    expect(
      resolveManagerHomeOrganisationIdentity({
        organisationName: "Anything",
        organisationType: "personal",
      })
    ).toBeNull();
    expect(
      resolveManagerHomeOrganisationIdentity({
        organisationName: "Personal workspace",
        organisationType: "business",
      })
    ).toBeNull();
    expect(resolveManagerHomeOrganisationIdentity(null)).toBeNull();
    expect(
      resolveManagerHomeOrganisationIdentity({
        organisationName: "   ",
        organisationType: "business",
      })
    ).toBeNull();
  });

  it("4: invitation accept sets current org then Manager Home reads authorised context", () => {
    const acceptSql = read(
      "supabase/migrations/20260802210000_repair_invitation_acceptance.sql"
    );
    expect(acceptSql).toContain(
      "current_organisation_id = v_invite.organisation_id"
    );

    const acceptPage = read("app/organisation/invitations/accept/page.tsx");
    expect(acceptPage).toContain("organisationName");
    expect(acceptPage).toContain("resolveInvitationAcceptLanding");

    const mcc = read("components/identity/manager-command-centre.tsx");
    expect(mcc).toContain("useOrganisation");
    expect(mcc).toContain("resolveManagerHomeOrganisationIdentity");
    expect(mcc).toContain('data-testid="manager-home-organisation"');
    expect(mcc).not.toContain("searchParams");
    expect(mcc).not.toContain("URLSearchParams");
  });

  it("5: organisation identity is sourced from authorised context, not client input", () => {
    const mcc = read("components/identity/manager-command-centre.tsx");
    const homeApp = read("components/home-app.tsx");
    expect(mcc).toContain("organisation.organisation.name");
    expect(mcc).toContain("organisation.organisation.organisationType");
    expect(homeApp).toContain('/api/organisations/current');
    expect(mcc).not.toMatch(/organisationId\s*=\s*.*query/i);
  });

  it("6: multi-org preserves existing model and labels the current workspace", () => {
    expect(
      resolveManagerHomeOrganisationIdentity({
        organisationName: "Northbridge Care Group",
        organisationType: "business",
        multiOrganisation: true,
      })
    ).toEqual({
      name: "Northbridge Care Group",
      multiOrganisation: true,
    });

    const mcc = read("components/identity/manager-command-centre.tsx");
    expect(mcc).toContain("Current organisation workspace");
    expect(mcc).toContain("showWorkspaceSelector");
    // Do not invent a new switcher on Manager Home.
    expect(mcc).not.toContain("switchOrganisation");
  });

  it("7–8: Manager Home actions and routing wiring remain unchanged", () => {
    const mcc = read("components/identity/manager-command-centre.tsx");
    expect(mcc).toContain("MANAGER_FRONT_DOOR_ACTIONS");
    expect(mcc).toContain("What would help you today?");
    expect(mcc).toContain("data-front-door-action");
    expect(mcc).not.toContain("FIX-1");
    expect(mcc).not.toContain("Talk vs Prepare");
  });
});
