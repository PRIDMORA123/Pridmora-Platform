import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EVIDENCE_APPROVAL_ORG_VISIBILITY_COPY,
  MANAGER_HOME_PRIVACY_VISIBILITY_COPY,
  MANAGER_HOME_PRIVACY_VISIBILITY_LABEL,
} from "@/lib/organisations/manager-privacy-visibility-copy";
import {
  LEAD_LENS_SEPARATION_COPY,
  LEAD_MANAGER_DI_INTERPRETATION_COPY,
  LEAD_PRIVACY_BOUNDARY_COPY,
} from "@/lib/manager-development-intelligence/ui-copy";
import {
  COVERAGE_CAVEAT_NOTE,
  INSUFFICIENT_EVIDENCE_COPY,
  ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD,
  PREVALENCE_DIRECTION_NOTE,
  PRIVACY_NOTE,
} from "@/lib/organisation-intelligence/constants";
import { MANAGER_DEVELOPMENT_PRIVACY_THRESHOLD } from "@/lib/manager-development-intelligence/constants";

const root = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("FIX-1 privacy / organisation visibility explanation", () => {
  it("1–3: Manager Home explains visibility without absolute secrecy or Lead conversation access", () => {
    const mcc = read("components/identity/manager-command-centre.tsx");
    expect(mcc).toContain("manager-home-privacy");
    expect(mcc).toContain("MANAGER_HOME_PRIVACY_VISIBILITY_COPY");
    expect(MANAGER_HOME_PRIVACY_VISIBILITY_LABEL).toBe(
      "What can my organisation see?"
    );
    expect(MANAGER_HOME_PRIVACY_VISIBILITY_COPY).toMatch(
      /does not receive readable Aurelia conversations/i
    );
    expect(MANAGER_HOME_PRIVACY_VISIBILITY_COPY).toMatch(
      /private reflections/i
    );
    expect(MANAGER_HOME_PRIVACY_VISIBILITY_COPY).toMatch(
      /individual development record/i
    );
    expect(MANAGER_HOME_PRIVACY_VISIBILITY_COPY).toMatch(
      /collective themes/i
    );
    expect(MANAGER_HOME_PRIVACY_VISIBILITY_COPY).toMatch(
      /not a performance or competence score/i
    );
    expect(MANAGER_HOME_PRIVACY_VISIBILITY_COPY).toMatch(
      /within defined product boundaries/i
    );
    expect(MANAGER_HOME_PRIVACY_VISIBILITY_COPY).not.toMatch(
      /only you can ever see|absolutely confidential|never accessible/i
    );
    expect(MANAGER_HOME_PRIVACY_VISIBILITY_COPY).not.toMatch(
      /organisation can read your Aurelia/i
    );
  });

  it("4–8: Lead copy covers collective threshold, prevalence, coverage and absence", () => {
    expect(ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD).toBe(5);
    expect(MANAGER_DEVELOPMENT_PRIVACY_THRESHOLD).toBe(5);
    expect(LEAD_PRIVACY_BOUNDARY_COPY).toMatch(/at least five Managers/i);
    expect(LEAD_PRIVACY_BOUNDARY_COPY).toMatch(
      /cannot identify or target/i
    );
    expect(LEAD_MANAGER_DI_INTERPRETATION_COPY).toMatch(
      /not be interpreted as a census/i
    );
    expect(LEAD_MANAGER_DI_INTERPRETATION_COPY).toMatch(
      /not a performance or competence measure/i
    );
    expect(LEAD_MANAGER_DI_INTERPRETATION_COPY).toMatch(
      /does not prove that no development need exists/i
    );
    expect(PREVALENCE_DIRECTION_NOTE).toMatch(
      /not a performance measure/i
    );
    expect(COVERAGE_CAVEAT_NOTE).toMatch(/not.*census of every manager/i);
    expect(INSUFFICIENT_EVIDENCE_COPY).toMatch(
      /does not prove that no development need exists/i
    );
    expect(PRIVACY_NOTE).toMatch(/must not be used to identify/i);

    const oiPage = read("app/organisation/intelligence/page.tsx");
    expect(oiPage).toContain("PREVALENCE_DIRECTION_NOTE");
    expect(oiPage).toContain("COVERAGE_CAVEAT_NOTE");
    expect(oiPage).toContain(
      "A minimum of five contributing relationships helps reduce the risk of"
    );
    expect(oiPage).toMatch(/not individual surveillance/i);

    const managerDi = read(
      "components/organisation/manager-development-intelligence-view.tsx"
    );
    expect(managerDi).toContain("LEAD_MANAGER_DI_INTERPRETATION_COPY");
  });

  it("9: Manager DI and People DI remain distinct", () => {
    expect(LEAD_LENS_SEPARATION_COPY).toMatch(/People Development Intelligence/i);
    expect(LEAD_LENS_SEPARATION_COPY).toMatch(/Manager development/i);
    const oiPage = read("app/organisation/intelligence/page.tsx");
    expect(oiPage).toContain("People Development Intelligence");
    expect(oiPage).toContain("Manager Development");
    expect(oiPage).toContain("org-intelligence-lens-note");
  });

  it("10–11: no private data newly exposed; intelligence logic untouched", () => {
    expect(MANAGER_HOME_PRIVACY_VISIBILITY_COPY).not.toMatch(
      /contributorKey|session notes|extracted_text/i
    );
    const aggregate = read("lib/organisation-intelligence/themes.ts");
    expect(aggregate).toContain("meetsPrivacyThreshold");
    // Copy-only change — aggregation still uses threshold helper.
    expect(ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD).toBe(5);
  });

  it("evidence approval reinforces organisational visibility without FIX-5 guardrails", () => {
    const evidence = read(
      "components/development-evidence/development-evidence-view.tsx"
    );
    expect(evidence).toContain("EVIDENCE_APPROVAL_ORG_VISIBILITY_COPY");
    expect(EVIDENCE_APPROVAL_ORG_VISIBILITY_COPY).toMatch(/authorises/i);
    expect(evidence).not.toMatch(/sensitive information|do not upload/i);
  });
});
