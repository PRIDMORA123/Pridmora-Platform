import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canAccessCoachingContent,
  canEnterManagerPeopleWorkspace,
  canManageSampleOrganisation,
  hasPermission,
} from "@/lib/organisations/permissions";
import {
  LEAD_WORKSPACE_PATH,
  resolvePostLoginDestination,
  SAMPLE_ORGANISATION_OPEN_PATH,
} from "@/lib/auth/post-login-destination";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("Averly sample access — owner only", () => {
  it("does not treat Organisation Lead as authorised for sample management", () => {
    const types = read("lib/organisations/types.ts");
    expect(types).toContain(
      "Organisation Lead: manages Managers, seats and assignments"
    );
    expect(canManageSampleOrganisation("owner")).toBe(true);
    expect(canManageSampleOrganisation("oversight")).toBe(false);
  });

  it("authorises owner only to manage Averly", () => {
    expect(hasPermission("owner", "sample_organisation.manage")).toBe(true);
    expect(hasPermission("oversight", "sample_organisation.manage")).toBe(
      false
    );
  });

  it("denies administrator, Organisation Lead, practitioner, ordinary manager, and viewer", () => {
    expect(canManageSampleOrganisation("administrator")).toBe(false);
    expect(canManageSampleOrganisation("oversight")).toBe(false);
    expect(canManageSampleOrganisation("practitioner")).toBe(false);
    expect(canManageSampleOrganisation("viewer")).toBe(false);
    const permissions = read("lib/organisations/permissions.ts");
    expect(permissions).not.toMatch(
      /canManageSampleOrganisation[\s\S]*professionalRole/
    );
  });

  it("does not grant coaching content to Organisation Lead via sample manage", () => {
    expect(hasPermission("oversight", "coaching_content.view")).toBe(false);
    expect(hasPermission("oversight", "private_notes.view")).toBe(false);
    expect(
      canAccessCoachingContent({
        role: "oversight",
        assignmentRole: "primary",
      })
    ).toBe(false);
    expect(canEnterManagerPeopleWorkspace("oversight")).toBe(false);
  });

  it("installer owner still enters practitioner view for assigned sample relationships", () => {
    expect(canEnterManagerPeopleWorkspace("owner")).toBe(true);
    expect(
      canAccessCoachingContent({
        role: "owner",
        assignmentRole: "primary",
      })
    ).toBe(true);
    expect(
      canAccessCoachingContent({
        role: "owner",
        assignmentRole: null,
      })
    ).toBe(false);
    expect(
      resolvePostLoginDestination({
        requestedNext: SAMPLE_ORGANISATION_OPEN_PATH,
        isPlatformOwner: false,
        membershipRole: "owner",
        professionalRole: "manager",
        organisationType: "business",
        allowSampleOrganisationOpen: true,
      })
    ).toBe(SAMPLE_ORGANISATION_OPEN_PATH);
  });

  it("sampleOpen=1 cannot bypass sample-manage authorisation", () => {
    expect(canManageSampleOrganisation("administrator")).toBe(false);
    expect(canManageSampleOrganisation("oversight")).toBe(false);
    expect(canManageSampleOrganisation("practitioner")).toBe(false);
    expect(canManageSampleOrganisation("viewer")).toBe(false);

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

    const open = read(
      "app/api/sample-organisations/installations/[id]/open/route.ts"
    );
    expect(open).toContain("requireSampleOrganisationManage");
    expect(open).not.toContain("sampleOpen");
  });

  it("gates sample UI URL and APIs with the same permission", () => {
    const page = read("app/settings/sample-organisation/page.tsx");
    expect(page).toContain("canManageSampleOrganisation");
    expect(page).toContain("redirect(\"/\")");
    expect(page).toContain("requireOrganisationContext");

    const access = read("lib/sample-organisations/access.ts");
    expect(access).toContain("sample_organisation.manage");
    expect(access).toContain("requireSampleOrganisationManage");

    for (const path of [
      "app/api/sample-organisations/route.ts",
      "app/api/sample-organisations/averly-services-group/install/route.ts",
      "app/api/sample-organisations/installations/[id]/open/route.ts",
      "app/api/sample-organisations/installations/[id]/reset/route.ts",
      "app/api/sample-organisations/installations/[id]/route.ts",
    ]) {
      expect(read(path), path).toContain("requireSampleOrganisationManage");
    }
  });

  it("does not change other organisation permissions for administrator or Lead", () => {
    expect(hasPermission("administrator", "organisation.manage")).toBe(true);
    expect(hasPermission("administrator", "members.manage")).toBe(true);
    expect(hasPermission("oversight", "members.manage")).toBe(true);
    expect(hasPermission("oversight", "assignments.manage")).toBe(true);
    expect(hasPermission("oversight", "organisation.manage")).toBe(false);
    expect(hasPermission("owner", "billing.manage")).toBe(true);
    expect(hasPermission("oversight", "billing.manage")).toBe(false);
  });
});
