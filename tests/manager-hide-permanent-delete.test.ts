import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

const permanentlyDeleteClientInDb = vi.hoisted(() => vi.fn());

describe("Manager permanent delete visibility", () => {
  it("hides Permanently delete for Managers while keeping Archive", () => {
    const menu = read("components/client-actions-menu.tsx");
    expect(menu).toContain("allowPermanentDelete");
    expect(menu).toContain("archivePersonLabel");
    expect(menu).toContain("deletePersonLabel");
    expect(menu).toContain("allowPermanentDelete={canPermanentlyDelete}");
    expect(menu).toMatch(
      /allowPermanentDelete\s*\?\s*\([\s\S]*labels\.deletePersonLabel[\s\S]*\)\s*:\s*null/
    );

    const home = read("components/home-app.tsx");
    expect(home).toContain('allowPermanentDelete={organisationRole !== "manager"}');
    expect(home).toContain("onArchiveClient={() => archiveSelectedClient()}");

    const coachSpace = read("components/coach-space-view.tsx");
    expect(coachSpace).toContain("allowPermanentDelete={allowPermanentDelete}");
    expect(coachSpace).toContain("onArchive={onArchiveClient}");

    // Product language still defines archive/delete labels (manager + coach).
    const language = read("lib/role-language.ts");
    expect(language).toContain('archivePersonLabel: "Archive team member"');
    expect(language).toContain('deletePersonLabel: "Permanently delete team member"');
    expect(language).toContain('archivePersonLabel: "Archive client"');
  });

  it("keeps non-manager permanent delete available by default", () => {
    const menu = read("components/client-actions-menu.tsx");
    expect(menu).toContain("allowPermanentDelete = true");
    expect(menu).toContain("DeleteClientDialog");

    const coachSpace = read("components/coach-space-view.tsx");
    expect(coachSpace).toContain("allowPermanentDelete = true");
    expect(coachSpace).toContain("onPermanentlyDeleteClient");

    // Database delete path remains for intentional coach/admin use.
    expect(read("app/api/clients/[clientId]/route.ts")).toContain(
      "permanentlyDeleteClientInDb"
    );
    expect(read("lib/supabase/repository.ts")).toContain(
      "permanentlyDeleteClientInDb"
    );
  });

  it("does not change archive/restore wiring", () => {
    const menu = read("components/client-actions-menu.tsx");
    expect(menu).toContain("archivePersonLabel");
    expect(menu).toContain("restorePersonLabel");
    expect(menu).toContain("onArchive");
    expect(menu).toContain("onRestore");

    const home = read("components/home-app.tsx");
    expect(home).toContain("archiveSelectedClient");
    expect(home).toContain("restoreSelectedClient");
  });

  it("API denies Manager permanent delete with 403 before DB delete", async () => {
    const route = read("app/api/clients/[clientId]/route.ts");
    expect(route).toContain('professionalRole === "manager"');
    expect(route).toContain("status: 403");
    expect(route).toContain("Managers cannot permanently delete");

    const managerCheckIdx = route.indexOf('professionalRole === "manager"');
    const denyMessageIdx = route.indexOf("Managers cannot permanently delete");
    const deleteCallIdx = route.lastIndexOf("permanentlyDeleteClientInDb(");
    expect(managerCheckIdx).toBeGreaterThan(-1);
    expect(denyMessageIdx).toBeGreaterThan(managerCheckIdx);
    expect(deleteCallIdx).toBeGreaterThan(denyMessageIdx);
  });
});

describe("Manager permanent delete API enforcement", () => {
  beforeEach(() => {
    vi.resetModules();
    permanentlyDeleteClientInDb.mockReset();
  });

  it("returns 403 for professionalRole manager and does not call delete", async () => {
    vi.doMock("@/lib/organisations/current-organisation", () => ({
      requireOrganisationContext: vi.fn().mockResolvedValue({
        ok: true,
        context: {
          supabase: {},
          coachId: "coach-1",
          user: { id: "coach-1" },
          organisation: {
            organisationId: "org-bsh",
            professionalRole: "manager",
            role: "practitioner",
          },
        },
      }),
      requireAssignedClientAccess: vi.fn(),
    }));
    vi.doMock("@/lib/supabase/repository", () => ({
      permanentlyDeleteClientInDb,
      updateClientProfileInDb: vi.fn(),
    }));
    vi.doMock("@/lib/supabase/errors", () => ({
      toUserFriendlySupabaseError: (error: unknown) =>
        error instanceof Error ? error.message : "error",
    }));

    const { DELETE } = await import("@/app/api/clients/[clientId]/route");
    const response = await DELETE(
      new Request("http://localhost/api/clients/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({
          clientId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        }),
      }
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toMatch(/cannot permanently delete/i);
    expect(permanentlyDeleteClientInDb).not.toHaveBeenCalled();
  });

  it("allows non-manager delete path to continue to ownership checks", async () => {
    const requireAssignedClientAccess = vi.fn().mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Resource not found." }, { status: 404 }),
    });
    vi.doMock("@/lib/organisations/current-organisation", () => ({
      requireOrganisationContext: vi.fn().mockResolvedValue({
        ok: true,
        context: {
          supabase: {},
          coachId: "coach-1",
          user: { id: "coach-1" },
          organisation: {
            organisationId: "org-bsh",
            professionalRole: "coach",
            role: "owner",
          },
        },
      }),
      requireAssignedClientAccess,
    }));
    vi.doMock("@/lib/supabase/repository", () => ({
      permanentlyDeleteClientInDb,
      updateClientProfileInDb: vi.fn(),
    }));
    vi.doMock("@/lib/supabase/errors", () => ({
      toUserFriendlySupabaseError: (error: unknown) =>
        error instanceof Error ? error.message : "error",
    }));

    const { DELETE } = await import("@/app/api/clients/[clientId]/route");
    const response = await DELETE(
      new Request("http://localhost/api/clients/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({
          clientId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        }),
      }
    );

    expect(response.status).toBe(404);
    expect(requireAssignedClientAccess).toHaveBeenCalled();
    expect(permanentlyDeleteClientInDb).not.toHaveBeenCalled();
  });
});
