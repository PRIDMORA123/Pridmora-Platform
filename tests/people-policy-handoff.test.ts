import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PEOPLE_POLICY_HANDOFF_PREPARATION_NOTICE,
  PEOPLE_POLICY_HANDOFF_PROMPT_GUIDANCE,
} from "@/lib/ai/people-policy-handoff";
import { MANAGER_AURELIA_CONVERSATION_ADDENDUM } from "@/lib/ai/manager-aurelia-conversation";
import { IDENTITY_SYSTEM_PROMPT } from "@/lib/ai/identity-system-prompt";
import { MANAGER_FRONT_DOOR_ACTIONS } from "@/components/identity/manager-command-centre";
import { MANAGER_HOME_PRIVACY_VISIBILITY_COPY } from "@/lib/organisations/manager-privacy-visibility-copy";
import { getManagerScenario } from "@/lib/manager-scenarios";

const root = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("FIX-4 positive People / HR / policy handoff", () => {
  it("1: ordinary management stays free of unnecessary HR handoff", () => {
    expect(PEOPLE_POLICY_HANDOFF_PROMPT_GUIDANCE).toMatch(
      /Ordinary management work does NOT need a People\/HR handoff/i
    );
    expect(PEOPLE_POLICY_HANDOFF_PROMPT_GUIDANCE).toMatch(
      /routine feedback/i
    );
    expect(PEOPLE_POLICY_HANDOFF_PROMPT_GUIDANCE).toMatch(
      /difficult conversation alone is not a reason/i
    );
    expect(getManagerScenario("giving-feedback")?.sensitivity).toBe("standard");
    expect(getManagerScenario("delegation")?.preparationGuidance).not.toMatch(
      /People\/HR support/i
    );
  });

  it("2–4: formal / policy / adjustment scenarios keep thinking support plus handoff", () => {
    expect(PEOPLE_POLICY_HANDOFF_PROMPT_GUIDANCE).toMatch(
      /Continue helping the Manager think and prepare/i
    );
    expect(PEOPLE_POLICY_HANDOFF_PROMPT_GUIDANCE).toMatch(
      /not refusing to help/i
    );
    expect(PEOPLE_POLICY_HANDOFF_PROMPT_GUIDANCE).toMatch(
      /formal performance\/capability or disciplinary/i
    );
    expect(PEOPLE_POLICY_HANDOFF_PROMPT_GUIDANCE).toMatch(
      /reasonable adjustments/i
    );
    expect(PEOPLE_POLICY_HANDOFF_PREPARATION_NOTICE).toMatch(
      /think through how you want to approach this/i
    );
    expect(PEOPLE_POLICY_HANDOFF_PREPARATION_NOTICE).toMatch(
      /not a substitute for organisational due process/i
    );
    expect(PEOPLE_POLICY_HANDOFF_PREPARATION_NOTICE).toMatch(
      /People\/HR or specialist support/i
    );
    expect(getManagerScenario("performance-concern")?.preparationGuidance).toMatch(
      /People\/HR/i
    );
    expect(getManagerScenario("return-to-work")?.preparationGuidance).toMatch(
      /People\/HR or specialist support/i
    );
  });

  it("5: safeguarding / serious safety stronger handling is preserved", () => {
    expect(IDENTITY_SYSTEM_PROMPT).toContain("Coaching Boundary Alert");
    expect(IDENTITY_SYSTEM_PROMPT).toContain("immediate danger");
    expect(IDENTITY_SYSTEM_PROMPT).toContain("safeguarding");
    expect(IDENTITY_SYSTEM_PROMPT).toMatch(
      /urgent emergency assistance should be sought/i
    );
    expect(PEOPLE_POLICY_HANDOFF_PROMPT_GUIDANCE).toMatch(
      /Preserve any stronger safeguarding/i
    );
  });

  it("6–8: Aurelia is not HR/legal authority; handoff is not repetitive; sector-neutral", () => {
    expect(MANAGER_AURELIA_CONVERSATION_ADDENDUM).toContain(
      "Ordinary management work does NOT need a People/HR handoff"
    );
    expect(MANAGER_AURELIA_CONVERSATION_ADDENDUM).toContain(
      "Never present yourself as HR, a legal adviser, or an employment decision-maker"
    );
    expect(PEOPLE_POLICY_HANDOFF_PROMPT_GUIDANCE).toMatch(
      /Never present yourself as HR, a legal adviser, or an employment decision-maker/i
    );
    expect(PEOPLE_POLICY_HANDOFF_PROMPT_GUIDANCE).toMatch(
      /at most once when it first becomes clearly relevant/i
    );
    expect(PEOPLE_POLICY_HANDOFF_PROMPT_GUIDANCE).toMatch(/sector-neutral/i);
    expect(PEOPLE_POLICY_HANDOFF_PROMPT_GUIDANCE).not.toMatch(
      /NHS HR|Freedom to Speak Up|clinical governance|Trust policy/i
    );
    expect(PEOPLE_POLICY_HANDOFF_PREPARATION_NOTICE).not.toMatch(
      /NHS|Trust policy|Freedom to Speak Up/i
    );
    expect(PEOPLE_POLICY_HANDOFF_PROMPT_GUIDANCE).not.toMatch(
      /Pridmora cannot help|Contact HR immediately|You must contact HR/i
    );
  });

  it("9–12: Preparation and Talk remain wired; FIX-1 and FIX-3 unchanged", () => {
    const prep = read("components/prepare/preparation-view.tsx");
    expect(prep).toContain("PEOPLE_POLICY_HANDOFF_PREPARATION_NOTICE");
    expect(prep).toContain("ManagerScenarioPicker");

    expect(MANAGER_FRONT_DOOR_ACTIONS[0].id).toBe("talk");
    expect(MANAGER_FRONT_DOOR_ACTIONS[0].emphasis).toBe("primary");
    expect(MANAGER_FRONT_DOOR_ACTIONS[1].title).toBe(
      "Prepare for a conversation"
    );
    expect(MANAGER_HOME_PRIVACY_VISIBILITY_COPY).toMatch(
      /does not receive readable Aurelia conversations/i
    );

    const mcc = read("components/identity/manager-command-centre.tsx");
    expect(mcc).toContain("manager-home-privacy");
    expect(mcc).toContain("manager-front-door__need--primary");
  });

  it("13–14: no intelligence or evidence/storage changes in this task", () => {
    expect(read("lib/ai/people-policy-handoff.ts")).not.toContain(
      "development_evidence"
    );
    expect(read("lib/ai/people-policy-handoff.ts")).not.toContain(
      "ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD"
    );
  });
});
