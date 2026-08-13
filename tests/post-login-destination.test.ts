import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LEAD_WORKSPACE_PATH,
  MANAGER_WORKSPACE_PATH,
  OWNER_CONSOLE_PATH,
  resolvePostLoginDestination,
} from "@/lib/auth/post-login-destination";

describe("authoritative post-login destination", () => {
  it("routes platform owners to /owner", () => {
    expect(
      resolvePostLoginDestination({
        requestedNext: "/",
        isPlatformOwner: true,
        membershipRole: null,
        professionalRole: null,
      })
    ).toBe(OWNER_CONSOLE_PATH);
  });

  it("routes oversight Lead to /organisation", () => {
    expect(
      resolvePostLoginDestination({
        requestedNext: "/",
        isPlatformOwner: false,
        membershipRole: "oversight",
        professionalRole: null,
      })
    ).toBe(LEAD_WORKSPACE_PATH);
  });

  it("routes Manager practitioner to Manager workspace", () => {
    expect(
      resolvePostLoginDestination({
        requestedNext: "/",
        isPlatformOwner: false,
        membershipRole: "practitioner",
        professionalRole: "manager",
      })
    ).toBe(MANAGER_WORKSPACE_PATH);
  });

  it("preserves invitation deep links over role defaults", () => {
    expect(
      resolvePostLoginDestination({
        requestedNext: "/organisation/invitations/accept?token=abc",
        isPlatformOwner: true,
        membershipRole: "oversight",
        professionalRole: null,
      })
    ).toBe("/organisation/invitations/accept?token=abc");
  });

  it("does not invent a lead professional_role", () => {
    const source = readFileSync(
      resolve(process.cwd(), "lib/auth/post-login-destination.ts"),
      "utf8"
    );
    expect(source).not.toContain('professional_role = "lead"');
    expect(source).not.toContain('professionalRole === "lead"');
  });
});
