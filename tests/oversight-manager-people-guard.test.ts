import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LEAD_WORKSPACE_PATH } from "@/lib/auth/post-login-destination";
import { resolvePostLoginDestination } from "@/lib/auth/post-login-destination";
import {
  canAccessCoachingContent,
  canEnterManagerPeopleWorkspace,
  requiresAssignedOnlyPeopleList,
} from "@/lib/organisations/permissions";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("Scenario A — oversight Manager People UX guard", () => {
  it("routes oversight Lead to /organisation after sign-in", () => {
    expect(
      resolvePostLoginDestination({
        requestedNext: "/",
        isPlatformOwner: false,
        membershipRole: "oversight",
        professionalRole: null,
      })
    ).toBe(LEAD_WORKSPACE_PATH);
  });

  it("does not grant coaching content to oversight (API 404 path preserved)", () => {
    expect(
      canAccessCoachingContent({
        role: "oversight",
        assignmentRole: "primary",
      })
    ).toBe(false);
    expect(
      canAccessCoachingContent({
        role: "oversight",
        assignmentRole: null,
      })
    ).toBe(false);
  });

  it("treats oversight as assigned-only for Manager People listing", () => {
    expect(requiresAssignedOnlyPeopleList("oversight")).toBe(true);
    expect(requiresAssignedOnlyPeopleList("practitioner")).toBe(true);
    expect(requiresAssignedOnlyPeopleList("owner")).toBe(true);
    expect(requiresAssignedOnlyPeopleList("administrator")).toBe(true);
    expect(requiresAssignedOnlyPeopleList("viewer")).toBe(false);

    const clientsRoute = read("app/api/clients/route.ts");
    const searchRoute = read("app/api/clients/search/route.ts");
    expect(clientsRoute).toContain("requiresAssignedOnlyPeopleList");
    expect(searchRoute).toContain("requiresAssignedOnlyPeopleList");
    expect(clientsRoute).not.toMatch(
      /assignedOnly\s*=\s*\n?\s*role === "practitioner" \|\|/
    );
  });

  it("blocks oversight from Manager People workspace UI entry", () => {
    expect(canEnterManagerPeopleWorkspace("oversight")).toBe(false);
    expect(canEnterManagerPeopleWorkspace("viewer")).toBe(false);
    expect(canEnterManagerPeopleWorkspace("practitioner")).toBe(true);
    expect(canEnterManagerPeopleWorkspace("owner")).toBe(true);
    expect(canEnterManagerPeopleWorkspace("administrator")).toBe(true);
  });

  it("hides Manager People navigation for membership role oversight", () => {
    const shell = read("components/app-shell.tsx");
    expect(shell).toContain("canEnterManagerPeopleWorkspace");
    expect(shell).toContain("showManagerPeopleNav");
    expect(shell).toContain("organisation.role");
  });

  it("guards openClient / coach-space and does not render CoachSpace for oversight", () => {
    const home = read("components/home-app.tsx");
    expect(home).toContain("canEnterManagerPeopleWorkspace");
    expect(home).toContain("leaveToOrganisationWorkspace");
    expect(home).toContain("LEAD_WORKSPACE_PATH");
    expect(home).toContain("MANAGER_PEOPLE_WORKSPACE_VIEWS");
    expect(home).toContain("mayEnterManagerPeopleWorkspace");
    expect(home).toMatch(
      /view === "coach-space" &&\s*selected &&\s*mayEnterManagerPeopleWorkspace/
    );
    // openClient must refuse non-content-capable roles before sessions load.
    const openClientIdx = home.indexOf("async function openClient");
    const refreshIdx = home.indexOf(
      "await refreshSessionsForClient(client.id)",
      openClientIdx
    );
    const guardIdx = home.indexOf(
      "canEnterManagerPeopleWorkspace(membershipRole)",
      openClientIdx
    );
    expect(openClientIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(openClientIdx);
    expect(guardIdx).toBeLessThan(refreshIdx);
  });

  it("keeps organisation header from sending oversight to Manager dashboard", () => {
    const header = read("components/organisation/organisation-header.tsx");
    expect(header).toContain('role === "oversight"');
    expect(header).toContain("LEAD_WORKSPACE_PATH");
    expect(header).toContain("Organisation overview");
    expect(header).toContain("useOrganisation");
  });

  it("preserves content API assignment gates (sessions / moments / profiles)", () => {
    expect(read("app/api/sessions/route.ts")).toContain(
      "requireAssignedClientAccess"
    );
    expect(read("app/api/coaching-moments/route.ts")).toContain(
      "requireAssignedPersonInOrganisation"
    );
    expect(
      read("app/api/development-profiles/[clientId]/route.ts")
    ).toContain("requireAssignedPersonInOrganisation");
  });

  it("does not broaden CONTENT_CAPABLE_ROLES or weaken canAccessCoachingContent", () => {
    const permissions = read("lib/organisations/permissions.ts");
    const setMatch = permissions.match(
      /const CONTENT_CAPABLE_ROLES: ReadonlySet<MembershipRole> = new Set\(\[([\s\S]*?)\]\);/
    );
    expect(setMatch?.[1]).toBeTruthy();
    expect(setMatch![1]).toContain('"practitioner"');
    expect(setMatch![1]).toContain('"owner"');
    expect(setMatch![1]).toContain('"administrator"');
    expect(setMatch![1]).not.toContain('"oversight"');
    expect(
      canAccessCoachingContent({
        role: "practitioner",
        assignmentRole: "primary",
      })
    ).toBe(true);
  });
});
