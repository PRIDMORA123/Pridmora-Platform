/**
 * Manager Experience Go-Live UX Pass — presentation/navigation only.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AURELIA_WORKING_DETAIL,
  AURELIA_WORKING_STAGES,
  AURELIA_WORKING_TITLE,
} from "@/components/identity/identity-processing-state";
import { COACHING_INTELLIGENCE_MODES } from "@/lib/coaching-intelligence/mode-config";
import { getModeLabel } from "@/lib/coaching-intelligence/mode";
import { parseReviewCapabilityKey } from "@/lib/development-evidence/authorised-observations";

const root = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("manager default view hierarchy", () => {
  it("separates Development, Intelligence and Evidence layers", () => {
    const person = read("components/person-intelligence-view.tsx");
    expect(person).toContain('useState<"development" | "intelligence">');
    expect(person).toContain("Development");
    expect(person).toContain("Intelligence");
    expect(person).toContain("Evidence");
    expect(person).toContain("includeRecognisedPatterns={false}");
    expect(person).toContain("onOpenIntelligence");
    expect(person).toContain("DevelopmentIntelligenceEvidencePanel");
    expect(person).toContain("DevelopmentProfilePage");
  });

  it("does not stack intelligence and manager story on the default layer", () => {
    const person = read("components/person-intelligence-view.tsx");
    expect(person).toMatch(
      /layer === "intelligence"[\s\S]*DevelopmentIntelligenceEvidencePanel/
    );
    expect(person).toMatch(
      /layer === "intelligence"[\s\S]*PatternsOverTimeSection/
    );
  });
});

describe("no duplicated Development Snapshot content", () => {
  it("snapshot presents What matters now without repeating Current direction", () => {
    const snapshot = read("components/development/development-snapshot.tsx");
    expect(snapshot).toContain("What matters now?");
    expect(snapshot).toContain("Recent progress");
    expect(snapshot).toContain("Current focus");
    expect(snapshot).not.toContain("Current direction");
    expect(snapshot).not.toContain("Development snapshot");
    expect(snapshot).toContain("visibleDevelopmentSnapshotStory");
    expect(snapshot).toContain("blockedInsights");
  });

  it("keeps snapshot builder data intact", () => {
    const builder = read("lib/development-snapshot.ts");
    expect(builder).toContain("currentDirection");
    expect(builder).toContain("currentFocus");
    expect(builder).toContain("progressSinceLabel");
  });
});

describe("progressive evidence disclosure", () => {
  it("manager story links Why this? then keeps evidence on demand", () => {
    const page = read("components/development/development-profile-page.tsx");
    expect(page).toContain("Why this?");
    expect(page).toContain("onOpenIntelligence");
    expect(page).toContain("Detailed development evidence");
    expect(page).toContain("View evidence");
    expect(page).toContain("visibleDevelopmentProfileSections");
    expect(page).toContain("blockedInsights");
  });

  it("intelligence layer keeps Why this? and supporting evidence disclosure", () => {
    const panel = read(
      "components/development-evidence/development-intelligence-evidence-panel.tsx"
    );
    expect(panel).toContain("Why Aurelia thinks this");
    expect(panel).toContain("Why this?");
    expect(panel).toContain("Supporting Evidence");
    expect(panel).toContain("EvidenceConfidencePanel");
    expect(panel).toContain("EvidenceWhyDrawer");
  });
});

describe("Aurelia processing state", () => {
  it("reuses IdentityProcessingState without fake percentages", () => {
    expect(AURELIA_WORKING_TITLE).toBe("Aurelia is working…");
    expect(AURELIA_WORKING_DETAIL).toBe(
      "Reviewing the available development information."
    );
    expect(AURELIA_WORKING_STAGES.reviewingEvidence).toBe("Reviewing evidence…");
    expect(AURELIA_WORKING_STAGES.lookingForPatterns).toBe(
      "Looking for recurring patterns…"
    );
    expect(AURELIA_WORKING_STAGES.preparingInsight).toBe(
      "Preparing the development insight…"
    );
    expect(AURELIA_WORKING_TITLE).not.toMatch(/%/);
    expect(AURELIA_WORKING_DETAIL).not.toMatch(/%/);
  });

  it("wires processing state into manager and evidence surfaces", () => {
    const person = read("components/person-intelligence-view.tsx");
    const panel = read(
      "components/development-evidence/development-intelligence-evidence-panel.tsx"
    );
    const evidence = read(
      "components/development-evidence/development-evidence-view.tsx"
    );
    const patterns = read("components/patterns/pattern-panels.tsx");
    expect(person).toContain("AURELIA_WORKING_TITLE");
    expect(panel).toContain("IdentityProcessingState");
    expect(evidence).toContain("IdentityProcessingState");
    expect(patterns).toContain("AURELIA_WORKING_STAGES.lookingForPatterns");
  });
});

describe("existing AI preference controls", () => {
  it("maps stored modes to Human-led / AI-light / AI-supported without new architecture", () => {
    expect(getModeLabel("manual")).toBe("Human-led");
    expect(getModeLabel("assisted")).toBe("AI-light");
    expect(getModeLabel("comprehensive")).toBe("AI-supported");
    expect(COACHING_INTELLIGENCE_MODES.manual.aiEnabled).toBe(false);
    expect(COACHING_INTELLIGENCE_MODES.assisted.aiEnabled).toBe(true);
    expect(COACHING_INTELLIGENCE_MODES.comprehensive.aiEnabled).toBe(true);
  });

  it("settings save still patches coachingIntelligenceMode and does not delete records", () => {
    const settings = read("components/settings-view.tsx");
    const route = read("app/api/profile/route.ts");
    expect(settings).toContain("coachingIntelligenceMode");
    expect(settings).toContain(
      "Changing this preference does not delete Development Intelligence or"
    );
    expect(route).toContain("coaching_intelligence_mode");
    expect(route).not.toContain("development_evidence");
    expect(route).not.toContain("delete()");
  });
});

describe("no-capability evidence acceptance and language", () => {
  it("leaves invalid capability unassigned and keeps user-facing copy", () => {
    expect(parseReviewCapabilityKey("not_a_real_capability")).toBeNull();
    const view = read(
      "components/development-evidence/development-evidence-view.tsx"
    );
    expect(view).toContain("No capability confidently identified");
    expect(view).toContain(
      "Aurelia could not identify a capability that this evidence clearly supports."
    );
    expect(view).not.toContain("catalogue capability");
    expect(view).not.toContain("capability key");
  });
});

describe("existing intelligence and evidence remain intact", () => {
  it("does not change confidence, catalogue or authorisation helpers", () => {
    const capabilities = read("lib/development-evidence/capabilities.ts");
    const confidence = read("lib/development-evidence/confidence.ts");
    const authorised = read(
      "lib/development-evidence/authorised-observations.ts"
    );
    expect(capabilities).toContain('key: "accountability"');
    expect(confidence).toContain("independentSourceCount");
    expect(authorised).toContain("authorisedCapabilityKeysFromObservations");
  });
});
