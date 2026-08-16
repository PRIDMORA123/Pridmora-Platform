import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MANAGER_FRONT_DOOR_ACTIONS,
} from "@/components/identity/manager-command-centre";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("Stage 2.1 Manager Front Door", () => {
  it("exposes the six agreed need-led actions", () => {
    expect(MANAGER_FRONT_DOOR_ACTIONS).toHaveLength(6);
    expect(MANAGER_FRONT_DOOR_ACTIONS.map(action => action.id)).toEqual([
      "talk",
      "prepare",
      "reflect",
      "my-development",
      "my-people",
      "add-evidence",
    ]);
    expect(MANAGER_FRONT_DOOR_ACTIONS.map(action => action.title)).toEqual([
      "Talk something through",
      "Prepare for something",
      "Reflect on something",
      "Work on my development",
      "Develop someone in my team",
      "Add my development evidence",
    ]);
  });

  it("renders the need-led front door for Managers only", () => {
    const today = read("components/today-view.tsx");
    const mcc = read("components/identity/manager-command-centre.tsx");
    expect(today).toContain('organisation?.professionalRole === "manager"');
    expect(today).toContain("<ManagerCommandCentre");
    expect(mcc).toContain("What would help you today?");
    // Managers skip coach empty/onboarding traps (including zero People).
    expect(today).toContain("!isManager &&");
    expect(today).toContain("showFirstUserOnboarding");
    expect(today).toContain("showPremiumEmptyHome");
    // Non-manager branch keeps the coach-style home header.
    expect(today).toContain("<PremiumWorkspaceHeader");
    const managerBranch = today.indexOf("if (isManager)");
    const coachHeader = today.indexOf("<PremiumWorkspaceHeader");
    expect(managerBranch).toBeGreaterThan(-1);
    expect(coachHeader).toBeGreaterThan(managerBranch);
  });

  it("routes each front-door action to an existing destination", () => {
    const mcc = read("components/identity/manager-command-centre.tsx");
    const today = read("components/today-view.tsx");
    const home = read("components/home-app.tsx");

    expect(mcc).toContain("onTalkThrough");
    expect(mcc).toContain("onPrepareSomething");
    expect(mcc).toContain("onReflect");
    expect(mcc).toContain("onOpenMyDevelopment");
    expect(mcc).toContain("onOpenPeople");
    expect(mcc).toContain("onAddEvidence");
    expect(mcc).toContain('data-front-door-action={action.id}');

    // Talk → dedicated Manager Aurelia shell (Stage 2.2.1).
    expect(today).toContain("onTalkThrough={() => onOpenManagerAurelia?.()}");
    expect(today).toContain("onOpenPeople={() => onViewPeople?.()}");
    expect(home).toContain(
      'onOpenManagerAurelia={() => navigate("manager-aurelia")}'
    );

    // Prepare → existing prepare flow when a person exists; zero-People guided on Home.
    expect(today).toContain("onPrepareSomething={openPrepareSomething}");
    expect(today).toContain("hasManagedPeople={clients.length > 0}");
    expect(today).toContain('item.actionKind === "prepare"');
    expect(today).toContain("onPrepare");
    expect(mcc).toContain("Person-specific preparation needs someone in My People");

    // Reflect / evidence → existing My Development self surfaces.
    expect(today).toContain(
      "onReflect={() => onOpenMyDevelopmentReflection?.()}"
    );
    expect(today).toContain(
      "onAddEvidence={() => onOpenMyDevelopmentEvidence?.()}"
    );
    expect(home).toContain(
      'void openSelfDevelopmentView("my-development-reflection")'
    );
    expect(home).toContain(
      'void openSelfDevelopmentView("my-development-evidence")'
    );

    // My Development → existing my-development view.
    expect(today).toContain(
      "onOpenMyDevelopment={() => onOpenMyDevelopment?.()}"
    );
    expect(home).toContain(
      'onOpenMyDevelopment={() => navigate("my-development")}'
    );
  });

  it("makes Add my development evidence a first-level Manager Home action to self upload", () => {
    const mcc = read("components/identity/manager-command-centre.tsx");
    const evidence = read(
      "components/development-evidence/development-evidence-view.tsx"
    );
    expect(mcc).toContain('id: "add-evidence"');
    expect(mcc).toContain("Add my development evidence");
    expect(mcc).toContain("your own development record");
    expect(mcc).toContain("onAddEvidence");
    expect(evidence).toContain("Add evidence");
    expect(evidence).toMatch(/upload|Upload/);
  });

  it("keeps existing Manager feature navigation in the app shell", () => {
    const shell = read("components/app-shell.tsx");
    expect(shell).toContain('label: "Home"');
    expect(shell).toContain("language.peopleNavLabel");
    expect(shell).toContain("language.myDevelopmentLabel");
    expect(shell).toContain('key: "my-development" as const');
    expect(shell).toContain("isManager");
    // Front door must not remove direct nav for returning Managers.
    expect(shell).not.toContain("manager-front-door");
  });

  it("does not give Organisation Lead / coach home the Manager front door by role", () => {
    const today = read("components/today-view.tsx");
    const orgNav = read(
      "components/organisation/organisation-navigation.tsx"
    );
    // Manager front door is gated on professionalRole manager only.
    expect(today).toMatch(
      /const isManager = organisation\?\.professionalRole === "manager"/
    );
    expect(today).toMatch(
      /if \(isManager\) \{[\s\S]*?<ManagerCommandCentre/
    );
    // Organisation console remains a separate membership-gated surface.
    expect(orgNav).toContain("/organisation");
    expect(orgNav).not.toContain("ManagerCommandCentre");
    expect(orgNav).not.toContain("What would help you today");
  });

  it("does not weaken organisation isolation or permission gates for Stage 2.1", () => {
    const mcc = read("components/identity/manager-command-centre.tsx");
    const today = read("components/today-view.tsx");
    const home = read("components/home-app.tsx");
    // Front door only composes existing navigators — no new API/auth surface.
    expect(mcc).toContain('/api/my-development/workspace');
    expect(mcc).not.toContain("requireOrganisationContext");
    expect(today).not.toContain("createClient");
    expect(home).toContain("/api/my-development/self-relationship");
    expect(home).toContain('navigate("my-development-evidence")');
  });

  it("handles missing Continue your development data gracefully", () => {
    const mcc = read("components/identity/manager-command-centre.tsx");
    expect(mcc).toContain("Continue your development");
    expect(mcc).toContain("View My Development");
    expect(mcc).toContain("hasContinueDetail");
    expect(mcc).toContain(
      "No development focus, actions or evidence to show yet"
    );
    expect(mcc).toContain("setWorkspace(null)");
    expect(mcc).toContain("continueLoaded");
  });

  it("does not add Practise or micro-learning as Manager Home options", () => {
    const mcc = read("components/identity/manager-command-centre.tsx");
    expect(mcc).not.toMatch(/Practise|Practice scenario|Micro-learning|Micro learning/i);
    expect(MANAGER_FRONT_DOOR_ACTIONS).toHaveLength(6);
  });

  it("surfaces Needs attention alongside the need-led question", () => {
    const mcc = read("components/identity/manager-command-centre.tsx");
    expect(mcc).toContain("Needs attention");
    expect(mcc).toContain("Who or what needs your attention?");
    expect(mcc).toContain("buildManagerHomeAttentionItems");
    expect(mcc).toContain("What would help you today?");
    const needsAttention = mcc.indexOf("Needs attention");
    const whatWouldHelp = mcc.indexOf("What would help you today?");
    const continuePanel = mcc.indexOf("Continue your development");
    expect(needsAttention).toBeGreaterThan(-1);
    expect(whatWouldHelp).toBeGreaterThan(-1);
    expect(continuePanel).toBeGreaterThan(whatWouldHelp);
  });
});
