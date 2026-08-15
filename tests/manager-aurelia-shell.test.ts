import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("Stage 2.2.1 Manager Aurelia conversation shell", () => {
  it("routes Talk something through to manager-aurelia", () => {
    const today = read("components/today-view.tsx");
    const home = read("components/home-app.tsx");
    const shell = read("components/app-shell.tsx");

    expect(shell).toContain('| "manager-aurelia"');
    expect(today).toContain("onOpenManagerAurelia");
    expect(today).toContain("onTalkThrough={() => onOpenManagerAurelia?.()}");
    expect(today).not.toContain("onTalkThrough={() => onViewPeople?.()}");
    expect(home).toContain('onOpenManagerAurelia={() => navigate("manager-aurelia")}');
    expect(home).toContain('view === "manager-aurelia"');
    expect(home).toContain("<ManagerAureliaView");
  });

  it("keeps the other five Manager front-door actions unchanged", () => {
    const today = read("components/today-view.tsx");
    expect(today).toContain("onPrepareSomething={openPrepareSomething}");
    expect(today).toContain(
      "onReflect={() => onOpenMyDevelopmentReflection?.()}"
    );
    expect(today).toContain(
      "onOpenMyDevelopment={() => onOpenMyDevelopment?.()}"
    );
    expect(today).toContain("onOpenPeople={() => onViewPeople?.()}");
    expect(today).toContain(
      "onAddEvidence={() => onOpenMyDevelopmentEvidence?.()}"
    );
  });

  it("gates Manager Aurelia view to professionalRole manager", () => {
    const home = read("components/home-app.tsx");
    expect(home).toMatch(
      /view === "manager-aurelia"[\s\S]*?organisationRole === "manager"/
    );
    expect(home).toContain('view === "manager-aurelia"');
    expect(home).toContain('organisationRole !== "manager"');
  });

  it("renders conversational shell with privacy notice and deliberate capture entry", () => {
    const view = read("components/aurelia/manager-aurelia-view.tsx");
    expect(view).toContain("Talk something through");
    expect(view).toContain("What’s on your mind?");
    expect(view).toContain("private working session");
    expect(view).toMatch(/It is\s+not saved/);
    expect(view).toContain(
      "can use your current development focus and actions"
    );
    expect(view).toContain("Take something forward");
    expect(view).toContain("New conversation");
    expect(view).toContain("Back to Home");
    expect(view).toContain('data-testid="manager-aurelia-take-forward"');
    expect(view).toContain("ManagerAureliaCapturePanel");
    expect(view).not.toContain("localStorage");
    expect(view).not.toContain("sessionStorage");
  });

  it("does not redesign person Prepare with Aurelia", () => {
    const canvas = read(
      "components/relationship-workspace/relationship-canvas.tsx"
    );
    const home = read("components/home-app.tsx");
    expect(canvas).toContain("onPrepareConversation");
    expect(canvas).toContain("buildPersonNextConversationModel");
    expect(home).toContain("PrepareSessionView");
    expect(home).toContain("void prepare(client)");
  });

  it("keeps existing Manager navigation available in the app shell", () => {
    const shell = read("components/app-shell.tsx");
    expect(shell).toContain('label: "Home"');
    expect(shell).toContain("language.peopleNavLabel");
    expect(shell).toContain("language.myDevelopmentLabel");
    expect(shell).not.toContain('label: "Aurelia"');
  });
});
