import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("Manager permanent delete visibility", () => {
  it("hides Permanently delete for Managers while keeping Archive", () => {
    const menu = read("components/client-actions-menu.tsx");
    expect(menu).toContain("allowPermanentDelete");
    expect(menu).toContain("Archive client");
    expect(menu).toContain("Permanently delete client");
    expect(menu).toMatch(
      /allowPermanentDelete\s*\?\s*\([\s\S]*Permanently delete client[\s\S]*\)\s*:\s*null/
    );

    const home = read("components/home-app.tsx");
    expect(home).toContain('allowPermanentDelete={organisationRole !== "manager"}');
    expect(home).toContain("onArchiveClient={() => archiveSelectedClient()}");

    const coachSpace = read("components/coach-space-view.tsx");
    expect(coachSpace).toContain("allowPermanentDelete={allowPermanentDelete}");
    expect(coachSpace).toContain("onArchive={onArchiveClient}");
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
    expect(menu).toContain("Archive client");
    expect(menu).toContain("Restore client");
    expect(menu).toContain("onArchive");
    expect(menu).toContain("onRestore");

    const home = read("components/home-app.tsx");
    expect(home).toContain("archiveSelectedClient");
    expect(home).toContain("restoreSelectedClient");
  });
});
