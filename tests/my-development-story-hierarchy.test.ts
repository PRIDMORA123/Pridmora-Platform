import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  isActiveDevelopmentAction,
  listActiveDevelopmentActions,
  resolveMyDevelopmentNextStep,
} from "@/lib/my-development/next-step";
import type { CoachingAction } from "@/lib/types";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

function action(
  id: string,
  title: string,
  status: CoachingAction["status"]
): CoachingAction {
  return {
    id,
    title,
    status,
    clientId: "self-a",
    sessionId: null,
  };
}

describe("Stage 2.3.1 My Development story hierarchy", () => {
  it("uses the locked story hierarchy labels in overview order", () => {
    const view = read("components/my-development-view.tsx");
    const focus = view.indexOf("Your focus");
    const practising = view.indexOf("What you&apos;re practising");
    const learning = view.indexOf("What you&apos;re learning");
    const next = view.indexOf("Your next step");
    const noticing = view.indexOf("What {BRAND.companyName} is noticing");

    expect(focus).toBeGreaterThan(-1);
    expect(practising).toBeGreaterThan(focus);
    expect(learning).toBeGreaterThan(practising);
    expect(next).toBeGreaterThan(learning);
    expect(noticing).toBeGreaterThan(next);
  });

  it("removes the equal 2×2 capability dashboard from the landing page", () => {
    const view = read("components/my-development-view.tsx");
    expect(view).not.toContain('className="two-grid"');
    expect(view).not.toContain("Inputs to your picture");
    expect(view).not.toContain("Current development focus");
    expect(view).toContain("my-dev-story");
    expect(view).toContain("my-dev-story__flow");
  });

  it("keeps focus editable via existing focus API", () => {
    const view = read("components/my-development-view.tsx");
    expect(view).toContain("/api/my-development/focus");
    expect(view).toContain("Edit focus");
    expect(view).toContain("Set your development focus");
    expect(view).toContain("Save focus");
    expect(view).toContain("priorities");
  });

  it("prioritises active actions and does not let completed dominate", () => {
    const actions = [
      action("c1", "Done ask", "Complete"),
      action("o1", "Practise clearer ask", "Open"),
      action("c2", "Finished note", "Complete"),
      action("p1", "Try coaching question", "In progress"),
      action("o2", "Another open", "Open"),
      action("o3", "Third open", "Open"),
      action("o4", "Fourth open", "Open"),
    ];
    const active = listActiveDevelopmentActions(actions, 3);
    expect(active.map(item => item.id)).toEqual(["o1", "p1", "o2"]);
    expect(active.every(isActiveDevelopmentAction)).toBe(true);
    expect(active.some(item => item.status === "Complete")).toBe(false);

    const view = read("components/my-development-view.tsx");
    expect(view).toContain("listActiveDevelopmentActions");
    expect(view).toContain("completedActionCount");
    expect(view).toContain("completed");
    expect(view).toContain("show recent");
    // Stage 2.3.2.1 adds Mark complete; still no free-form status editing.
    expect(view).toContain("Mark complete");
    expect(view).not.toContain("<select");
  });

  it("shows latest reflection learning signal instead of count-only presentation", () => {
    const view = read("components/my-development-view.tsx");
    expect(view).toContain("latestReflection");
    expect(view).toContain("latestReflection.preview");
    expect(view).toContain("See reflections");
    expect(view).not.toMatch(
      /reflections\.length\} reflection[\s\S]{0,20}recorded/
    );
    expect(view).not.toContain("N reflections recorded");
  });

  it("keeps evidence and Development Intelligence secondary", () => {
    const view = read("components/my-development-view.tsx");
    expect(view).toContain("onOpenPersonalEvidence");
    expect(view).toContain("Explore Development Intelligence");
    expect(view).not.toContain("View development intelligence");
    expect(view).not.toContain("Add evidence");
    expect(view).not.toContain("STATUS_LABEL");
    expect(view).not.toContain("Confidence:");
    expect(view).not.toContain("included source");
    expect(view).not.toContain("evidence graph");
    expect(view).toContain("Evidence before certainty");
  });

  it("shows Evidence before certainty once without source-count teaser copy", () => {
    const view = read("components/my-development-view.tsx");
    const noticingStart = view.indexOf("my-dev-story__section--noticing");
    expect(noticingStart).toBeGreaterThan(-1);
    const noticingEnd = view.indexOf("Explore Development Intelligence", noticingStart);
    const noticing = view.slice(noticingStart, noticingEnd);
    const certaintyMatches = noticing.match(/Evidence before certainty/g) ?? [];
    expect(certaintyMatches).toHaveLength(1);
    expect(noticing).not.toContain("supportCopy");
    expect(noticing).not.toContain("Currently based on");
    expect(noticing).not.toContain("includedSourceCount");
    expect(noticing).not.toMatch(/\bsources\b/);
    expect(noticing).toContain(
      "Observations strengthen as your reflections and"
    );
    expect(view).toContain("Explore Development Intelligence");
    expect(view.indexOf("Your focus")).toBeLessThan(
      view.indexOf("What you&apos;re practising")
    );
  });

  it("removes Develop others / Team Intelligence from self landing", () => {
    const view = read("components/my-development-view.tsx");
    expect(view).not.toContain("Develop others");
    expect(view).not.toContain("Team Intelligence");
    expect(view).not.toContain("onOpenTeamIntelligence");
    expect(view).not.toContain("onOpenPeople");
    expect(view).not.toContain("Open personal workspace");

    const home = read("components/home-app.tsx");
    const myDevBlockStart = home.indexOf('view === "my-development" &&');
    const myDevBlockEnd = home.indexOf(
      'view === "my-development-reflection"',
      myDevBlockStart
    );
    const block = home.slice(myDevBlockStart, myDevBlockEnd);
    expect(block).toContain("<MyDevelopmentView");
    expect(block).not.toContain("onOpenTeamIntelligence");
    expect(block).not.toContain("onOpenPeople");
    // Team Intelligence route/view remains available; not linked from self landing.
    expect(home).toContain('view === "team-intelligence"');
    expect(home).toContain("TeamIntelligenceView");
  });

  it("empty state has one obvious starting point", () => {
    const view = read("components/my-development-view.tsx");
    expect(view).toContain("Set your development focus");
    expect(view).toContain("will help you turn that focus into");
    expect(view).toContain("practice and learning over time");
    expect(view).not.toContain("Start with any of these");
    expect(view).not.toContain("Get started");
    // Empty story hides practising/learning/next until not empty.
    expect(view).toContain("{!isEmpty ? (");
  });

  it("developed state remains bounded", () => {
    const view = read("components/my-development-view.tsx");
    expect(view).toContain("listActiveDevelopmentActions(workspace.actions, 3)");
    expect(view).toContain("secondaryFocuses");
    expect(view).toContain("intelligencePatterns[0]");
    expect(view).not.toContain(".slice(0, 5)");
  });

  it("resolves next step deterministically without AI", () => {
    expect(
      resolveMyDevelopmentNextStep({
        focusCount: 1,
        actions: [action("a1", "Practise ask", "Open")],
      }).kind
    ).toBe("action");

    expect(
      resolveMyDevelopmentNextStep({
        focusCount: 2,
        actions: [action("c1", "Done", "Complete")],
      })
    ).toEqual({ kind: "reflect-or-talk" });

    expect(
      resolveMyDevelopmentNextStep({
        focusCount: 0,
        actions: [],
      })
    ).toEqual({ kind: "set-focus" });

    const view = read("components/my-development-view.tsx");
    expect(view).toContain("resolveMyDevelopmentNextStep");
    expect(view).not.toContain("openai");
    expect(view).not.toContain("recommend");
    expect(read("lib/my-development/next-step.ts")).not.toContain("openai");
  });

  it("may route next-step talk-through to existing Aurelia without changing Aurelia", () => {
    const view = read("components/my-development-view.tsx");
    const home = read("components/home-app.tsx");
    expect(view).toContain("onTalkThrough");
    expect(view).toContain("Talk something through");
    expect(home).toContain('onTalkThrough={() => navigate("manager-aurelia")}');

    const aureliaView = read("components/aurelia/manager-aurelia-view.tsx");
    const aureliaCapture = read(
      "components/aurelia/manager-aurelia-capture.tsx"
    );
    expect(aureliaView).toContain("Take something forward");
    expect(aureliaCapture).toContain("Capture a reflection");
    expect(aureliaCapture).toContain("/api/my-development/aurelia/propose-capture");
  });

  it("does not invent progress measures or rename maturity as progress", () => {
    const view = read("components/my-development-view.tsx");
    expect(view).not.toContain("Your progress");
    expect(view).not.toContain("confidenceLabel");
    // includedSourceCount may gate noticing; must not surface as Manager copy.
    expect(view).not.toMatch(/Confidence:\s*\{/);
    expect(view).not.toContain("included source");
    expect(view).not.toContain("Currently based on");
  });

  it("creates no schema migration in Stage 2.3.1", () => {
    const migrations = readdirSync(join(root, "supabase/migrations"));
    expect(
      migrations.some(name => /2\.3\.1|story.?hierarchy|my.?development.?story/i.test(name))
    ).toBe(false);
  });

  it("keeps Person Prepare and organisation isolation contracts intact", () => {
    const prepare = read("components/prepare/preparation-ready-panel.tsx");
    expect(prepare).toContain("Preparation");
    const workspace = read("lib/my-development/workspace.ts");
    expect(workspace).toContain("assertSelfClientOrganisation");
    expect(workspace).toContain("ensureSelfDevelopmentRelationship");
    const repo = read("lib/supabase/repository.ts");
    expect(repo).toContain("must not appear in People");
  });
});
