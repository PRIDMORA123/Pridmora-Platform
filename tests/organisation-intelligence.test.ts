import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  canReadOrganisationIntelligence,
  hasPermission,
} from "@/lib/organisations/permissions";
import {
  aggregateThemes,
  buildDeterministicExecutiveBrief,
  buildOrganisationIntelligenceExportHtml,
  buildOrganisationIntelligenceSnapshotView,
  buildOrganisationMetrics,
  calculateConfidenceLevel,
  calculateDevelopmentMomentum,
  collectAllowedNumbers,
  hasEnoughEvidenceForOrganisationView,
  isRestrictedSensitiveTheme,
  mapCapabilityTrends,
  meetsPrivacyThreshold,
  normaliseThemeKey,
  resolveOrganisationIntelligencePeriod,
  validateOrganisationIntelligenceBrief,
  mapSourceAggregates,
  ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD,
} from "@/lib/organisation-intelligence";
import type { OrganisationIntelligenceSourceAggregates } from "@/lib/organisation-intelligence";

const root = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
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
    themeCandidates: [
      {
        themeKey: "confidence",
        relationshipId: "r1",
        sourceType: "intelligence_item",
      },
      {
        themeKey: "confidence",
        relationshipId: "r2",
        sourceType: "intelligence_item",
      },
      {
        themeKey: "confidence",
        relationshipId: "r3",
        sourceType: "intelligence_item",
      },
      {
        themeKey: "confidence",
        relationshipId: "r4",
        sourceType: "client_item_theme",
      },
      {
        themeKey: "confidence",
        relationshipId: "r5",
        sourceType: "intelligence_item",
      },
      {
        themeKey: "feedback",
        relationshipId: "r1",
        sourceType: "intelligence_item",
      },
      {
        themeKey: "feedback",
        relationshipId: "r2",
        sourceType: "intelligence_item",
      },
      {
        themeKey: "feedback",
        relationshipId: "r6",
        sourceType: "intelligence_item",
      },
      {
        themeKey: "feedback",
        relationshipId: "r7",
        sourceType: "intelligence_item",
      },
      {
        themeKey: "feedback",
        relationshipId: "r8",
        sourceType: "intelligence_item",
      },
      {
        themeKey: "suicide ideation",
        relationshipId: "r1",
        sourceType: "intelligence_item",
      },
    ],
    previousThemeCandidates: [
      {
        themeKey: "confidence",
        relationshipId: "r1",
        sourceType: "intelligence_item",
      },
      {
        themeKey: "confidence",
        relationshipId: "r2",
        sourceType: "intelligence_item",
      },
      {
        themeKey: "confidence",
        relationshipId: "r3",
        sourceType: "intelligence_item",
      },
      {
        themeKey: "confidence",
        relationshipId: "r9",
        sourceType: "intelligence_item",
      },
      {
        themeKey: "confidence",
        relationshipId: "r10",
        sourceType: "intelligence_item",
      },
      {
        themeKey: "confidence",
        relationshipId: "r11",
        sourceType: "intelligence_item",
      },
    ],
    progressSignals: [
      {
        signalName: "listening presence",
        direction: "improving",
        relationshipId: "r1",
        coachValidated: true,
      },
      {
        signalName: "listening presence",
        direction: "improving",
        relationshipId: "r2",
        coachValidated: true,
      },
      {
        signalName: "listening presence",
        direction: "improving",
        relationshipId: "r3",
        coachValidated: true,
      },
      {
        signalName: "listening presence",
        direction: "improving",
        relationshipId: "r4",
        coachValidated: true,
      },
      {
        signalName: "listening presence",
        direction: "improving",
        relationshipId: "r5",
        coachValidated: true,
      },
    ],
    itemThemes: [],
    hasEarlierPeriodActivity: true,
    ...overrides,
  };
}

describe("organisation intelligence access", () => {
  it("allows owner, administrator and oversight", () => {
    expect(canReadOrganisationIntelligence("owner")).toBe(true);
    expect(canReadOrganisationIntelligence("administrator")).toBe(true);
    expect(canReadOrganisationIntelligence("oversight")).toBe(true);
    expect(hasPermission("owner", "intelligence.organisation.read")).toBe(true);
  });

  it("denies practitioner, viewer and inactive-style roles without permission", () => {
    expect(canReadOrganisationIntelligence("practitioner")).toBe(false);
    expect(canReadOrganisationIntelligence("viewer")).toBe(false);
    expect(hasPermission("practitioner", "intelligence.organisation.read")).toBe(
      false
    );
  });

  it("does not grant organisation intelligence through assignment alone", () => {
    expect(hasPermission("practitioner", "intelligence.organisation.read")).toBe(
      false
    );
    expect(hasPermission("practitioner", "coaching_content.view")).toBe(true);
  });
});

describe("organisation intelligence privacy", () => {
  it("uses a launch privacy threshold of 5", () => {
    expect(ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD).toBe(5);
    expect(meetsPrivacyThreshold(4)).toBe(false);
    expect(meetsPrivacyThreshold(5)).toBe(true);
  });

  it("excludes restricted sensitive themes", () => {
    expect(isRestrictedSensitiveTheme("suicide ideation")).toBe(true);
    expect(isRestrictedSensitiveTheme("disciplinary hearing")).toBe(true);
    expect(isRestrictedSensitiveTheme("confidence")).toBe(false);
  });

  it("suppresses small samples without revealing counts as zero substitutes", () => {
    const { themes, restrictedEvidenceExcluded } = aggregateThemes({
      current: [
        {
          themeKey: "delegation",
          relationshipId: "r1",
          sourceType: "intelligence_item",
        },
        {
          themeKey: "delegation",
          relationshipId: "r2",
          sourceType: "intelligence_item",
        },
      ],
      previous: [],
      hasEarlierPeriodActivity: false,
      threshold: 5,
    });
    expect(themes[0]?.suppressed).toBe(true);
    expect(themes[0]?.summary).toBeNull();
    expect(restrictedEvidenceExcluded).toBe(false);
  });

  it("marks restricted evidence as excluded without surfacing it", () => {
    const { themes, restrictedEvidenceExcluded } = aggregateThemes({
      current: makeAggregates().themeCandidates,
      previous: [],
      hasEarlierPeriodActivity: false,
      threshold: 5,
    });
    expect(restrictedEvidenceExcluded).toBe(true);
    expect(themes.some(theme => /suicid/i.test(theme.themeLabel))).toBe(false);
  });

  it("export html never includes private identity fields", () => {
    const view = buildOrganisationIntelligenceSnapshotView({
      id: "snap-1",
      organisationId: "org-1",
      organisationName: "Acme Leadership",
      period: resolveOrganisationIntelligencePeriod({
        preset: "last_90_days",
        now: new Date("2026-08-04T12:00:00.000Z"),
      }),
      generatedAt: "2026-08-04T12:00:00.000Z",
      generatedBy: "user-1",
      aggregates: makeAggregates(),
    });
    const html = buildOrganisationIntelligenceExportHtml(view);
    expect(html).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(html).not.toContain("client_private_identities");
    expect(html).not.toMatch(/\bprivate_notes\b/);
    expect(html).toContain("Methodology and privacy");
    expect(html).toContain("anonymised aggregated coaching evidence only");
  });
});

describe("organisation intelligence metrics", () => {
  it("resolves default period as last 90 days with previous comparison window", () => {
    const period = resolveOrganisationIntelligencePeriod({
      now: new Date("2026-08-04T12:00:00.000Z"),
    });
    expect(period.preset).toBe("last_90_days");
    expect(period.periodStart).toBe("2026-05-07");
    expect(period.periodEnd).toBe("2026-08-04");
    expect(period.previousPeriodEnd).toBe("2026-05-06");
  });

  it("calculates Development Momentum transparently", () => {
    const momentum = calculateDevelopmentMomentum({
      completedConversations: 20,
      completedActions: 15,
      completedReflections: 10,
      developmentUpdates: 8,
      evidenceItems: 30,
      previousCompletedConversations: 10,
      previousCompletedActions: 8,
      previousCompletedReflections: 5,
      previousDevelopmentUpdates: 4,
      previousEvidenceItems: 12,
      hasEarlierPeriodActivity: true,
    });
    expect(momentum.value).toBeGreaterThan(0);
    expect(momentum.direction).toBe("up");
    expect(momentum.methodology).toMatch(/not a scientific/i);
  });

  it("shows no earlier comparison when historical activity is missing", () => {
    const metrics = buildOrganisationMetrics(
      makeAggregates({ hasEarlierPeriodActivity: false })
    );
    const momentum = metrics.find(
      metric => metric.metricKey === "development_momentum"
    );
    expect(momentum?.comparisonAvailable).toBe(false);
    expect(momentum?.direction).toBe("unavailable");
  });

  it("maps Six Foundations without inventing percentages", () => {
    const themes = aggregateThemes({
      current: makeAggregates().themeCandidates,
      previous: makeAggregates().previousThemeCandidates,
      hasEarlierPeriodActivity: true,
      threshold: 5,
    }).themes;
    const capabilities = mapCapabilityTrends({
      themes,
      progressSignals: makeAggregates().progressSignals,
      hasEarlierPeriodActivity: true,
      threshold: 5,
    });
    expect(capabilities).toHaveLength(6);
    for (const capability of capabilities) {
      expect(capability.changeLabel).not.toMatch(/%/);
    }
  });

  it("handles insufficient data as an empty state", () => {
    const aggregates = makeAggregates({
      contributingRelationships: 2,
      conversations: 1,
      themeCandidates: [],
      progressSignals: [],
    });
    expect(hasEnoughEvidenceForOrganisationView(aggregates)).toBe(false);
    const view = buildOrganisationIntelligenceSnapshotView({
      id: "snap-empty",
      organisationId: "org-1",
      organisationName: "Acme",
      period: resolveOrganisationIntelligencePeriod(),
      generatedAt: "2026-08-04T12:00:00.000Z",
      generatedBy: null,
      aggregates,
    });
    expect(view.emptyState).toBe(true);
    expect(view.themes).toHaveLength(0);
  });

  it("calculates confidence without describing certainty", () => {
    expect(
      calculateConfidenceLevel({
        evidenceCount: 5,
        relationshipCount: 5,
        sourceTypeCount: 1,
      })
    ).toBe("low");
    expect(
      calculateConfidenceLevel({
        evidenceCount: 12,
        relationshipCount: 6,
        sourceTypeCount: 2,
        consistentDirection: true,
      })
    ).toBe("moderate");
    expect(
      calculateConfidenceLevel({
        evidenceCount: 40,
        relationshipCount: 12,
        sourceTypeCount: 3,
        consistentDirection: true,
        multiPeriod: true,
      })
    ).toBe("high");
  });

  it("normalises known themes and maps foundations", () => {
    const theme = normaliseThemeKey("Difficult conversations");
    expect(theme.key).toBe("difficult_conversations");
    expect(theme.foundations.length).toBeGreaterThan(0);
  });
});

describe("organisation intelligence AI validation", () => {
  it("accepts evidence-led brief language", () => {
    const brief = [
      "Evidence suggests improvement in Feedback and Conversations during the last 90 days.",
      "Areas requiring attention include confidence. Confidence remains tied to the volume of anonymised evidence.",
      "Development Momentum is 42 against the previous comparable period. Stable readings should be treated as evidence limits.",
      "Recommended next focus is continued monitoring and additional evidence gathering.",
    ].join("\n\n");
    const result = validateOrganisationIntelligenceBrief(
      brief,
      collectAllowedNumbers([42, 90, 5])
    );
    expect(result.ok).toBe(true);
  });

  it("rejects identity-like strings, certainty and commercial language", () => {
    const rejected = validateOrganisationIntelligenceBrief(
      "Jane Smith at jane@example.com proves the organisation is ready. Buy the Pridmora programme on 01234 567890."
    );
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.reasons).toEqual(
        expect.arrayContaining([
          "email_like_string",
          "certainty_language",
          "commercial_language",
        ])
      );
    }
  });

  it("rejects unsupported numbers", () => {
    const rejected = validateOrganisationIntelligenceBrief(
      "Evidence suggests a 87 percent improvement across the sample.",
      [5, 12]
    );
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.reasons).toContain("unsupported_number");
    }
  });

  it("prompt builder receives aggregate fields only", () => {
    const prompt = read("lib/ai/organisation-intelligence-prompt.ts");
    expect(prompt).toContain("aggregated anonymised");
    expect(prompt).not.toContain("client_private_identities");
    expect(prompt).not.toContain("real_name");
    expect(prompt).toContain("Do not recommend Pridmora products");
  });
});

describe("organisation intelligence UI and navigation", () => {
  it("adds Organisation Intelligence to organisation navigation", () => {
    const nav = read("components/organisation/organisation-navigation.tsx");
    expect(nav).toContain('/organisation/intelligence');
    expect(nav).toContain("Intelligence");
  });

  it("renders the executive view sections", () => {
    const page = read("app/organisation/intelligence/page.tsx");
    expect(page).toContain("Executive brief");
    expect(page).toContain("Organisation overview");
    expect(page).toContain("Development Momentum");
    expect(page).toContain("Capability trends");
    expect(page).toContain("Emerging themes");
    expect(page).toContain("Priority areas");
    expect(page).toContain("Areas requiring attention");
    expect(page).toContain("org-intelligence-sr-only");
  });

  it("polishes empty-state hierarchy and reporting controls", () => {
    const page = read("app/organisation/intelligence/page.tsx");
    const css = read("app/identity-design-system.css");

    expect(page).toContain("Privacy protected");
    expect(page).toContain("org-intelligence-privacy-notice");
    expect(page).toContain('aria-label="Reporting controls"');
    expect(page).toContain("org-intelligence-controls");
    expect(page).toContain("Not yet generated");
    expect(page).toContain("Privacy threshold");
    expect(page).toContain(
      "A minimum of five contributing relationships helps reduce the risk of identifying individuals."
    );
    expect(page).toContain("Building organisation intelligence");
    expect(page).toContain(
      "Your organisation is beginning to build a clearer picture."
    );
    expect(page).toContain("Record development evidence");
    expect(page).toContain("Aggregate it safely");
    expect(page).toContain("Identify development patterns");
    expect(page).toContain("Support informed decisions");
    expect(page).toContain("Review coaching activity");
    expect(page).toContain('aria-label="About the privacy threshold"');

    const generateLabelCount = (
      page.match(/Generate intelligence/g) || []
    ).length;
    // Button label + accessible name for the ungenerated primary action.
    expect(generateLabelCount).toBe(2);
    expect(page).not.toContain("org-intelligence-empty__actions");
    expect(page).not.toContain("OrganisationInfoBanner");
    // No second dedicated generate control in the empty panel.
    expect(page).not.toMatch(
      /org-intelligence-empty-panel[\s\S]{0,800}Generate intelligence/
    );

    expect(css).toContain(".org-intelligence-controls");
    expect(css).toContain(".org-intelligence-empty-panel");
    expect(css).toContain(".org-intelligence-value__steps");
    expect(css).toContain("organisation-workspace--compact-header");
  });

  it("keeps relationship coaching workflow routes untouched", () => {
    expect(existsSync(join(root, "components/prepare/preparation-view.tsx"))).toBe(
      true
    );
    expect(existsSync(join(root, "app/organisation/intelligence/page.tsx"))).toBe(
      true
    );
  });
});

describe("organisation intelligence security and migration", () => {
  it("migration enables RLS and organisation isolation", () => {
    const sql = read(
      "supabase/migrations/20260804160000_organisation_intelligence.sql"
    );
    expect(sql).toContain("intelligence.organisation.read");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("organisation_intelligence_snapshots");
    expect(sql).toContain("aggregate_organisation_intelligence_sources");
    expect(sql).not.toMatch(/from\s+public\.client_private_identities/i);
    expect(sql).not.toMatch(/join\s+public\.client_private_identities/i);
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/truncate /i);
    expect(sql).toContain("Never returns private identity");
  });

  it("API derives organisation from auth context and never trusts browser org ids", () => {
    const generate = read(
      "app/api/organisations/intelligence/generate/route.ts"
    );
    const load = read("app/api/organisations/intelligence/route.ts");
    expect(generate).toContain("requireOrganisationPermission");
    expect(generate).toContain("intelligence.organisation.read");
    expect(generate).toContain("Never trust browser-supplied organisation IDs");
    expect(generate).toContain("organisation_intelligence_generated");
    expect(load).toContain("organisation_intelligence_viewed");
    expect(load).not.toMatch(/body\.organisationId|searchParams.get\(\"organisation/);
  });

  it("maps source aggregates without private fields", () => {
    const mapped = mapSourceAggregates({
      organisationId: "org-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      previousPeriodStart: "2025-10-01",
      previousPeriodEnd: "2025-12-31",
      activeRelationships: 3,
      conversations: 4,
      themeCandidates: [
        {
          themeKey: "confidence",
          relationshipId: "r1",
          sourceType: "intelligence_item",
        },
      ],
      hasEarlierPeriodActivity: false,
    });
    expect(mapped).not.toHaveProperty("email");
    expect(mapped).not.toHaveProperty("realName");
    expect(mapped.themeCandidates[0]).not.toHaveProperty("evidenceText");
  });

  it("deterministic brief stays evidence-led", () => {
    const view = buildOrganisationIntelligenceSnapshotView({
      id: "snap-2",
      organisationId: "org-1",
      organisationName: "Northwind",
      period: resolveOrganisationIntelligencePeriod({
        preset: "last_90_days",
        now: new Date("2026-08-04T12:00:00.000Z"),
      }),
      generatedAt: "2026-08-04T12:00:00.000Z",
      generatedBy: "user-1",
      aggregates: makeAggregates(),
    });
    const brief =
      view.executiveBrief ||
      buildDeterministicExecutiveBrief({
        organisationName: "Northwind",
        periodLabel: "Last 90 days",
        metrics: view.metrics,
        themes: view.themes,
        capabilities: view.capabilities,
        recommendations: view.recommendations,
        restrictedEvidenceExcluded: view.restrictedEvidenceExcluded,
      });
    expect(brief).toMatch(/Evidence suggests|There is not yet/i);
    expect(brief).not.toMatch(/this proves|guaranteed|buy/i);
  });
});
