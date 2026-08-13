import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PILOT_PROJECT_REF,
  IDENTITY_PROJECT_REF,
  extractSupabaseProjectRef,
} from "@/lib/supabase/project-env";
import { cookieNamesForSupabaseProject } from "@/lib/supabase/middleware";

describe("middleware project-scoped cookie clearing", () => {
  it("selects only the current project cookie namespace", () => {
    const names = [
      `sb-${PILOT_PROJECT_REF}-auth-token`,
      `sb-${PILOT_PROJECT_REF}-auth-token.0`,
      `sb-${IDENTITY_PROJECT_REF}-auth-token`,
      `sb-${IDENTITY_PROJECT_REF}-auth-token.1`,
      "unrelated",
    ];

    const pilotOnly = cookieNamesForSupabaseProject(names, PILOT_PROJECT_REF);
    expect(pilotOnly).toEqual([
      `sb-${PILOT_PROJECT_REF}-auth-token`,
      `sb-${PILOT_PROJECT_REF}-auth-token.0`,
    ]);
    expect(pilotOnly.some(name => name.includes(IDENTITY_PROJECT_REF))).toBe(
      false
    );

    const identityOnly = cookieNamesForSupabaseProject(
      names,
      IDENTITY_PROJECT_REF
    );
    expect(identityOnly).toEqual([
      `sb-${IDENTITY_PROJECT_REF}-auth-token`,
      `sb-${IDENTITY_PROJECT_REF}-auth-token.1`,
    ]);
    expect(identityOnly.some(name => name.includes(PILOT_PROJECT_REF))).toBe(
      false
    );
  });

  it("derives project ref from configured Supabase URL (not hardcoded clear-all)", () => {
    expect(
      extractSupabaseProjectRef(
        `https://${PILOT_PROJECT_REF}.supabase.co`
      )
    ).toBe(PILOT_PROJECT_REF);
    expect(
      extractSupabaseProjectRef(
        `https://${IDENTITY_PROJECT_REF}.supabase.co`
      )
    ).toBe(IDENTITY_PROJECT_REF);

    const source = readFileSync(
      resolve(process.cwd(), "lib/supabase/middleware.ts"),
      "utf8"
    );
    expect(source).toContain("clearSupabaseAuthCookiesForProject");
    expect(source).toContain("cookieNamesForSupabaseProject");
    expect(source).toContain("extractSupabaseProjectRef");
    expect(source).not.toContain(
      'name.includes("supabase") ||\n        name.includes("auth-token")'
    );
  });

  it("homepage remains marketing-only when server session is null", () => {
    const page = readFileSync(
      resolve(process.cwd(), "app/page.tsx"),
      "utf8"
    );
    expect(page).toContain("getSessionUser");
    expect(page).toContain("MarketingHomepage");
    expect(page).toContain("if (!user)");
    expect(page).toContain("HomeApp");
  });
});
