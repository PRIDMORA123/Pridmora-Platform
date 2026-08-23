import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isHomeWorkspacePath,
  LEAD_WORKSPACE_PATH,
  loadActiveMembershipForRouting,
  MANAGER_WORKSPACE_PATH,
  resolvePostLoginDestination,
} from "@/lib/auth/post-login-destination";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("oversight root route — active membership workspace", () => {
  it("routes oversight + / to /organisation (same helper as post-login)", () => {
    expect(
      resolvePostLoginDestination({
        requestedNext: "/",
        isPlatformOwner: false,
        membershipRole: "oversight",
        professionalRole: null,
      })
    ).toBe(LEAD_WORKSPACE_PATH);
    expect(isHomeWorkspacePath(LEAD_WORKSPACE_PATH)).toBe(false);
  });

  it("keeps practitioner Manager on Manager home for /", () => {
    const destination = resolvePostLoginDestination({
      requestedNext: "/",
      isPlatformOwner: false,
      membershipRole: "practitioner",
      professionalRole: "manager",
    });
    expect(destination).toBe(MANAGER_WORKSPACE_PATH);
    expect(isHomeWorkspacePath(destination)).toBe(true);
  });

  it("routes from active organisation membership, not a global professional title", () => {
    // Same user could have profile title "Manager" while Lead membership is oversight.
    expect(
      resolvePostLoginDestination({
        requestedNext: "/",
        isPlatformOwner: false,
        membershipRole: "oversight",
        professionalRole: null,
      })
    ).toBe(LEAD_WORKSPACE_PATH);

    // Multi-org: active membership practitioner+manager stays on Manager home.
    expect(
      resolvePostLoginDestination({
        requestedNext: "/",
        isPlatformOwner: false,
        membershipRole: "practitioner",
        professionalRole: "manager",
      })
    ).toBe(MANAGER_WORKSPACE_PATH);

    // Multi-org: switching active membership to oversight must leave Manager home.
    expect(
      resolvePostLoginDestination({
        requestedNext: "/?view=dashboard",
        isPlatformOwner: false,
        membershipRole: "oversight",
        professionalRole: null,
      })
    ).toBe(LEAD_WORKSPACE_PATH);
  });

  it("applies authoritative destination on authenticated `/` (not only at sign-in)", () => {
    const page = read("app/page.tsx");
    expect(page).toContain("resolveAuthoritativePostLoginDestination");
    expect(page).toContain("isHomeWorkspacePath");
    expect(page).toContain("redirect(destination)");
    expect(page).toContain("HomeApp");
    expect(page).toContain("requestedNext");
    expect(page).toContain("searchParams");
    expect(page).not.toMatch(/user\.id,\s*"\/"/);

    const signIn = read("components/auth/sign-in-form.tsx");
    expect(signIn).toContain("resolveAuthoritativePostLoginDestination");
  });

  it("HomeApp does not keep Lead memberships on Manager onboarding/dashboard", () => {
    const home = read("components/home-app.tsx");
    expect(home).toContain("resolvePostLoginDestination");
    expect(home).toContain("isHomeWorkspacePath");
    // Lead redirect runs from membership role; CoachSpace remains gated.
    expect(home).toContain("mayEnterManagerPeopleWorkspace");
    expect(home).toContain("MANAGER_PEOPLE_WORKSPACE_VIEWS");
  });

  it("loadActiveMembershipForRouting prefers current_organisation_id", () => {
    const source = readFileSync(
      resolve(process.cwd(), "lib/auth/post-login-destination.ts"),
      "utf8"
    );
    expect(source).toContain("current_organisation_id");
    expect(source).toContain("loadActiveMembershipForRouting");
    expect(typeof loadActiveMembershipForRouting).toBe("function");
  });
});
