import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("Manager My Development routing", () => {
  it("routes Manager sidebar My Development to my-development, not global-intelligence", () => {
    const shell = read("components/app-shell.tsx");
    expect(shell).toContain('key: "my-development" as const');
    expect(shell).toContain("language.myDevelopmentLabel");
    expect(shell).toContain("isManager");
    // Manager branch must not label global-intelligence as My Development.
    expect(shell).not.toMatch(
      /isManager\s*\?\s*\[\s*\{[^}]*key:\s*"global-intelligence"/
    );
    expect(shell).toMatch(
      /isManager\s*\?[\s\S]*?key:\s*"my-development"[\s\S]*?:\s*\[[\s\S]*?key:\s*"global-intelligence"/
    );
  });

  it("routes Command Centre My Development to my-development", () => {
    const today = read("components/today-view.tsx");
    const home = read("components/home-app.tsx");
    const mcc = read("components/identity/manager-command-centre.tsx");

    expect(mcc).toContain("onOpenMyDevelopment");
    expect(mcc).toContain("View My Development");
    expect(mcc).toContain("Work on my development");
    expect(today).toContain("onOpenMyDevelopment={() => onOpenMyDevelopment?.()}");
    expect(today).not.toContain(
      "onOpenMyDevelopment={() => onOpenIntelligence?.()}"
    );
    expect(home).toContain(
      'onOpenMyDevelopment={() => navigate("my-development")}'
    );
  });

  it("renders MyDevelopmentView for my-development and keeps global-intelligence distinct", () => {
    const home = read("components/home-app.tsx");
    expect(home).toContain('view === "my-development"');
    expect(home).toContain("<MyDevelopmentView");
    expect(home).toContain('view === "global-intelligence"');
    expect(home).toContain("<GlobalIntelligenceView");

    const myDevIndex = home.indexOf('view === "my-development"');
    const myDevViewIndex = home.indexOf("<MyDevelopmentView");
    const globalIndex = home.indexOf('view === "global-intelligence"');
    const globalViewIndex = home.indexOf("<GlobalIntelligenceView");
    expect(myDevIndex).toBeGreaterThan(-1);
    expect(myDevViewIndex).toBeGreaterThan(myDevIndex);
    expect(globalIndex).toBeGreaterThan(-1);
    expect(globalViewIndex).toBeGreaterThan(globalIndex);

    const myDev = read("components/my-development-view.tsx");
    expect(myDev).toContain("separate from the people you manage");
    expect(myDev).not.toContain("Updates ready for review");

    const global = read("components/global-intelligence-view.tsx");
    expect(global).toContain("Updates ready for review");
    expect(global).toContain(
      "Separate from your own development record"
    );
  });

  it("does not open team Development Intelligence from Manager My Development entry points", () => {
    const today = read("components/today-view.tsx");
    const shell = read("components/app-shell.tsx");
    expect(today).not.toMatch(
      /ManagerCommandCentre[\s\S]*onOpenMyDevelopment=\{\(\) => onOpenIntelligence/
    );
    expect(shell).toContain("MY_DEVELOPMENT_NAV_VIEWS");
    expect(shell).toContain('"my-development"');
    expect(shell).not.toContain(
      'label: isManager ? language.myDevelopmentLabel : "Development"'
    );
  });
});
