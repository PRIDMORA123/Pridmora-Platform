import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildReflectionPatternInsights,
  patternsSafeForIntelligence,
} from "@/lib/my-development/reflection-patterns";
import {
  buildMyDevelopmentFocusItemRows,
  buildMyDevelopmentMaturity,
} from "@/lib/my-development/workspace";
import type { DevelopmentEvidenceRecord } from "@/lib/development-evidence/types";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

function reflectionRecord(
  id: string,
  theme: string,
  capturedAt: string
): DevelopmentEvidenceRecord {
  return {
    id,
    organisationId: "org-a",
    clientId: "self-a",
    evidenceType: "personal_reflection",
    sourceType: "manual_entry",
    sourceRecordId: null,
    title: `Reflection ${id}`,
    evidenceDate: capturedAt.slice(0, 10),
    capturedAt,
    capturedBy: "user-a",
    originalDocumentId: null,
    processingStatus: "ready",
    reviewStatus: "approved",
    includeInIntelligence: true,
    structuredEvidence: {
      observations: [
        {
          title: "What was difficult",
          description: theme,
          category: "Development theme",
          behaviouralEvidence: theme,
        },
      ],
      developmentSignals: [theme],
      strengthSignals: [],
      capabilitySignals: [],
      contradictoryEvidence: [],
      context: [],
      limitations: [],
    },
    sourceSummary: theme,
    freshnessClass: "current",
    restricted: false,
    contentHash: null,
    extractionVersion: null,
    purpose: "Manager development reflection",
    sourceLabel: "My development reflection",
    capabilityKeys: [],
    createdAt: capturedAt,
    updatedAt: capturedAt,
    deletedAt: null,
  };
}

describe("Manager My Development journey", () => {
  it("Manager can open My Development and empty state gives clear starters", () => {
    const view = read("components/my-development-view.tsx");
    const home = read("components/home-app.tsx");
    expect(home).toContain('view === "my-development"');
    expect(home).toContain("<MyDevelopmentView");
    expect(view).toContain("Build your development picture");
    expect(view).toContain("Set a development focus");
    expect(view).toContain("Reflect on my development");
    expect(view).toContain("Add evidence");
    expect(view).toContain(
      "Build a clearer picture of how you lead, what you"
    );
    expect(view).toContain("developing and");
  });

  it("supports setting development focus via self-only API", () => {
    const focus = read("app/api/my-development/focus/route.ts");
    const workspace = read("lib/my-development/workspace.ts");
    expect(focus).toContain("updateMyDevelopmentFocus");
    expect(workspace).toContain('item_type: "theme"');
    expect(workspace).toContain("current_focus");
    expect(read("components/my-development-view.tsx")).toContain(
      "/api/my-development/focus"
    );
  });

  it("focus theme rows always include server organisation_id (BSH vs personal isolation)", () => {
    const bsh = "6adc66d5-3e6a-4e65-946d-a8ee6ef66250";
    const personal = "fee88946-8964-4788-94ef-49a5b098cec5";
    const bshRows = buildMyDevelopmentFocusItemRows({
      clientId: "self-bsh",
      coachId: "kate",
      organisationId: bsh,
      priorities: ["Delegation"],
    });
    const personalRows = buildMyDevelopmentFocusItemRows({
      clientId: "self-personal",
      coachId: "kate",
      organisationId: personal,
      priorities: ["Confidence"],
    });

    expect(bshRows).toHaveLength(1);
    expect(bshRows[0]?.organisation_id).toBe(bsh);
    expect(bshRows[0]?.item_type).toBe("theme");
    expect(personalRows[0]?.organisation_id).toBe(personal);
    expect(personalRows[0]?.organisation_id).not.toBe(
      bshRows[0]?.organisation_id
    );

    expect(() =>
      buildMyDevelopmentFocusItemRows({
        clientId: "self-bsh",
        coachId: "kate",
        organisationId: "   ",
        priorities: ["Delegation"],
      })
    ).toThrow(/Organisation is required/i);

    const workspace = read("lib/my-development/workspace.ts");
    expect(workspace).toContain("buildMyDevelopmentFocusItemRows");
    expect(workspace).toContain("assertSelfClientOrganisation");
    expect(workspace).toContain("organisation_id: organisationId");
    expect(workspace).toContain('.eq("organisation_id", input.organisationId)');
  });

  it("actions upsert derives organisation_id from owned client, never browser payload", () => {
    const repo = read("lib/supabase/repository.ts");
    const actions = read("app/api/actions/route.ts");
    expect(repo).toContain("resolveClientOrganisationId");
    expect(repo).toContain("organisation_id: organisationId");
    expect(repo).toContain("Never strip organisation_id");
    expect(repo).toContain(
      "never from browser-supplied action payload"
    );
    expect(actions).toContain("requireAssignedPersonInOrganisation");
    expect(actions).toContain("upsertActionInDb");
    // Browser body must not be the source of organisation_id.
    expect(actions).not.toMatch(/organisationId:\s*input\.organisationId/);
    expect(actions).not.toMatch(/organisation_id:\s*body/);
  });

  it("supports multiple dated reflections without overwrite", () => {
    const reflectionRoute = read("app/api/my-development/reflection/route.ts");
    const workspace = read("lib/my-development/workspace.ts");
    const ui = read("components/my-development-reflection-view.tsx");
    expect(reflectionRoute).toContain("createMyDevelopmentReflection");
    expect(reflectionRoute).toContain("listMyDevelopmentReflections");
    expect(reflectionRoute).toContain("Never overwrites earlier reflections");
    expect(workspace).toContain(".insert({");
    expect(workspace).not.toMatch(
      /personal_reflection[\s\S]{0,200}\.update\(/
    );
    expect(ui).toContain("New reflection");
    expect(ui).toContain("Reflection history");
    expect(ui).toContain("nothing is overwritten");
  });

  it("lists reflections reverse chronologically and supports reopen", () => {
    const workspace = read("lib/my-development/workspace.ts");
    const detail = read(
      "app/api/my-development/reflection/[reflectionId]/route.ts"
    );
    const ui = read("components/my-development-reflection-view.tsx");
    expect(workspace).toContain("bDate.localeCompare(aDate)");
    expect(workspace).toContain("getMyDevelopmentReflection");
    expect(detail).toContain("getMyDevelopmentReflection");
    expect(ui).toContain("Open");
    expect(ui).toContain("/api/my-development/reflection/");
  });

  it("wires evidence and actions into My Development", () => {
    const view = read("components/my-development-view.tsx");
    const home = read("components/home-app.tsx");
    expect(view).toContain("/api/actions");
    expect(view).toContain("Add action");
    expect(view).toContain("STATUS_LABEL");
    expect(view).toContain("Needs attention");
    expect(home).toContain('navigate("my-development-evidence")');
    expect(home).toContain("my-development-reflection");
  });

  it("limited information produces emerging intelligence framing", () => {
    const maturity = buildMyDevelopmentMaturity({
      focusCount: 0,
      actions: [],
      evidence: [reflectionRecord("r1", "Delegation", "2026-08-01T10:00:00Z")],
    });
    expect(maturity.isEmpty).toBe(false);
    expect(maturity.headline).toMatch(/beginning to form/i);
    expect(maturity.supportCopy).toMatch(/1 source/i);
    expect(maturity.includedSourceCount).toBe(1);

    const empty = buildMyDevelopmentMaturity({
      focusCount: 0,
      actions: [],
      evidence: [],
    });
    expect(empty.isEmpty).toBe(true);
    expect(empty.headline).toBe("Build your development picture");
  });

  it("one reflection alone is not a definitive behavioural conclusion", () => {
    const patterns = buildReflectionPatternInsights([
      reflectionRecord("r1", "Delegation", "2026-08-01T10:00:00Z"),
    ]);
    expect(patterns).toHaveLength(1);
    expect(patterns[0]?.patternKind).toBe("one_off");
    expect(patterns[0]?.statement).toMatch(/one-off observation/i);
    expect(patterns[0]?.statement).not.toMatch(/poor at/i);
    expect(patternsSafeForIntelligence(patterns)).toHaveLength(0);
  });

  it("repeated reflection themes surface as emerging/recurring patterns", () => {
    const patterns = buildReflectionPatternInsights([
      reflectionRecord("r1", "Delegation", "2026-08-01T10:00:00Z"),
      reflectionRecord("r2", "Delegation", "2026-08-05T10:00:00Z"),
      reflectionRecord("r3", "Delegation", "2026-08-08T10:00:00Z"),
    ]);
    const recurring = patterns.find(item => item.patternKind === "recurring");
    expect(recurring).toBeTruthy();
    expect(recurring?.statement).toMatch(
      /has appeared across 3 recent reflections/i
    );
    expect(patternsSafeForIntelligence(patterns).length).toBeGreaterThan(0);
  });

  it("Development Intelligence uses self voice and maturity framing", () => {
    const intel = read("components/my-development-intelligence-view.tsx");
    const panel = read(
      "components/development-evidence/development-intelligence-evidence-panel.tsx"
    );
    expect(intel).toContain('voice="self"');
    expect(intel).toContain("Evidence before certainty");
    expect(intel).toContain("intelligencePatterns");
    expect(panel).toContain('voice?: "person" | "self"');
    expect(panel).toContain("What do we currently understand about your development?");
  });

  it("keeps self-development hidden from People and team intelligence", () => {
    const repo = read("lib/supabase/repository.ts");
    const team = read("app/api/team-intelligence/route.ts");
    expect(repo).toContain("must not appear in People");
    expect(repo).toContain("is_self_development");
    expect(team).toContain("self development");
    expect(team).toContain("Exclude Manager My Development self-records");
  });

  it("keeps managed-person intelligence and evidence routes separate", () => {
    const home = read("components/home-app.tsx");
    expect(home).toContain('view === "development-evidence" && selected');
    expect(home).toContain('onOpenIntelligence={() => navigate("intelligence")}');
    expect(home).toContain(
      'view === "my-development-intelligence" && selfDevelopmentClient'
    );
    expect(home).not.toContain("self-client");
  });

  it("workspace APIs are organisation-scoped via self-relationship ensure", () => {
    const workspaceRoute = read("app/api/my-development/workspace/route.ts");
    const focusRoute = read("app/api/my-development/focus/route.ts");
    const reflectionRoute = read("app/api/my-development/reflection/route.ts");
    const lib = read("lib/my-development/workspace.ts");
    expect(workspaceRoute).toContain("requireOrganisationContext");
    expect(focusRoute).toContain("requireOrganisationContext");
    expect(reflectionRoute).toContain("requireOrganisationContext");
    expect(lib).toContain("ensureSelfDevelopmentRelationship");
    expect(lib).toContain("organisationId");
  });

  it("failed evidence analysis path preserves development record helpers", () => {
    const evidenceView = read(
      "components/development-evidence/development-evidence-view.tsx"
    );
    const extract = read("lib/development-evidence/extract.ts");
    expect(evidenceView).toContain("Retry analysis");
    expect(evidenceView).toContain("Analysis failed");
    expect(extract).toContain("isUnusablePdfExtract");
  });

  it("does not expose hidden self-development terminology in Manager UI", () => {
    const overview = read("components/my-development-view.tsx");
    const reflection = read("components/my-development-reflection-view.tsx");
    const intel = read("components/my-development-intelligence-view.tsx");
    for (const source of [overview, reflection, intel]) {
      expect(source).not.toMatch(/self[- ]?client/i);
      expect(source).not.toMatch(/hidden client/i);
      expect(source).not.toContain("is_self_development");
    }
  });
});
