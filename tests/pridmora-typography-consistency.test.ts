import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("Pridmora Poppins loading", () => {
  it("self-hosts Poppins 400/500/600/700 via next/font on html", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toContain('from "next/font/google"');
    expect(layout).toContain('weight: ["400", "500", "600", "700"]');
    expect(layout).toContain('variable: "--font-poppins"');
    expect(layout).toContain("${poppins.variable} ${poppins.className}");
    expect(layout).not.toMatch(/<body className=\{poppins\.className\}>/);
  });
});

describe("canonical font-family token", () => {
  it("does not append a second family list after --font-poppins", () => {
    const tokens = read("app/identity-tokens.css");
    expect(tokens).toMatch(
      /--identity-font:\s*var\(\s*--font-poppins,/
    );
    expect(tokens).not.toMatch(
      /--identity-font:\s*var\(--font-poppins\)\s*,/
    );
    expect(tokens).toContain("--identity-font-display: var(--identity-font)");
  });

  it("html uses the token and body/headings inherit it", () => {
    const globals = read("app/globals.css");
    expect(globals).toMatch(/html\{[\s\S]*font-family:var\(--identity-font\)/);
    expect(globals).toMatch(/body\{[\s\S]*font-family:inherit/);
    expect(globals).toContain("h1,h2,h3,p{margin-top:0;font-family:inherit}");
    expect(globals).toContain(
      "font-weight:var(--identity-type-page-weight,700)"
    );
    expect(globals).not.toContain(
      "font-weight:var(--identity-type-page-weight,650)"
    );
  });
});

describe("manager Development surfaces inherit Poppins", () => {
  it("does not bypass next/font with a bare Poppins family", () => {
    const css = read("app/identity-design-system.css");
    expect(css).not.toMatch(/font-family:\s*Poppins\s*,/);
    expect(css).not.toMatch(
      /font-family:\s*var\(--font-poppins\)\s*,\s*Poppins/
    );
  });

  it("locks person, snapshot, conversation, intelligence and evidence UI to inherit", () => {
    const css = read("app/identity-design-system.css");
    const inheritBlock = css.slice(
      css.indexOf(".relationship-canvas,"),
      css.indexOf(".preparation-view__aurelia-intro")
    );
    for (const selector of [
      ".relationship-canvas",
      ".relationship-canvas-header",
      ".relationship-identity-bar",
      ".person-overview-summary",
      ".person-overview-current-development",
      ".development-snapshot",
      ".person-overview-intelligence-link",
      ".previous-conversations-gallery",
      ".previous-conversation-card",
      ".current-conversation-card",
      ".manager-dev-intel",
      ".evidence-record-card",
      ".person-development-subnav",
      ".evidence-trust-card",
    ]) {
      expect(inheritBlock).toContain(selector);
    }
    expect(inheritBlock).toContain("font-family: inherit");
  });

  it("uses loaded heading weights instead of 650 fallbacks", () => {
    const design = read("app/identity-design-system.css");
    const intelligence = read(
      "components/identity-intelligence/identity-intelligence.css"
    );
    expect(design).not.toMatch(/type-(?:page|display)-weight, 650/);
    expect(intelligence).not.toMatch(/type-(?:page|display)-weight, 650/);
    expect(design).toContain("font-weight: var(--identity-type-page-weight, 700)");
  });
});
