import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPersonSummary } from "@/lib/development-evidence/display-copy";
import { buildChangeDisplayItems } from "@/lib/development-updates/presentation";
import { calculateDevelopmentMomentum } from "@/lib/organisation-intelligence/momentum";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("UAT readiness polish", () => {
  it("builds person-centred Who is… copy with evidence-stage language", () => {
    const early = buildPersonSummary({
      name: "Maria Lopez",
      currentPosition:
        "Growing confidence leading former peers while setting clearer expectations.",
      strengths: ["Clarity", "Accountability"],
      priorities: ["Delegation"],
      completedConversationCount: 1,
    });
    expect(early).toMatch(/Current evidence suggests/);
    expect(early.toLowerCase()).not.toContain("management role");
    expect(early.toLowerCase()).not.toContain("team is beginning");
    expect(early.split(/\s+/).length).toBeLessThanOrEqual(120);

    const empty = buildPersonSummary({
      name: "Alex Morgan",
      completedConversationCount: 0,
    });
    expect(empty).toContain(
      "There isn’t enough development evidence yet to describe a pattern."
    );
    expect(empty.toLowerCase()).not.toContain("current evidence suggests");

    const established = buildPersonSummary({
      name: "Maria Lopez",
      currentPosition: "Consistent pattern of clearer accountability conversations.",
      completedConversationCount: 5,
    });
    expect(established).toMatch(/Across the development history/);
  });

  it("uses recommended update labels rather than coaching-first growth wording", () => {
    const items = buildChangeDisplayItems({
      currentFocus: { action: "replace", value: "Address performance earlier." },
      emergingThemes: {
        add: [{ value: "Authority perception", status: "emerging" }],
      },
      growthAreas: {
        add: [{ value: "Delegation under pressure", status: "emerging" }],
      },
    });
    const titles = items.map(item => item.title);
    expect(titles).toContain("Recommended development position");
    expect(titles).toContain("Recommended development focus");
    expect(titles).toContain("Development theme");
    expect(titles).not.toContain("Emerging theme");
    expect(titles).not.toContain("Growth area");
  });

  it("uses the Identity fixed-panel shell rather than a flex-child panel", () => {
    const css = read("app/identity-design-system.css");
    const drawer = read("components/development-evidence/evidence-why-drawer.tsx");
    const backdropStart = css.indexOf(".evidence-drawer-backdrop {");
    const backdropEnd = css.indexOf(".evidence-drawer-backdrop__dismiss {");
    const panelStart = css.indexOf("\n.evidence-drawer {");
    const panelEnd = css.indexOf(".evidence-drawer__header {");
    const backdropBlock = css.slice(backdropStart, backdropEnd);
    const panelBlock = css.slice(panelStart, panelEnd);

    expect(backdropBlock).toContain("pointer-events: none;");
    expect(backdropBlock).not.toContain("display: flex;");
    expect(backdropBlock).not.toContain("align-items: stretch;");
    expect(panelBlock).toContain("position: fixed;");
    expect(panelBlock).toContain("top: 0;");
    expect(panelBlock).toContain("right: 0;");
    expect(panelBlock).toContain("bottom: 0;");
    expect(panelBlock).toContain("pointer-events: auto;");
    expect(panelBlock).not.toContain("position: relative;");
    expect(css).toContain(".evidence-drawer__body {");
    expect(css).toContain("overflow-y: auto;");
    expect(css).toContain("overscroll-behavior: contain;");
    expect(drawer).toContain("createPortal");
    expect(drawer).toContain("evidence-drawer__close");
    expect(drawer).toContain("evidence-drawer__fade");
    expect(drawer).toContain("evidence-drawer__body");
  });

  it("syncs confirmed commitments into open actions after apply", () => {
    const sync = read("lib/development-updates/sync-commitment-actions.ts");
    const apply = read("app/api/development-updates/[updateId]/apply/route.ts");
    expect(sync).toContain("syncCommitmentActionsAfterApply");
    expect(sync).toContain('status: "Open"');
    expect(apply).toContain("syncCommitmentActionsAfterApply");
  });

  it("keeps momentum calculation deterministic and comparable", () => {
    const result = calculateDevelopmentMomentum({
      completedConversations: 20,
      completedActions: 12,
      completedReflections: 8,
      developmentUpdates: 10,
      evidenceItems: 24,
      previousCompletedConversations: 14,
      previousCompletedActions: 8,
      previousCompletedReflections: 5,
      previousDevelopmentUpdates: 6,
      previousEvidenceItems: 16,
      hasEarlierPeriodActivity: true,
    });
    expect(result.value).toBeGreaterThan(0);
    expect(result.previousValue).not.toBeNull();
    expect(result.comparisonAvailable).toBe(true);
    expect(result.components.conversations).toBeGreaterThan(0);
    expect(result.methodology.length).toBeGreaterThan(40);
  });

  it("keeps person-flow navigation and preparation empty-save handling in product surfaces", () => {
    const prepare = read("components/prepare-session-view.tsx");
    const form = read("components/prepare/preparation-form.tsx");
    const nav = read("components/identity/person-flow-nav.tsx");
    expect(nav).toContain("PersonFlowBreadcrumb");
    expect(prepare).toContain("PersonFlowBreadcrumb");
    expect(prepare).toContain("PersonFlowBackLink");
    expect(nav).toContain("Back to ${personName}");
    expect(form).toContain("No preparation changes to save.");
  });

  it("keeps Organisation Intelligence generation CTA and title", () => {
    const page = read("app/organisation/intelligence/page.tsx");
    expect(page).toContain('title="People Development Intelligence"');
    expect(page).toContain("Generate Executive Brief");
    expect(page).toContain("Refresh Intelligence");
    expect(page).toMatch(/developmental work with people/i);
  });

  it("authenticated platform root prefers the workspace over marketing", () => {
    const page = read("app/page.tsx");
    expect(page).toContain("getSessionUser");
    expect(page).toContain("MarketingHomepage");
    expect(page).toContain("HomeApp");
    expect(page).toMatch(/if\s*\(\s*!user\s*\)/);
  });

  it("public platform landing uses Development Snapshot and free trial copy", () => {
    const marketing = read("components/marketing-homepage.tsx");
    expect(marketing).toContain("Development snapshot");
    expect(marketing).toContain("Start your free trial");
    expect(marketing).toContain("Free trial");
    expect(marketing).toContain("14-day free trial. No credit card required.");
    expect(marketing).toContain(
      "Understand how your managers are developing."
    );
    expect(marketing).toContain("Conversations end. Understanding shouldn");
    expect(marketing).not.toContain("Coach-approved");
    expect(marketing).not.toContain("Start free");
    expect(marketing).not.toContain("Important insight should not disappear");
    expect(marketing).not.toContain("—");
    expect(marketing).not.toMatch(/GPT/i);
  });

  it("AI prompts retain confidential identity and evidence discipline language", () => {
    const system = read("lib/ai/identity-system-prompt.ts");
    const update = read("lib/ai/development-update-prompt.ts");
    expect(system).toMatch(/self-reported/i);
    expect(system).toMatch(/British English/i);
    expect(update).toMatch(/developmental significance/i);
    expect(update).toMatch(/UK English/i);
  });
});
