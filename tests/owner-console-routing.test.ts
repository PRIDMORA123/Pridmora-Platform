import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizeNextPath } from "@/lib/auth/email-link";
import { isPlatformOwner, resolvePlatformOwner } from "@/lib/owner/auth";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("owner console routing contracts", () => {
  it("keeps /owner as a first-class App Router surface", () => {
    expect(read("app/owner/page.tsx")).toContain("Platform Overview");
    expect(read("app/owner/layout.tsx")).toContain("isPlatformOwner");
    expect(read("app/page.tsx")).toContain("HomeApp");
    expect(read("app/page.tsx")).not.toContain("/owner");
  });

  it("middleware does not rewrite or redirect /owner into the Manager workspace", () => {
    const middleware = read("middleware.ts");
    expect(middleware).toContain('pathname === "/"');
    expect(middleware).toContain('path !== "/"');
    expect(middleware).not.toMatch(/pathname.*\/owner.*redirect/i);
    expect(middleware).not.toMatch(/rewrite.*\/owner/i);
    expect(middleware).toContain("/owner and /organisation are intentionally NOT public");
    // Unauthenticated /owner must preserve next via buildSafeSignInNext (not force dashboard).
    expect(middleware).toContain("buildSafeSignInNext");
    expect(middleware).toContain(
      "buildSafeSignInNext(pathname, request.nextUrl.search)"
    );
  });

  it("owner layout never redirects authenticated users to Manager Command Centre", () => {
    const layout = read("app/owner/layout.tsx");
    expect(layout).toContain('redirect("/auth/sign-in?next=/owner")');
    expect(layout).toContain("Access denied");
    expect(layout).toContain("Never redirect managers to `/`");
    expect(layout).not.toMatch(/redirect\(\s*["']\/["']\s*\)/);
    expect(layout).not.toMatch(/redirect\(\s*["']\/\?view=dashboard["']\s*\)/);
    expect(layout).not.toContain("requireOrganisationContext");
    expect(layout).not.toContain("professionalRole");
    expect(layout).not.toContain("organisation_memberships");
  });

  it("root authenticated `/` reuses post-login destination (Lead/Owner leave Manager home)", () => {
    const home = read("app/page.tsx");
    expect(home).toContain("getSessionUser");
    expect(home).toContain("HomeApp");
    expect(home).toContain("resolveAuthoritativePostLoginDestination");
    expect(home).toContain("isHomeWorkspacePath");
    expect(home).toContain("requestedNext");
    // Destination paths live in the shared helper — not hard-coded on the page.
    expect(home).not.toContain('"/owner"');
    expect(home).not.toContain("'/owner'");
  });

  it("post-auth next path may remain /owner", () => {
    expect(sanitizeNextPath("/owner")).toBe("/owner");
    expect(sanitizeNextPath("/owner/organisations")).toBe("/owner/organisations");
    const signIn = read("components/auth/sign-in-form.tsx");
    expect(signIn).toContain('searchParams.get("next") || "/"');
    expect(signIn).toContain("resolveAuthoritativePostLoginDestination");
  });

  it("sign-in routes via shared authoritative post-login destination helper", () => {
    const signIn = read("components/auth/sign-in-form.tsx");
    expect(signIn).toContain('from "@/lib/auth/post-login-destination"');
    expect(signIn).toContain("resolveAuthoritativePostLoginDestination");
    expect(signIn).toContain("window.location.assign(destination)");
    // Role queries live in the shared helper — not inlined in the form.
    expect(signIn).not.toContain('from("platform_owners")');
    expect(signIn).not.toContain('rpc("is_platform_owner"');
    const helper = read("lib/auth/post-login-destination.ts");
    expect(helper).toContain('OWNER_CONSOLE_PATH = "/owner"');
    expect(helper).toContain("isPlatformOwner");
  });
});

describe("platform_owner with simultaneous Manager membership", () => {
  it("isPlatformOwner does not inspect organisation membership or professionalRole", () => {
    const auth = read("lib/owner/platform-owner.ts");
    expect(auth).toContain("Organisation Manager membership is never consulted");
    expect(auth).toContain("is_platform_owner");
    expect(auth).toContain("platform_owners");
    expect(auth).not.toContain("organisation_memberships");
    expect(auth).not.toContain("professionalRole");
    expect(auth).not.toContain("requireOrganisationContext");
    expect(auth).not.toContain("hasPermission");
    // Server auth module reuses the shared helper — no duplicated query logic.
    expect(read("lib/owner/auth.ts")).toContain(
      'from "@/lib/owner/platform-owner"'
    );
  });

  function mockSupabase(input: {
    rpcData?: boolean | null;
    rpcError?: { message: string } | null;
    row?: { id: string; user_id: string; status: string } | null;
  }) {
    const rowResult = {
      data: input.row ?? null,
      error: null,
    };
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => rowResult),
    };
    return {
      rpc: vi.fn(async () => ({
        data: input.rpcData ?? null,
        error: input.rpcError ?? null,
      })),
      from: vi.fn((table: string) => {
        expect(table).toBe("platform_owners");
        return query;
      }),
    };
  }

  it("resolves platform owner when RPC affirms ownership even if the user is also a manager elsewhere", async () => {
    const userId = "01aa1f21-574d-4f17-97d9-1d2ad79f8188";
    const supabase = mockSupabase({
      rpcData: true,
      row: { id: "po-row-1", user_id: userId, status: "active" },
    });

    // Dual identity: Manager in org world, but auth only asks platform_owners.
    const managerAndOwner = await resolvePlatformOwner(supabase as never, userId);
    expect(managerAndOwner).toEqual({ id: "po-row-1", userId });
    expect(await isPlatformOwner(supabase as never, userId)).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith("platform_owners");
  });

  it("denies Owner Console when platform_owners is inactive even if Manager membership exists", async () => {
    const supabase = mockSupabase({
      rpcData: false,
      row: null,
    });

    expect(await isPlatformOwner(supabase as never, "manager-only-user")).toBe(
      false
    );
    expect(supabase.from).toHaveBeenCalledWith("platform_owners");
  });

  it("falls back to platform_owners row when RPC is unavailable", async () => {
    const userId = "01aa1f21-574d-4f17-97d9-1d2ad79f8188";
    const supabase = mockSupabase({
      rpcData: null,
      rpcError: { message: "Could not find the function" },
      row: { id: "po-fallback", user_id: userId, status: "active" },
    });

    const owner = await resolvePlatformOwner(supabase as never, userId);
    expect(owner).toEqual({ id: "po-fallback", userId });
  });
});
