import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canReadOrganisationIntelligence,
  hasPermission,
} from "@/lib/organisations/permissions";
import {
  aggregateManagerDevelopmentSignals,
  deriveCanonicalThemeFromCapabilityKey,
  deriveCanonicalThemeFromFocusTitle,
  distinctManagerCountForTheme,
  MANAGER_DEVELOPMENT_PRIVACY_THRESHOLD,
  toLeadSafeManagerDevelopmentPayload,
  type ManagerDevelopmentDerivedSignal,
} from "@/lib/manager-development-intelligence";
import {
  aggregatesContainSelfDevelopmentRelationship,
  excludeSelfDevelopmentFromAggregates,
} from "@/lib/organisation-intelligence";
import type { OrganisationIntelligenceSourceAggregates } from "@/lib/organisation-intelligence";

const root = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function signal(
  themeKey: string,
  managerUserId: string,
  modality: ManagerDevelopmentDerivedSignal["modality"] = "focus"
): ManagerDevelopmentDerivedSignal {
  return { themeKey, managerUserId, modality };
}

function makeAggregates(
  overrides: Partial<OrganisationIntelligenceSourceAggregates> = {}
): OrganisationIntelligenceSourceAggregates {
  return {
    organisationId: "org-1",
    periodStart: "2026-05-06",
    periodEnd: "2026-08-03",
    previousPeriodStart: "2026-02-05",
    previousPeriodEnd: "2026-05-05",
    activeRelationships: 12,
    activePractitioners: 4,
    conversations: 28,
    previousConversations: 20,
    completedConversations: 22,
    previousCompletedConversations: 16,
    actionsTotal: 30,
    actionsCompleted: 18,
    previousActionsTotal: 24,
    previousActionsCompleted: 12,
    reflectionsCompleted: 14,
    previousReflectionsCompleted: 10,
    developmentUpdatesCompleted: 9,
    previousDevelopmentUpdatesCompleted: 6,
    evidenceItems: 40,
    previousEvidenceItems: 25,
    contributingRelationships: 8,
    themeCandidates: [],
    previousThemeCandidates: [],
    progressSignals: [],
    itemThemes: [],
    hasEarlierPeriodActivity: true,
    ...overrides,
  };
}

describe("Stage 3.1 canonical theme derivation", () => {
  it("maps equivalent focus wording to a canonical key", () => {
    expect(deriveCanonicalThemeFromFocusTitle("Delegating more effectively")).toBe(
      "delegation"
    );
    expect(deriveCanonicalThemeFromFocusTitle("letting go")).toBe("delegation");
  });

  it("drops sensitive and unmapped focus text without leaking raw wording", () => {
    expect(
      deriveCanonicalThemeFromFocusTitle("Speak to Sarah about her attitude")
    ).toBeNull();
    expect(
      deriveCanonicalThemeFromFocusTitle("I need therapy for depression")
    ).toBeNull();
    expect(deriveCanonicalThemeFromFocusTitle("xyzzy unknown priority")).toBeNull();
  });

  it("maps validated capability keys only when unambiguous", () => {
    expect(deriveCanonicalThemeFromCapabilityKey("delegation")).toBe("delegation");
    expect(deriveCanonicalThemeFromCapabilityKey("ownership")).toBe(
      "accountability"
    );
    expect(deriveCanonicalThemeFromCapabilityKey("not_a_capability")).toBeNull();
  });
});

describe("Stage 3.1 distinct-Manager aggregation and suppression", () => {
  it("uses a five distinct Manager privacy threshold", () => {
    expect(MANAGER_DEVELOPMENT_PRIVACY_THRESHOLD).toBe(5);
  });

  it("one Manager with high volume cannot create a visible pattern", () => {
    const signals = Array.from({ length: 20 }, (_, index) =>
      signal("delegation", "manager-1", index % 2 === 0 ? "focus" : "evidence_capability")
    );
    const view = aggregateManagerDevelopmentSignals({
      signals,
      activeManagerPopulation: 20,
    });
    expect(distinctManagerCountForTheme(signals, "delegation")).toBe(1);
    expect(view.patterns).toEqual([]);
    expect(view.status).toBe("insufficient_evidence");
  });

  it("four Managers remain suppressed", () => {
    const signals = ["m1", "m2", "m3", "m4"].map(id => signal("delegation", id));
    const view = aggregateManagerDevelopmentSignals({
      signals,
      activeManagerPopulation: 10,
    });
    expect(view.patterns).toEqual([]);
  });

  it("exactly five distinct Managers can make a theme eligible", () => {
    const signals = ["m1", "m2", "m3", "m4", "m5"].map(id =>
      signal("delegation", id)
    );
    const view = aggregateManagerDevelopmentSignals({
      signals,
      activeManagerPopulation: 5,
    });
    expect(view.status).toBe("patterns_available");
    expect(view.patterns).toHaveLength(1);
    expect(view.patterns[0]?.themeKey).toBe("delegation");
    expect(view.patterns[0]?.strength).toBe("emerging");
  });

  it("theme with fewer than five contributors stays suppressed in a large organisation", () => {
    const signals = [
      ...["m1", "m2", "m3"].map(id => signal("delegation", id)),
      ...["m4", "m5", "m6", "m7", "m8"].map(id => signal("feedback", id)),
    ];
    const view = aggregateManagerDevelopmentSignals({
      signals,
      activeManagerPopulation: 20,
    });
    expect(view.patterns.map(p => p.themeKey)).toEqual(["feedback"]);
    expect(view.patterns.some(p => p.themeKey === "delegation")).toBe(false);
  });

  it("duplicate signals from one Manager count once", () => {
    const signals = [
      signal("delegation", "m1"),
      signal("delegation", "m1"),
      signal("delegation", "m1", "evidence_capability"),
      signal("delegation", "m2"),
      signal("delegation", "m3"),
      signal("delegation", "m4"),
      signal("delegation", "m5"),
    ];
    expect(distinctManagerCountForTheme(signals, "delegation")).toBe(5);
  });

  it("removing one of exactly five contributors suppresses the theme", () => {
    const five = ["m1", "m2", "m3", "m4", "m5"].map(id => signal("delegation", id));
    expect(
      aggregateManagerDevelopmentSignals({
        signals: five,
        activeManagerPopulation: 5,
      }).patterns
    ).toHaveLength(1);

    const four = five.slice(0, 4);
    expect(
      aggregateManagerDevelopmentSignals({
        signals: four,
        activeManagerPopulation: 5,
      }).patterns
    ).toHaveLength(0);
  });

  it("keeps privacy threshold separate from evidence strength", () => {
    const focusOnly = ["m1", "m2", "m3", "m4", "m5"].map(id =>
      signal("delegation", id, "focus")
    );
    const multi = [
      ...focusOnly,
      ...["m1", "m2", "m3", "m4", "m5"].map(id =>
        signal("delegation", id, "evidence_capability")
      ),
    ];
    expect(
      aggregateManagerDevelopmentSignals({
        signals: focusOnly,
        activeManagerPopulation: 5,
      }).patterns[0]?.strength
    ).toBe("emerging");
    expect(
      aggregateManagerDevelopmentSignals({
        signals: multi,
        activeManagerPopulation: 5,
      }).patterns[0]?.strength
    ).toBe("developing");
  });

  it("low-data readiness does not reveal private Manager behaviour", () => {
    const view = aggregateManagerDevelopmentSignals({
      signals: [signal("delegation", "only-manager")],
      activeManagerPopulation: 2,
    });
    expect(view.status).toBe("insufficient_evidence");
    expect(view.readiness.sufficientManagerPopulation).toBe(false);
    expect(view.patterns).toEqual([]);
    expect(view.message).toMatch(/Not enough evidence/i);
    const json = JSON.stringify(view);
    expect(json).not.toContain("only-manager");
    expect(json).not.toMatch(/contributor/i);
    expect(json).not.toMatch(/\b4\b Managers/);
  });
});

describe("Stage 3.1 Lead-safe response contract", () => {
  it("Lead payload excludes identifiers, counts, quotes and raw content", () => {
    const view = aggregateManagerDevelopmentSignals({
      signals: ["m1", "m2", "m3", "m4", "m5"].map(id => signal("delegation", id)),
      activeManagerPopulation: 8,
    });
    const payload = toLeadSafeManagerDevelopmentPayload(view);
    const json = JSON.stringify(payload);

    expect(payload).toHaveProperty("status");
    expect(payload).toHaveProperty("privacyNote");
    expect(payload).toHaveProperty("readiness.sufficientManagerPopulation");
    expect(payload.patterns[0]).toEqual({
      themeKey: "delegation",
      themeLabel: "Delegation",
      strength: "emerging",
    });

    for (const forbidden of [
      "managerUserId",
      "userId",
      "clientId",
      "relationshipId",
      "evidenceId",
      "reflectionId",
      "actionId",
      "contributorCount",
      "sourceCount",
      "percentage",
      "m1",
      "Delegating more effectively",
      "Speak to Sarah",
      "aurelia",
      "completionRate",
    ]) {
      expect(json).not.toContain(forbidden);
    }
  });

  it("does not expose ranking or individual comparison fields", () => {
    const view = aggregateManagerDevelopmentSignals({
      signals: [
        ...["m1", "m2", "m3", "m4", "m5"].map(id => signal("delegation", id)),
        ...["m1", "m2", "m3", "m4", "m5"].map(id => signal("feedback", id)),
      ],
      activeManagerPopulation: 10,
    });
    const json = JSON.stringify(toLeadSafeManagerDevelopmentPayload(view));
    expect(json).not.toMatch(/rank/i);
    expect(json).not.toMatch(/score/i);
    expect(json).not.toMatch(/managerCount/i);
    expect(json).not.toMatch(/percent/i);
  });
});

describe("Stage 3.1 relationship OI self-development exclusion", () => {
  it("removes self-development themes and actions from relationship aggregates", () => {
    const selfDev = new Set(["self-1"]);
    const aggregates = makeAggregates({
      activeRelationships: 5,
      actionsTotal: 10,
      actionsCompleted: 4,
      itemThemes: [
        {
          themeKey: "delegation",
          relationshipId: "self-1",
          sourceType: "client_item_theme",
        },
        {
          themeKey: "feedback",
          relationshipId: "person-1",
          sourceType: "client_item_theme",
        },
      ],
      themeCandidates: [
        {
          themeKey: "confidence",
          relationshipId: "self-1",
          sourceType: "intelligence_item",
        },
        {
          themeKey: "confidence",
          relationshipId: "person-2",
          sourceType: "intelligence_item",
        },
      ],
    });

    const cleaned = excludeSelfDevelopmentFromAggregates(aggregates, selfDev, {
      actionsTotal: 3,
      actionsCompleted: 1,
    });

    expect(cleaned.itemThemes.map(t => t.relationshipId)).toEqual(["person-1"]);
    expect(cleaned.themeCandidates.map(t => t.relationshipId)).toEqual([
      "person-2",
    ]);
    expect(cleaned.activeRelationships).toBe(4);
    expect(cleaned.actionsTotal).toBe(7);
    expect(cleaned.actionsCompleted).toBe(3);
    expect(
      aggregatesContainSelfDevelopmentRelationship(cleaned, selfDev)
    ).toBe(false);
  });

  it("wires sanitisation into relationship OI fetch path", () => {
    const repo = read("lib/organisation-intelligence/repository.ts");
    expect(repo).toContain("sanitizeOrganisationIntelligenceAggregates");
    expect(repo).toContain("exclude-self-development");
    expect(repo).toContain("contributorKey");
    expect(repo).toContain("selfDevelopmentExcluded");
  });

  it("keeps Manager Development Intelligence separate from relationship OI RPC", () => {
    const sql = read(
      "supabase/migrations/20260813120000_relationship_oi_self_development_boundary.sql"
    );
    const route = read(
      "app/api/organisations/manager-development-intelligence/route.ts"
    );
    expect(sql).not.toContain("MANAGER_DEVELOPMENT_PRIVACY_THRESHOLD");
    expect(route).not.toContain("aggregate_organisation_intelligence_sources");
    expect(MANAGER_DEVELOPMENT_PRIVACY_THRESHOLD).toBe(5);
  });

  it("managed-person relationship data remains when not self-development", () => {
    const cleaned = excludeSelfDevelopmentFromAggregates(
      makeAggregates({
        itemThemes: [
          {
            themeKey: "delegation",
            relationshipId: "person-1",
            sourceType: "client_item_theme",
          },
        ],
      }),
      new Set(["self-9"])
    );
    expect(cleaned.itemThemes).toHaveLength(1);
    expect(cleaned.itemThemes[0]?.relationshipId).toBe("person-1");
  });
});

describe("Stage 3.1 API security architecture", () => {
  it("exposes a separate Manager Development Intelligence route", () => {
    const route = read(
      "app/api/organisations/manager-development-intelligence/route.ts"
    );
    expect(route).toContain("intelligence.organisation.read");
    expect(route).toContain("requireOrganisationContext");
    expect(route).toContain("getSupabaseServiceClient");
    expect(route).toContain("toLeadSafeManagerDevelopmentPayload");
    expect(route).toContain("buildManagerDevelopmentIntelligence");
    expect(route).not.toContain("aggregate_organisation_intelligence_sources");
  });

  it("does not grant access from Manager professional role alone", () => {
    expect(canReadOrganisationIntelligence("practitioner")).toBe(false);
    expect(hasPermission("practitioner", "intelligence.organisation.read")).toBe(
      false
    );
    expect(canReadOrganisationIntelligence("oversight")).toBe(true);
    expect(canReadOrganisationIntelligence("administrator")).toBe(true);
    expect(canReadOrganisationIntelligence("owner")).toBe(true);
  });

  it("never mixes Manager Development into relationship OI generate path", () => {
    const generate = read("lib/organisation-intelligence/generate.ts");
    expect(generate).not.toContain("manager-development-intelligence");
    expect(generate).not.toContain("buildManagerDevelopmentIntelligence");
  });

  it("hard-codes Aurelia and raw private sources out of the Lead pipeline", () => {
    const load = read("lib/manager-development-intelligence/load-signals.ts");
    const derive = read("lib/manager-development-intelligence/derive-theme.ts");
    expect(load).not.toContain("aurelia");
    expect(load).toContain('item_type", "theme"');
    expect(load).toContain("capability_keys");
    expect(load).toContain("personal_reflection");
    expect(load).toContain("PSYCHOMETRIC_EVIDENCE_TYPES");
    expect(derive).toContain("deriveCanonicalThemeFromFocusTitle");
    expect(derive).not.toContain("return raw");
  });

  it("Owner Console privacy list and owner routes stay free of Manager-dev content", () => {
    const ownerPrivacy = read("lib/owner/privacy.ts");
    expect(ownerPrivacy).toContain("assertOwnerPayloadIsSafe");
    const ownerRoutes = [
      "app/api/owner/organisations/route.ts",
      "app/api/owner/organisations/[id]/route.ts",
      "lib/owner/privacy.ts",
      "lib/owner/repository.ts",
    ];
    for (const path of ownerRoutes) {
      const source = read(path);
      expect(source).not.toContain("manager-development-intelligence");
      expect(source).not.toContain("buildManagerDevelopmentIntelligence");
    }
  });
});
