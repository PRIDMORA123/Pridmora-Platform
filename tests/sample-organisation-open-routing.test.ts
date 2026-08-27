import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isHomeWorkspacePath,
  isSampleOrganisationOpenPath,
  LEAD_WORKSPACE_PATH,
  MANAGER_WORKSPACE_PATH,
  OWNER_CONSOLE_PATH,
  resolvePostLoginDestination,
  SAMPLE_ORGANISATION_OPEN_PATH,
} from "@/lib/auth/post-login-destination";
import {
  canAccessCoachingContent,
  canEnterManagerPeopleWorkspace,
  requiresAssignedOnlyPeopleList,
} from "@/lib/organisations/permissions";
import { isOpenableSampleOrganisation } from "@/lib/sample-organisations/status";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

function mockInstallationLookup(result: {
  data: { id: string } | null;
  error: { message: string } | null;
}) {
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    limit: () => query,
    maybeSingle: async () => result,
  };
  return {
    from(table: string) {
      expect(table).toBe("sample_organisation_installations");
      return query;
    },
  };
}

describe("sample organisation Open practitioner routing", () => {
  it("recognises only the explicit sample Open query", () => {
    expect(SAMPLE_ORGANISATION_OPEN_PATH).toBe("/?view=dashboard&sampleOpen=1");
    expect(isSampleOrganisationOpenPath(SAMPLE_ORGANISATION_OPEN_PATH)).toBe(
      true
    );
    expect(isSampleOrganisationOpenPath(MANAGER_WORKSPACE_PATH)).toBe(false);
    expect(isSampleOrganisationOpenPath("/")).toBe(false);
    expect(isSampleOrganisationOpenPath("/organisation")).toBe(false);
    expect(isHomeWorkspacePath(SAMPLE_ORGANISATION_OPEN_PATH)).toBe(true);
  });

  it("keeps an Averly sample owner on Manager home for explicit Open", () => {
    const destination = resolvePostLoginDestination({
      requestedNext: SAMPLE_ORGANISATION_OPEN_PATH,
      isPlatformOwner: false,
      membershipRole: "owner",
      professionalRole: "manager",
      organisationType: "business",
      allowSampleOrganisationOpen: true,
    });
    expect(destination).toBe(SAMPLE_ORGANISATION_OPEN_PATH);
    expect(isHomeWorkspacePath(destination)).toBe(true);
  });

  it("does not treat a forged sampleOpen flag as Open on a real business org", () => {
    expect(
      resolvePostLoginDestination({
        requestedNext: SAMPLE_ORGANISATION_OPEN_PATH,
        isPlatformOwner: false,
        membershipRole: "owner",
        professionalRole: "manager",
        organisationType: "business",
        allowSampleOrganisationOpen: false,
      })
    ).toBe(LEAD_WORKSPACE_PATH);
  });

  it("does not change normal business-owner login or Manager-home bookmarks", () => {
    expect(
      resolvePostLoginDestination({
        requestedNext: "/",
        isPlatformOwner: false,
        membershipRole: "owner",
        professionalRole: "manager",
        organisationType: "business",
      })
    ).toBe(LEAD_WORKSPACE_PATH);
    expect(
      resolvePostLoginDestination({
        requestedNext: MANAGER_WORKSPACE_PATH,
        isPlatformOwner: false,
        membershipRole: "owner",
        professionalRole: "manager",
        organisationType: "business",
        allowSampleOrganisationOpen: true,
      })
    ).toBe(LEAD_WORKSPACE_PATH);
  });

  it("leaves oversight on /organisation even with sample Open", () => {
    expect(
      resolvePostLoginDestination({
        requestedNext: SAMPLE_ORGANISATION_OPEN_PATH,
        isPlatformOwner: false,
        membershipRole: "oversight",
        professionalRole: null,
        organisationType: "business",
        allowSampleOrganisationOpen: true,
      })
    ).toBe(LEAD_WORKSPACE_PATH);
  });

  it("leaves administrator on /organisation even with sample Open", () => {
    expect(
      resolvePostLoginDestination({
        requestedNext: SAMPLE_ORGANISATION_OPEN_PATH,
        isPlatformOwner: false,
        membershipRole: "administrator",
        professionalRole: null,
        organisationType: "business",
        allowSampleOrganisationOpen: true,
      })
    ).toBe(LEAD_WORKSPACE_PATH);
  });

  it("does not send a platform owner who opened the sample to /owner", () => {
    expect(
      resolvePostLoginDestination({
        requestedNext: SAMPLE_ORGANISATION_OPEN_PATH,
        isPlatformOwner: true,
        membershipRole: "owner",
        professionalRole: "manager",
        organisationType: "business",
        allowSampleOrganisationOpen: true,
      })
    ).toBe(SAMPLE_ORGANISATION_OPEN_PATH);
    expect(
      resolvePostLoginDestination({
        requestedNext: "/",
        isPlatformOwner: true,
        membershipRole: "owner",
        professionalRole: "manager",
        organisationType: "business",
        allowSampleOrganisationOpen: true,
      })
    ).toBe(OWNER_CONSOLE_PATH);
  });

  it("workspace switching still uses role defaults, not sample Open", () => {
    const context = read("lib/organisations/organisation-context.tsx");
    expect(context).toContain("requestedNext: \"/\"");
    expect(context).not.toContain("SAMPLE_ORGANISATION_OPEN_PATH");
    expect(context).not.toContain("allowSampleOrganisationOpen: true");
  });

  it("Open, HomeApp bounce, and current-org flag are wired to the same exception", () => {
    const page = read(
      "components/sample-organisation/sample-organisation-page.tsx"
    );
    const home = read("components/home-app.tsx");
    const current = read("app/api/organisations/current/route.ts");
    const authoritative = read("lib/auth/post-login-destination.ts");

    expect(page).toContain("SAMPLE_ORGANISATION_OPEN_PATH");
    expect(home).toContain("allowSampleOrganisationOpen");
    expect(home).toContain("isSampleOrganisationOpenPath");
    expect(home).toContain("isSampleOrganisation");
    expect(current).toContain("isOpenableSampleOrganisation");
    expect(current).toContain("isSampleOrganisation");
    expect(authoritative).toContain("isOpenableSampleOrganisation");
    expect(authoritative).toContain("allowSampleOrganisationOpen");
  });

  it("People listing stays assigned-only and org-scoped", () => {
    expect(requiresAssignedOnlyPeopleList("owner")).toBe(true);
    expect(requiresAssignedOnlyPeopleList("oversight")).toBe(true);
    const clients = read("app/api/clients/route.ts");
    const list = read("lib/supabase/repository.ts");
    expect(clients).toContain("requireOrganisationContext");
    expect(clients).toContain("requiresAssignedOnlyPeopleList");
    expect(list).toContain("organisation_id");
    expect(list).toContain("assignedOnly");
    expect(list).toContain(
      "Do not fall back to coach_id-only listing — that leaks cross-workspace records."
    );
  });

  it("does not grant unassigned relationship content to organisation roles", () => {
    expect(
      canAccessCoachingContent({ role: "owner", assignmentRole: null })
    ).toBe(false);
    expect(
      canAccessCoachingContent({
        role: "owner",
        assignmentRole: "primary",
      })
    ).toBe(true);
    expect(
      canAccessCoachingContent({
        role: "oversight",
        assignmentRole: "primary",
      })
    ).toBe(false);
    expect(canEnterManagerPeopleWorkspace("oversight")).toBe(false);
    expect(canEnterManagerPeopleWorkspace("owner")).toBe(true);

    const destination = read("lib/auth/post-login-destination.ts");
    const permissions = read("lib/organisations/permissions.ts");
    const gate = read("lib/organisations/current-organisation.ts");
    expect(destination).not.toContain("canAccessCoachingContent");
    expect(permissions).toContain("canAccessCoachingContent");
    expect(gate).toContain("requireAssignedClientAccess");
  });

  it("isOpenableSampleOrganisation is true only for ready sample installations", async () => {
    expect(
      await isOpenableSampleOrganisation(
        mockInstallationLookup({
          data: { id: "install-1" },
          error: null,
        }) as never,
        "org-averly"
      )
    ).toBe(true);
    expect(
      await isOpenableSampleOrganisation(
        mockInstallationLookup({
          data: null,
          error: null,
        }) as never,
        "org-customer"
      )
    ).toBe(false);
    expect(await isOpenableSampleOrganisation({} as never, "")).toBe(false);
  });
});
