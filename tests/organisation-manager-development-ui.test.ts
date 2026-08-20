import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  canReadOrganisationIntelligence,
  hasPermission,
} from "@/lib/organisations/permissions";
import {
  LEAD_MANAGER_DI_INTERPRETATION_COPY,
  LEAD_PRIVACY_BOUNDARY_COPY,
  STRENGTH_EXPLANATIONS,
  strengthDisplayLabel,
  themeDescriptionForKey,
} from "@/lib/manager-development-intelligence/ui-copy";
import { MANAGER_DEVELOPMENT_PRIVACY_THRESHOLD } from "@/lib/manager-development-intelligence";

const root = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("Stage 3.2 Organisation Lead Manager Development UI", () => {
  it("adds a dedicated Manager Development destination in organisation navigation", () => {
    const nav = read("components/organisation/organisation-navigation.tsx");
    expect(nav).toContain('/organisation/manager-development');
    expect(nav).toContain("Manager Development");
    expect(nav).toContain('/organisation/intelligence');
    expect(nav).toContain("People Development");
    expect(nav).toContain("Members");
  });

  it("keeps Manager Development separate from relationship Intelligence", () => {
    expect(
      existsSync(join(root, "app/organisation/manager-development/page.tsx"))
    ).toBe(true);
    expect(
      existsSync(join(root, "app/organisation/intelligence/page.tsx"))
    ).toBe(true);
    const page = read("app/organisation/manager-development/page.tsx");
    expect(page).toContain("/api/organisations/manager-development-intelligence");
    expect(page).not.toContain("aggregate_organisation_intelligence_sources");
    expect(page).not.toContain("/api/organisations/intelligence");
    expect(page).not.toContain("my-development");
  });

  it("Overview acts as Lead front door for Manager Development Intelligence", () => {
    const overview = read("app/organisation/page.tsx");
    expect(overview).toContain("ManagerDevelopmentIntelligenceView");
    expect(overview).toContain('variant="overview"');
    expect(overview).toContain("/api/organisations/manager-development-intelligence");
    expect(overview).toContain("Operational overview");
    expect(overview).not.toContain("/api/my-development/");
    expect(overview).not.toContain("aurelia");
  });

  it("renders low-data and patterns-available states from Lead-safe fields only", () => {
    const view = read(
      "components/organisation/manager-development-intelligence-view.tsx"
    );
    expect(view).toContain('data.status === "patterns_available"');
    expect(view).toContain("readiness.sufficientManagerPopulation");
    expect(view).toContain("themeLabel");
    expect(view).toContain("strength");
    expect(view).toContain("nextStep");
    expect(view).toContain("LEAD_PRIVACY_BOUNDARY_COPY");
    expect(view).not.toContain("contributorCount");
    expect(view).not.toContain("sourceCount");
    expect(view).not.toContain("percentage");
    expect(view).not.toContain("managerUserId");
    expect(view).not.toContain("href={`/organisation/members");
    expect(view).not.toContain("drill");
    expect(view).not.toContain("fetch(");
  });

  it("uses qualitative strength labels without numeric scores", () => {
    expect(strengthDisplayLabel("emerging")).toBe("Emerging");
    expect(strengthDisplayLabel("developing")).toBe("Developing");
    expect(STRENGTH_EXPLANATIONS.emerging).toMatch(
      /privacy-safe shared development theme/i
    );
    expect(STRENGTH_EXPLANATIONS.emerging).toMatch(/development signals/i);
    expect(STRENGTH_EXPLANATIONS.developing).toMatch(/more than one type/i);
    expect(MANAGER_DEVELOPMENT_PRIVACY_THRESHOLD).toBe(5);
  });

  it("does not invent AI recommendations in the UI", () => {
    const page = read("app/organisation/manager-development/page.tsx");
    const view = read(
      "components/organisation/manager-development-intelligence-view.tsx"
    );
    expect(page + view).not.toContain("openai");
    expect(page + view).not.toContain("generateRecommendation");
    expect(view).toContain("nextStep.title");
    expect(view).toContain("nextStep.suggestion");
  });

  it("keeps Members admin separate from pattern intelligence", () => {
    const members = read("app/organisation/members/page.tsx");
    const view = read(
      "components/organisation/manager-development-intelligence-view.tsx"
    );
    expect(members).not.toContain("manager-development-intelligence");
    expect(view).not.toContain("/organisation/members?");
    expect(view).not.toContain("filterManagers");
  });

  it("authorised roles can read intelligence; Manager role alone cannot", () => {
    expect(canReadOrganisationIntelligence("oversight")).toBe(true);
    expect(canReadOrganisationIntelligence("administrator")).toBe(true);
    expect(canReadOrganisationIntelligence("owner")).toBe(true);
    expect(canReadOrganisationIntelligence("practitioner")).toBe(false);
    expect(hasPermission("practitioner", "intelligence.organisation.read")).toBe(
      false
    );
  });

  it("does not require a migration for Stage 3.2 UI", () => {
    const files = [
      "app/organisation/manager-development/page.tsx",
      "app/organisation/page.tsx",
      "components/organisation/manager-development-intelligence-view.tsx",
      "components/organisation/organisation-navigation.tsx",
    ];
    for (const file of files) {
      expect(read(file)).not.toContain("create migration");
      expect(read(file)).not.toContain("db push");
    }
  });

  it("keeps Owner Console and Manager journey free of Lead UI wiring", () => {
    const owner = read("lib/owner/repository.ts");
    const myDev = read("components/my-development-view.tsx");
    expect(owner).not.toContain("manager-development-intelligence-view");
    expect(myDev).not.toContain("/organisation/manager-development");
    expect(myDev).not.toContain("LEAD_PRIVACY_BOUNDARY_COPY");
  });

  it("avoids surveillance / ranking framing in Lead UI copy", () => {
    const view = read(
      "components/organisation/manager-development-intelligence-view.tsx"
    );
    const copy = read("lib/manager-development-intelligence/ui-copy.ts");
    const combined = `${view}\n${copy}`.toLowerCase();
    for (const banned of [
      "manager score",
      "underperforming",
      "engagement rate",
      "activity score",
      "league table",
      "at risk",
      "compliance",
    ]) {
      expect(combined).not.toContain(banned);
    }
    // Negated framing is allowed (e.g. "not … rankings or performance scores").
    expect(combined).toMatch(/not individual[\s\S]*performance scores/);
    expect(LEAD_PRIVACY_BOUNDARY_COPY).toMatch(/remain private/i);
  });

  it("Stage 5 L1: theme cards describe a shared privacy-safe theme, not observed behaviour", () => {
    const themeKeys = [
      "delegation",
      "feedback",
      "difficult_conversations",
      "accountability",
      "psychological_safety",
      "presence",
      "collaboration",
      "confidence",
      "role_transition",
      "boundaries",
    ];
    for (const themeKey of themeKeys) {
      const description = themeDescriptionForKey(themeKey);
      expect(description).toBeTruthy();
      expect(description).toMatch(/shared development theme around/i);
      expect(description).toMatch(/passed the privacy threshold/i);
      expect(description).not.toMatch(/managers are showing/i);
      expect(description).not.toMatch(/showing a recurring/i);
    }

    const copySource = read("lib/manager-development-intelligence/ui-copy.ts");
    expect(copySource).not.toMatch(/Managers are showing/i);

    const buyerFacing = [
      LEAD_MANAGER_DI_INTERPRETATION_COPY,
      STRENGTH_EXPLANATIONS.emerging,
      STRENGTH_EXPLANATIONS.developing,
      ...themeKeys.map(key => themeDescriptionForKey(key) ?? ""),
    ].join("\n");
    expect(buyerFacing).not.toMatch(/themeKey|modality|capability key/i);
  });

  it("Stage 5 L1: interpretation names focus and/or authorised evidence, not evidence alone", () => {
    expect(LEAD_MANAGER_DI_INTERPRETATION_COPY).toMatch(/development focus/i);
    expect(LEAD_MANAGER_DI_INTERPRETATION_COPY).toMatch(
      /where authorised,\s*development evidence/i
    );
    expect(LEAD_MANAGER_DI_INTERPRETATION_COPY).not.toMatch(
      /reflect contributing authorised evidence/i
    );
    expect(LEAD_MANAGER_DI_INTERPRETATION_COPY).not.toMatch(
      /how clearly a theme appears in the available evidence/i
    );
    expect(STRENGTH_EXPLANATIONS.emerging).not.toMatch(
      /the evidence is still developing/i
    );
  });

  it("Stage 5 L1: Lead copy does not imply behavioural proof or competence measurement", () => {
    const copy = read("lib/manager-development-intelligence/ui-copy.ts");
    const combined = `${copy}\n${LEAD_MANAGER_DI_INTERPRETATION_COPY}\n${STRENGTH_EXPLANATIONS.emerging}\n${STRENGTH_EXPLANATIONS.developing}`.toLowerCase();
    expect(combined).not.toContain("managers are showing");
    expect(combined).not.toMatch(/competence score|competence measure/);
    expect(combined).not.toMatch(/\bproves\b/);
    expect(LEAD_MANAGER_DI_INTERPRETATION_COPY).toMatch(/not a census/i);
    expect(LEAD_MANAGER_DI_INTERPRETATION_COPY).toMatch(
      /not a census, ranking or measure of individual performance/i
    );
    expect(LEAD_MANAGER_DI_INTERPRETATION_COPY).toMatch(
      /does not prove that no development need exists/i
    );
  });
});
