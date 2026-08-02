import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const designSystem = readFileSync(
  path.join(root, "app/identity-design-system.css"),
  "utf8"
);
const globals = readFileSync(path.join(root, "app/globals.css"), "utf8");

const VIEWPORTS = [
  { width: 1366, height: 768, label: "1366 × 768" },
  { width: 1440, height: 900, label: "1440 × 900" },
  { width: 1536, height: 864, label: "1536 × 864" },
  { width: 1920, height: 1080, label: "1920 × 1080" },
  { width: 1280, height: 720, label: "1280 × 720" },
  { width: 1024, height: 768, label: "1024 × 768" },
] as const;

function workspaceMaxForViewport(width: number): number {
  if (width >= 1700) return 1440;
  if (width >= 1280) return 1240;
  return width;
}

function contentAreaWidth(viewportWidth: number, sidebarWidth = 248): number {
  return Math.max(0, viewportWidth - sidebarWidth);
}

describe("workspace width regression rules", () => {
  it("removes the previous fixed 1480px / 1560px workspace caps", () => {
    expect(designSystem).not.toMatch(/width:\s*min\(100%,\s*1480px\)/);
    expect(designSystem).not.toMatch(/width:\s*min\(100%,\s*1560px\)/);
    expect(globals).not.toMatch(/width:\s*min\(100%,\s*1480px\)/);
    expect(globals).not.toMatch(/width:\s*min\(100%,\s*1560px\)/);
  });

  it("defines fluid workspace tokens and content-area framing", () => {
    expect(designSystem).toContain("--identity-sidebar-width: 248px");
    expect(designSystem).toContain("--identity-workspace-laptop-max: 1240px");
    expect(designSystem).toContain("--identity-workspace-max: 1440px");
    expect(designSystem).toContain(".identity-main-content");
    expect(designSystem).toContain("min-width: 0");
    expect(designSystem).toContain("overflow-wrap: anywhere");
  });

  it("lets journey pages grow with document scroll instead of clipping", () => {
    const pageShell = designSystem.slice(
      designSystem.indexOf(".identity-page-shell {"),
      designSystem.indexOf(".identity-main-content {")
    );
    expect(pageShell).toMatch(/min-height:\s*100vh/);
    expect(pageShell).not.toMatch(/(?<!min-)height:\s*100vh/);
    expect(pageShell).not.toMatch(/overflow(-x)?:\s*(hidden|clip)/);

    expect(globals).toMatch(/\.app-shell\{[^}]*min-height:100vh/);
    expect(globals).not.toMatch(/\.app-shell\{[^}]*overflow-x:hidden/);
    expect(globals).not.toMatch(
      /\.main,\.identity-main-content\{[^}]*overflow-x:clip/
    );
    expect(globals).not.toMatch(
      /\.main,\.identity-main-content\{[^}]*width:calc\(100vw/
    );
  });

  it("collapses the Preparation Brief to one column below 1480px", () => {
    expect(designSystem).toMatch(
      /@media \(min-width: 1480px\)[\s\S]*\.preparation-brief-grid\.has-support/
    );
    expect(designSystem).toMatch(
      /@media \(max-width: 1479px\)[\s\S]*\.preparation-brief-grid\s*\{[\s\S]*grid-template-columns:\s*1fr/
    );
  });

  it("collapses the client header before common laptop compression", () => {
    expect(designSystem).toMatch(
      /@media \(max-width: 1360px\)[\s\S]*\.client-identity-header--compact\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/
    );
  });

  it.each(VIEWPORTS)(
    "keeps the workspace within the content area at $label",
    ({ width }) => {
      const available = contentAreaWidth(width);
      const maxWorkspace = workspaceMaxForViewport(width);
      // max-width may exceed the content area; the used width is clamped by the parent.
      const used = Math.min(available, maxWorkspace);

      expect(used).toBeLessThanOrEqual(available);
      expect(used).toBeGreaterThan(0);
      expect(used).toBeLessThan(width);

      // Common laptops must receive the narrower workspace, not the large-display cap.
      if (width >= 1280 && width <= 1699) {
        expect(maxWorkspace).toBe(1240);
        expect(maxWorkspace).toBeLessThan(1440);
      }

      // Preparation Brief must be single-column on common laptop widths.
      if (width < 1480) {
        expect(used).toBeLessThan(1480);
      }
    }
  );

  it("does not force nowrap on client header or status panel content", () => {
    const headerBlock = designSystem.slice(
      designSystem.indexOf(".client-identity-header {"),
      designSystem.indexOf(".identity-journey-path")
    );
    const statusBlock = designSystem.slice(
      designSystem.indexOf(".preparation-status-panel {"),
      designSystem.indexOf(".preparation-workspace {")
    );
    expect(headerBlock).not.toMatch(/white-space:\s*nowrap/);
    expect(statusBlock).not.toMatch(/white-space:\s*nowrap/);
  });
});
