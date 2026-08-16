import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  aggregateThemes,
  buildOrganisationIntelligenceExportHtml,
  buildOrganisationIntelligenceSnapshotView,
  classifyOrganisationEvidenceSufficiency,
  filterToKnownCatalogueThemeCandidates,
  mapAuthorisedCapabilitiesToThemeCandidates,
  mapSourceAggregates,
  prevalenceDirectionFromCounts,
  resolveOrganisationIntelligencePeriod,
  ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD,
} from "@/lib/organisation-intelligence";
import {
  canReadOrganisationIntelligence,
  hasPermission,
} from "@/lib/organisations/permissions";
import type { OrganisationIntelligenceSourceAggregates } from "@/lib/organisation-intelligence";

const root = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function baseAggregates(
  overrides: Partial<OrganisationIntelligenceSourceAggregates> = {}
): OrganisationIntelligenceSourceAggregates {
  return {
    organisationId: "org-1",
    periodStart: "2026-05-06",
    periodEnd: "2026-08-03",
    previousPeriodStart: "2026-02-05",
    previousPeriodEnd: "2026-05-05",
    selfDevelopmentExcluded: true,
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
    evidenceItems: 12,
    previousEvidenceItems: 8,
    contributingRelationships: 8,
    themeCandidates: [],
    previousThemeCandidates: [],
    progressSignals: [],
    itemThemes: [],
    authorisedEvidenceCapabilities: [],
    previousAuthorisedEvidenceCapabilities: [],
    hasEarlierPeriodActivity: true,
    ...overrides,
  };
}

describe("Gate 3.2B organisational DI bridge", () => {
  it("maps authorised capability keys to catalogue themes and drops unmapped", () => {
    const mapped = mapAuthorisedCapabilitiesToThemeCandidates([
      {
        capabilityKey: "delegation",
        contributorKey: "hash-a",
        sourceType: "development_evidence",
      },
      {
        capabilityKey: "strategic_thinking",
        contributorKey: "hash-b",
        sourceType: "development_evidence",
      },
      {
        capabilityKey: "proposed-junk",
        contributorKey: "hash-c",
        sourceType: "development_evidence",
      },
    ]);
    expect(mapped).toEqual([
      {
        themeKey: "delegation",
        relationshipId: "hash-a",
        sourceType: "development_evidence",
        occurredAt: null,
        category: null,
      },
    ]);
  });

  it("does not emit organisational signals for unmapped free text", () => {
    expect(
      filterToKnownCatalogueThemeCandidates([
        {
          themeKey: "completely novel free text theme",
          relationshipId: "h1",
          sourceType: "client_item_theme",
        },
        {
          themeKey: "delegation",
          relationshipId: "h2",
          sourceType: "legacy_intelligence_item",
        },
      ])
    ).toEqual([
      {
        themeKey: "delegation",
        relationshipId: "h2",
        sourceType: "legacy_intelligence_item",
      },
    ]);
  });

  it("authorisation: only approved/edited include paths map through living feed", () => {
    // Living mapping itself has no review_status — RPC filters. App must not
    // invent themes from arbitrary text.
    const migration = read(
      "supabase/migrations/20260816120000_org_di_living_evidence_bridge.sql"
    );
    expect(migration).toContain("include_in_intelligence = true");
    expect(migration).toContain("review_status in ('approved', 'edited')");
    expect(migration).toContain("authorisedEvidenceCapabilities");
    expect(migration).not.toContain("persistAiProposals");
    expect(migration).toMatch(/development_evidence/);
  });

  it("revocation: excluding evidence removes contribution on regenerate", () => {
    const approved = baseAggregates({
      authorisedEvidenceCapabilities: [1, 2, 3, 4, 5].map(n => ({
        capabilityKey: "delegation",
        contributorKey: `hash-${n}`,
        sourceType: "development_evidence",
      })),
    });
    const withTheme = buildOrganisationIntelligenceSnapshotView({
      id: "s1",
      organisationId: "org-1",
      organisationName: "Acme",
      period: resolveOrganisationIntelligencePeriod({
        preset: "last_90_days",
        now: new Date("2026-08-04T12:00:00.000Z"),
      }),
      generatedAt: "2026-08-04T12:00:00.000Z",
      generatedBy: null,
      aggregates: approved,
    });
    expect(withTheme.themes.some(t => t.themeKey === "delegation")).toBe(true);

    const revoked = buildOrganisationIntelligenceSnapshotView({
      id: "s2",
      organisationId: "org-1",
      organisationName: "Acme",
      period: resolveOrganisationIntelligencePeriod({
        preset: "last_90_days",
        now: new Date("2026-08-04T12:00:00.000Z"),
      }),
      generatedAt: "2026-08-04T12:05:00.000Z",
      generatedBy: null,
      aggregates: baseAggregates({
        authorisedEvidenceCapabilities: [],
      }),
    });
    expect(revoked.themes.some(t => t.themeKey === "delegation")).toBe(false);
  });

  it("threshold: 4 suppressed, 5 and above visible", () => {
    const four = aggregateThemes({
      current: [1, 2, 3, 4].map(n => ({
        themeKey: "delegation",
        relationshipId: `h${n}`,
        sourceType: "development_evidence",
      })),
      previous: [],
      hasEarlierPeriodActivity: false,
      threshold: ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD,
    }).themes;
    expect(four[0]?.suppressed).toBe(true);

    const five = aggregateThemes({
      current: [1, 2, 3, 4, 5].map(n => ({
        themeKey: "delegation",
        relationshipId: `h${n}`,
        sourceType: "development_evidence",
      })),
      previous: [],
      hasEarlierPeriodActivity: false,
      threshold: 5,
    }).themes;
    expect(five[0]?.suppressed).toBe(false);
    expect(five[0]?.metadata.evidencePosture).toBe("emerging");
  });

  it("semantics: increasing prevalence is never behavioural strengthening", () => {
    expect(prevalenceDirectionFromCounts(8, 3, true)).toBe(
      "increasing_prevalence"
    );
    expect(prevalenceDirectionFromCounts(3, 8, true)).toBe(
      "decreasing_prevalence"
    );
    expect(prevalenceDirectionFromCounts(5, 5, true)).toBe(
      "unchanged_prevalence"
    );

    const themes = aggregateThemes({
      current: [1, 2, 3, 4, 5, 6, 7].map(n => ({
        themeKey: "delegation",
        relationshipId: `c${n}`,
        sourceType: "development_evidence",
      })),
      previous: [1, 2, 3, 4, 5].map(n => ({
        themeKey: "delegation",
        relationshipId: `p${n}`,
        sourceType: "development_evidence",
      })),
      hasEarlierPeriodActivity: true,
      threshold: 5,
    }).themes;
    expect(themes[0]?.direction).toBe("increasing_prevalence");
    expect(themes[0]?.direction).not.toBe("strengthening");
    expect(themes[0]?.summary ?? "").not.toMatch(/behavioural progress/i);
  });

  it("privacy: Lead snapshot and export never include hashes, IDs or narrative", () => {
    const view = buildOrganisationIntelligenceSnapshotView({
      id: "snap",
      organisationId: "org-1",
      organisationName: "Acme",
      period: resolveOrganisationIntelligencePeriod({
        preset: "last_90_days",
        now: new Date("2026-08-04T12:00:00.000Z"),
      }),
      generatedAt: "2026-08-04T12:00:00.000Z",
      generatedBy: "user-1",
      aggregates: baseAggregates({
        authorisedEvidenceCapabilities: [1, 2, 3, 4, 5].map(n => ({
          capabilityKey: "delegation",
          contributorKey: `md5-secret-${n}`,
          sourceType: "development_evidence",
        })),
      }),
    });
    const json = JSON.stringify(view);
    expect(json).not.toContain("md5-secret");
    expect(json).not.toContain("contributorKey");
    expect(json).not.toMatch(/session notes/i);

    const html = buildOrganisationIntelligenceExportHtml(view);
    expect(html).not.toContain("md5-secret");
    expect(html).not.toContain("contributorKey");
    expect(html).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  });

  it("security: only oversight roles read organisation intelligence", () => {
    expect(canReadOrganisationIntelligence("oversight")).toBe(true);
    expect(canReadOrganisationIntelligence("practitioner")).toBe(false);
    expect(hasPermission("practitioner", "intelligence.organisation.read")).toBe(
      false
    );
  });

  it("insufficient evidence: activity without authorised themes", () => {
    const aggregates = baseAggregates({
      authorisedEvidenceCapabilities: [],
      themeCandidates: [],
      itemThemes: [],
      conversations: 20,
      contributingRelationships: 8,
    });
    const themeResult = aggregateThemes({
      current: [],
      previous: [],
      hasEarlierPeriodActivity: true,
      threshold: 5,
    });
    expect(
      classifyOrganisationEvidenceSufficiency(aggregates, themeResult)
    ).toBe("activity_without_authorised_themes");

    const view = buildOrganisationIntelligenceSnapshotView({
      id: "empty-themes",
      organisationId: "org-1",
      organisationName: "Acme",
      period: resolveOrganisationIntelligencePeriod({
        preset: "last_90_days",
        now: new Date("2026-08-04T12:00:00.000Z"),
      }),
      generatedAt: "2026-08-04T12:00:00.000Z",
      generatedBy: null,
      aggregates,
    });
    expect(view.emptyState).toBe(false);
    expect(view.themes).toEqual([]);
    expect(view.insufficientEvidenceMessage).toMatch(/authorised/i);
  });

  it("activity momentum is framed as activity not capability progress", () => {
    const view = buildOrganisationIntelligenceSnapshotView({
      id: "m",
      organisationId: "org-1",
      organisationName: "Acme",
      period: resolveOrganisationIntelligencePeriod({
        preset: "last_90_days",
        now: new Date("2026-08-04T12:00:00.000Z"),
      }),
      generatedAt: "2026-08-04T12:00:00.000Z",
      generatedBy: null,
      aggregates: baseAggregates(),
    });
    const momentum = view.metrics.find(m => m.metricKey === "development_momentum");
    expect(momentum?.metricLabel).toMatch(/Activity/i);
    expect(momentum?.methodology ?? "").toMatch(/not a measure of behavioural progress/i);
  });

  it("maps RPC payload living capability rows without exposing them on Lead view", () => {
    const aggregates = mapSourceAggregates({
      organisationId: "org-1",
      periodStart: "2026-05-06",
      periodEnd: "2026-08-03",
      previousPeriodStart: "2026-02-05",
      previousPeriodEnd: "2026-05-05",
      selfDevelopmentExcluded: true,
      authorisedEvidenceCapabilities: [
        {
          capabilityKey: "collaboration",
          contributorKey: "abc",
          sourceType: "development_evidence",
        },
      ],
      themeCandidates: [],
      previousThemeCandidates: [],
      itemThemes: [],
      progressSignals: [],
      hasEarlierPeriodActivity: false,
      conversations: 10,
      contributingRelationships: 6,
    });
    expect(aggregates.authorisedEvidenceCapabilities?.[0]?.contributorKey).toBe(
      "abc"
    );
    // Contributor keys stay on aggregates for server counting only; Lead view strips them.
    const view = buildOrganisationIntelligenceSnapshotView({
      id: "x",
      organisationId: "org-1",
      organisationName: "Acme",
      period: resolveOrganisationIntelligencePeriod({
        preset: "last_90_days",
        now: new Date("2026-08-04T12:00:00.000Z"),
      }),
      generatedAt: "2026-08-04T12:00:00.000Z",
      generatedBy: null,
      aggregates: {
        ...aggregates,
        conversations: 20,
        contributingRelationships: 8,
        authorisedEvidenceCapabilities: [1, 2, 3, 4, 5].map(n => ({
          capabilityKey: "collaboration",
          contributorKey: `abc${n}`,
          sourceType: "development_evidence",
        })),
      },
    });
    expect(JSON.stringify(view)).not.toContain("abc1");
  });

  it("does not revive intelligence_items generation and keeps Manager DI separate", () => {
    expect(read("app/api/intelligence/interpret/route.ts")).toContain("410");
    expect(
      read("lib/manager-development-intelligence/constants.ts")
    ).toContain("MANAGER_DEVELOPMENT_PRIVACY_THRESHOLD");
    expect(read("components/today-view.tsx")).toContain("ManagerCommandCentre");
  });

  it("profile themes deferred: no development_profiles jsonb theme extraction in RPC", () => {
    const migration = read(
      "supabase/migrations/20260816120000_org_di_living_evidence_bridge.sql"
    );
    expect(migration).not.toContain("development_profiles");
    expect(migration).not.toContain("emerging_themes");
  });
});
