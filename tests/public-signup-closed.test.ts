import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BRAND } from "@/lib/brand";

const root = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("public sign-up closed — organisation-led access", () => {
  it("sign-in has no Create account link", () => {
    const signIn = read("components/auth/sign-in-form.tsx");
    expect(signIn).not.toContain("/auth/sign-up");
    expect(signIn).not.toContain("Create an account");
    expect(signIn).not.toContain("Don't have an account");
    expect(signIn).toContain("/auth/forgot-password");
  });

  it("anonymous /auth/sign-up is redirected to sign-in in middleware and page", () => {
    const middleware = read("middleware.ts");
    expect(middleware).toContain('pathname === "/auth/sign-up"');
    expect(middleware).toMatch(
      /!userId[\s\S]*\/auth\/sign-up[\s\S]*\/auth\/sign-in/
    );

    const page = read("app/auth/sign-up/page.tsx");
    expect(page).toContain('redirect("/auth/sign-in")');
    expect(page).not.toContain("SignUpForm");
  });

  it("invitation accept, setup-password, and recovery routes remain public", () => {
    const middleware = read("middleware.ts");
    expect(middleware).toContain('"/organisation/invitations/accept"');
    expect(middleware).toContain('"/auth/setup-password"');
    expect(middleware).toContain('"/auth/forgot-password"');
    expect(middleware).toContain('"/auth/reset-password"');
    expect(middleware).toContain('"/auth/callback"');
    expect(middleware).toContain('"/auth/confirm"');
    expect(middleware).toContain('"/auth/sign-in"');
  });

  it("invitation auth delivery does not depend on public sign-up", () => {
    const delivery = read("lib/organisations/invitation-auth-delivery.ts");
    expect(delivery).toContain("inviteUserByEmail");
    expect(delivery).toContain("signInWithOtp");
    expect(delivery).not.toContain("/auth/sign-up");
  });

  it("marketing uses Request a demo and no public free-trial claims", () => {
    expect(BRAND.requestDemoUrl).toBe("https://pridmora.com/demo/");
    const marketing = read("components/marketing-homepage.tsx");
    expect(marketing).toContain("Request a demo");
    expect(marketing).toContain("BRAND.requestDemoUrl");
    expect(marketing).not.toMatch(/14-day free trial|Start your free trial|Free trial/i);
    expect(marketing).not.toContain('href="/auth/sign-up"');
    expect(marketing).not.toContain("Create an account");
  });

  it("Owner Console trial create copy remains for operator-managed orgs", () => {
    expect(existsSync(join(root, "app/owner/organisations/new/page.tsx"))).toBe(
      true
    );
    const ownerNew = read("app/owner/organisations/new/page.tsx");
    expect(ownerNew).toMatch(/trial licence/i);
  });
});
