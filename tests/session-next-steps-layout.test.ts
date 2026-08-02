import { describe, expect, it } from "vitest";
import { splitSuggestedFocusItems } from "@/components/actions/session-next-steps";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("splitSuggestedFocusItems", () => {
  it("splits dash-separated suggested focus into list items", () => {
    const items = splitSuggestedFocusItems(
      "Explore what Sarah notices – Review how the reflective discussions went – Clarify what confidence means"
    );
    expect(items).toEqual([
      "Explore what Sarah notices",
      "Review how the reflective discussions went",
      "Clarify what confidence means",
    ]);
  });

  it("prefers newline lists when present", () => {
    expect(
      splitSuggestedFocusItems("First focus\nSecond focus\nThird focus")
    ).toEqual(["First focus", "Second focus", "Third focus"]);
  });

  it("returns a single item when no separators exist", () => {
    expect(splitSuggestedFocusItems("One clear focus for next time.")).toEqual([
      "One clear focus for next time.",
    ]);
  });
});

describe("session completion alignment composition", () => {
  it("uses one workspace container on journey stage pages", () => {
    const page = readFileSync(
      resolve("components/coaching-journey/journey-stage-page.tsx"),
      "utf8"
    );
    expect(page).toContain("identity-workspace-container");
  });

  it("keeps carry-forward content on the shared page spine", () => {
    const steps = readFileSync(
      resolve("components/actions/session-next-steps.tsx"),
      "utf8"
    );
    expect(steps).toContain("identity-page-flow");
    expect(steps).toContain("identity-session-surface");
    expect(steps).toContain("identity-session-completion-actions");
    expect(steps).toContain("session-next-steps__focus-list");
    expect(steps).toContain("embedded");
  });

  it("does not independently centre session-next-steps at 860px", () => {
    const css = readFileSync(resolve("app/session-workspace.css"), "utf8");
    expect(css).toMatch(
      /\.session-next-steps\s*\{[\s\S]*?width:\s*100%;[\s\S]*?margin-inline:\s*0;/
    );
    expect(css).not.toMatch(
      /\.session-next-steps\s*,[\s\S]*860px/
    );
  });

  it("keeps Prepare content on one shared spine without a nested 860px column", () => {
    const prepareView = readFileSync(
      resolve("components/prepare-session-view.tsx"),
      "utf8"
    );
    const workspace = readFileSync(
      resolve("components/coaching/premium-prepare-workspace.tsx"),
      "utf8"
    );
    const css = readFileSync(resolve("app/session-workspace.css"), "utf8");
    const designSystem = readFileSync(
      resolve("app/identity-design-system.css"),
      "utf8"
    );

    expect(prepareView).toMatch(
      /identity-prepare-(workspace|container)/
    );
    expect(workspace).not.toContain("session-brief-workspace");
    expect(css).toMatch(
      /\.prepare-page\s+\.premium-prepare-workspace[\s\S]*?width:\s*100%;[\s\S]*?margin-inline:\s*0;/
    );
    expect(designSystem).toContain(".identity-prepare-workspace");
    expect(designSystem).toContain(".identity-prepare-container");
    expect(designSystem).toContain(".preparation-approach");
    expect(designSystem).toContain(".preparation-brief");
  });
});
