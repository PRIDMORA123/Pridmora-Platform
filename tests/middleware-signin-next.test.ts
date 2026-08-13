import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildSafeSignInNext,
  sanitizeNextPath,
} from "@/lib/auth/email-link";

describe("middleware sign-in next destination", () => {
  it("preserves invitation accept token through unauthenticated redirect next", () => {
    const next = buildSafeSignInNext(
      "/organisation/invitations/accept",
      "?token=abc123"
    );
    expect(next).toBe("/organisation/invitations/accept?token=abc123");

    const signInUrl = new URL("https://platform.pridmora.com/auth/sign-in");
    signInUrl.searchParams.set("next", next);
    expect(signInUrl.pathname).toBe("/auth/sign-in");
    expect(signInUrl.searchParams.get("next")).toBe(
      "/organisation/invitations/accept?token=abc123"
    );
    expect(signInUrl.toString()).toContain(
      "next=%2Forganisation%2Finvitations%2Faccept%3Ftoken%3Dabc123"
    );
  });

  it("keeps normal protected routes as pathname-only next values", () => {
    expect(buildSafeSignInNext("/owner", "")).toBe("/owner");
    expect(buildSafeSignInNext("/organisation", "")).toBe("/organisation");
    expect(buildSafeSignInNext("/settings", "")).toBe("/settings");
  });

  it("rejects external and malicious destinations", () => {
    expect(buildSafeSignInNext("https://evil.example", "")).toBe("/");
    expect(buildSafeSignInNext("//evil.example", "")).toBe("/");
    expect(buildSafeSignInNext("/\\evil.example", "")).toBe("/");
    expect(
      sanitizeNextPath("https://evil.example/phish", "/owner")
    ).toBe("/owner");
    expect(sanitizeNextPath("//evil.example", "/owner")).toBe("/owner");
    expect(
      buildSafeSignInNext("/organisation/invitations/accept", "?token=ok\n/evil")
    ).toBe("/");
  });

  it("wires middleware to buildSafeSignInNext with request search", () => {
    const middleware = readFileSync(
      join(process.cwd(), "middleware.ts"),
      "utf8"
    );
    expect(middleware).toContain('from "@/lib/auth/email-link"');
    expect(middleware).toContain("buildSafeSignInNext");
    expect(middleware).toContain(
      "buildSafeSignInNext(pathname, request.nextUrl.search)"
    );
    expect(middleware).not.toContain(
      'redirectUrl.searchParams.set("next", pathname === "/" ? "/?view=dashboard" : pathname)'
    );
    expect(middleware).toContain('"/organisation/invitations/accept"');
  });
});
