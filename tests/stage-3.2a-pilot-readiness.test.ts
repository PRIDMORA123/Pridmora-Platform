import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MANAGER_AURELIA_CAPTURE_UNAVAILABLE,
  MANAGER_AURELIA_CHAT_UNAVAILABLE,
  toManagerAureliaUserError,
} from "@/lib/ai/manager-aurelia-user-errors";
import { MANAGER_FRONT_DOOR_ACTIONS } from "@/components/identity/manager-command-centre";
import {
  LEAD_OVERVIEW_LENS_NOTE,
  LEAD_PRIVACY_BOUNDARY_COPY,
} from "@/lib/manager-development-intelligence/ui-copy";

const root = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("Stage 3.2A Customer #1 minimum pilot readiness corrections", () => {
  it("gives Managers a coherent Home with zero People", () => {
    const today = read("components/today-view.tsx");
    expect(today).toContain("!isManager &&");
    expect(today).toContain("showFirstUserOnboarding");
    expect(today).toContain("showPremiumEmptyHome");
    expect(today).toContain("hasManagedPeople={clients.length > 0}");
    expect(today).toContain("<ManagerCommandCentre");
    // Must not auto-create managed people for Managers.
    expect(today).not.toMatch(
      /if \(isManager\)[\s\S]{0,400}onCreateClientForOnboarding\?\.\(/
    );
  });

  it("keeps Talk / My Development / Evidence accessible from the front door", () => {
    const today = read("components/today-view.tsx");
    const mcc = read("components/identity/manager-command-centre.tsx");
    expect(today).toContain("onTalkThrough={() => onOpenManagerAurelia?.()}");
    expect(today).toContain("onOpenMyDevelopment={() => onOpenMyDevelopment?.()}");
    expect(today).toContain(
      "onAddEvidence={() => onOpenMyDevelopmentEvidence?.()}"
    );
    expect(mcc).toContain('id: "talk"');
    expect(mcc).toContain('id: "my-development"');
    expect(mcc).toContain('id: "add-evidence"');
  });

  it("handles Prepare with zero People without an unexplained dead end", () => {
    const mcc = read("components/identity/manager-command-centre.tsx");
    expect(mcc).toContain("showPrepareNeedsPerson");
    expect(mcc).toContain(
      "Person-specific preparation needs someone in My People"
    );
    expect(mcc).toMatch(/nothing is\s+created automatically/i);
    expect(mcc).toContain("Talk something through");
    expect(mcc).toContain("Open My Development");
    expect(mcc).toContain("Go to My People");
  });

  it("removes Manager-facing coaching-client language from corrected surfaces", () => {
    const mcc = read("components/identity/manager-command-centre.tsx");
    const combined = mcc.toLowerCase();
    expect(combined).not.toContain("coaching support");
    expect(combined).not.toContain("coaching client");
    expect(combined).not.toContain("coaching relationship");
    expect(combined).not.toContain("identity vault");
    expect(combined).not.toContain("evidence in portfolio");
    expect(MANAGER_FRONT_DOOR_ACTIONS[0].description).toMatch(/Aurelia/i);
  });

  it("helps Leads distinguish People Development from Manager Development", () => {
    const nav = read("components/organisation/organisation-navigation.tsx");
    const oi = read("app/organisation/intelligence/page.tsx");
    const mdi = read(
      "components/organisation/manager-development-intelligence-view.tsx"
    );
    expect(nav).toContain("People Development");
    expect(nav).toContain("Manager Development");
    expect(oi).toContain("People Development Intelligence");
    expect(oi).toContain("/organisation/manager-development");
    expect(mdi).toContain("LEAD_OVERVIEW_LENS_NOTE");
    expect(LEAD_OVERVIEW_LENS_NOTE).toMatch(/separate lens/i);
    expect(LEAD_PRIVACY_BOUNDARY_COPY).toMatch(/remain private/i);
  });

  it("keeps Aurelia failure copy safe and non-technical", () => {
    const chat = read("app/api/my-development/aurelia/chat/route.ts");
    const propose = read(
      "app/api/my-development/aurelia/propose-capture/route.ts"
    );
    const view = read("components/aurelia/manager-aurelia-view.tsx");
    expect(chat).not.toContain("OpenAI API key is not configured");
    expect(propose).not.toContain("OpenAI API key is not configured");
    expect(chat).toContain(MANAGER_AURELIA_CHAT_UNAVAILABLE);
    expect(view).toContain("toManagerAureliaUserError");
    expect(
      toManagerAureliaUserError(new Error("OpenAI API key is not configured."))
    ).toBe(MANAGER_AURELIA_CHAT_UNAVAILABLE);
    expect(
      toManagerAureliaUserError(new Error("ECONNRESET from upstream"))
    ).toBe(MANAGER_AURELIA_CHAT_UNAVAILABLE);
    expect(MANAGER_AURELIA_CHAT_UNAVAILABLE).toMatch(/hasn't been saved/i);
    expect(MANAGER_AURELIA_CAPTURE_UNAVAILABLE).toMatch(/Nothing has been saved/i);
  });

  it("does not change Aurelia non-persistence architecture", () => {
    const view = read("components/aurelia/manager-aurelia-view.tsx");
    expect(view).toContain("Conversation state is React memory only");
    expect(view).toMatch(/conversation itself is not saved/i);
    expect(view).not.toContain("localStorage.setItem");
    expect(view).not.toContain("indexedDB");
  });

  it("leaves Owner Console and Person Prepare architecture intact", () => {
    expect(existsSync(join(root, "docs/CUSTOMER-1-PILOT-SETUP.md"))).toBe(true);
    const runbook = read("docs/CUSTOMER-1-PILOT-SETUP.md");
    expect(runbook).toMatch(/Do \*\*not\*\* run blanket/);
    expect(runbook).toContain("professional_role");
    expect(runbook).not.toMatch(/sk-[a-zA-Z0-9]{10,}/);
    expect(runbook).not.toContain("eyJ");

    const prepare = read("components/prepare/preparation-ready-panel.tsx");
    expect(prepare).toContain("Prepare");
    const owner = read("lib/owner/repository.ts");
    expect(owner).not.toContain("manager-command-centre");
    expect(owner).not.toContain("MANAGER_AURELIA_CHAT_UNAVAILABLE");
  });
});
