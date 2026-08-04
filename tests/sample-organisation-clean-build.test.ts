import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listFiles(full));
    else out.push(relative(root, full).replaceAll("\\", "/"));
  }
  return out;
}

function committedFiles(): Set<string> {
  const output = execFileSync("git", ["ls-files"], {
    cwd: root,
    encoding: "utf8",
  });
  return new Set(
    output
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
  );
}

describe("sample organisation clean-build dependency contracts", () => {
  it("proves committed installer sources do not depend on Organisation Intelligence files", () => {
    const committed = committedFiles();
    const installerPaths = [
      ...listFiles(join(root, "lib/sample-organisations")),
      ...listFiles(join(root, "app/api/sample-organisations")),
      ...listFiles(join(root, "components/sample-organisation")),
    ].filter(path => committed.has(path) || path.endsWith(".ts") || path.endsWith(".tsx"));

    // Before commit, include working-tree installer files that will be committed.
    const scoped = installerPaths.filter(
      path =>
        path.startsWith("lib/sample-organisations/") ||
        path.startsWith("app/api/sample-organisations/") ||
        path.startsWith("components/sample-organisation/")
    );

    expect(scoped.length).toBeGreaterThan(5);

    const banned = [
      "@/lib/organisation-intelligence",
      "lib/organisation-intelligence/",
      "organisation-intelligence/generate",
    ];

    for (const path of scoped) {
      const source = readFileSync(join(root, path), "utf8");
      for (const token of banned) {
        expect(source, `${path} must not reference ${token}`).not.toContain(token);
      }
    }

    // Untracked Organisation Intelligence must remain outside the committed graph.
    expect(committed.has("lib/organisation-intelligence/generate.ts")).toBe(false);
  });

  it("keeps the installer intelligence bridge self-contained", () => {
    const bridge = readFileSync(
      join(root, "lib/sample-organisations/organisation-intelligence.ts"),
      "utf8"
    );
    expect(bridge).toContain("generateSampleOrganisationIntelligenceSnapshot");
    expect(bridge).toContain("not available in this release");
    expect(bridge).not.toContain("@/lib/organisation-intelligence");
  });
});
