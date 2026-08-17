import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  aggregateThemes,
  buildOrganisationIntelligenceSnapshotView,
  ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD,
  prevalenceDirectionFromCounts,
  resolveOrganisationIntelligencePeriod,
} from "@/lib/organisation-intelligence";
import type { OrganisationIntelligenceSourceAggregates } from "@/lib/organisation-intelligence";

const root = join(__dirname, "..");
const migrationPath =
  "supabase/migrations/20260816140000_org_intelligence_theme_prevalence_directions.sql";

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function baseAggregates(
  overrides: Partial<OrganisationIntelligenceSourceAggregates> = {}
): OrganisationIntelligenceSourceAggregates {
  return {
    organisationId: "org-uat",
    periodStart: "2026-05-19",
    periodEnd: "2026-08-16",
    previousPeriodStart: "2026-02-18",
    previousPeriodEnd: "2026-05-18",
    activeRelationships: 7,
    activePractitioners: 3,
    conversations: 6,
    previousConversations: 0,
    completedConversations: 6,
    previousCompletedConversations: 0,
    actionsTotal: 0,
    actionsCompleted: 0,
    previousActionsTotal: 0,
    previousActionsCompleted: 0,
    reflectionsCompleted: 0,
    previousReflectionsCompleted: 0,
    developmentUpdatesCompleted: 0,
    previousDevelopmentUpdatesCompleted: 0,
    evidenceItems: 20,
    previousEvidenceItems: 5,
    contributingRelationships: 6,
    themeCandidates: [],
    previousThemeCandidates: [],
    progressSignals: [],
    itemThemes: [],
    authorisedEvidenceCapabilities: [],
    previousAuthorisedEvidenceCapabilities: [],
    hasEarlierPeriodActivity: true,
    selfDevelopmentExcluded: true,
    ...overrides,
  };
}

describe("Gate 3.3B — organisation intelligence theme direction constraint", () => {
  it("migration allows prevalence directions and preserves legacy historical values", () => {
    const sql = read(migrationPath);
    expect(sql).toContain(
      "organisation_intelligence_themes_direction_check"
    );
    expect(sql).toContain("increasing_prevalence");
    expect(sql).toContain("decreasing_prevalence");
    expect(sql).toContain("unchanged_prevalence");
    expect(sql).toContain("insufficient_evidence");
    // Historical preserve — not current write semantics
    expect(sql).toContain("'stable'");
    expect(sql).toContain("'strengthening'");
    expect(sql).toContain("'requiring_attention'");
    expect(sql).toMatch(/drop constraint if exists organisation_intelligence_themes_direction_check/i);
  });

  it("current generation emits prevalence directions, never strengthening/requiring_attention", () => {
    expect(prevalenceDirectionFromCounts(7, 5, true)).toBe(
      "increasing_prevalence"
    );
    expect(prevalenceDirectionFromCounts(5, 7, true)).toBe(
      "decreasing_prevalence"
    );
    expect(prevalenceDirectionFromCounts(5, 5, true)).toBe(
      "unchanged_prevalence"
    );

    const themes = aggregateThemes({
      current: [1, 2, 3, 4, 5, 6, 7].map(n => ({
        themeKey: "accountability",
        relationshipId: `c${n}`,
        sourceType: "development_evidence",
      })),
      previous: [1, 2, 3, 4, 5].map(n => ({
        themeKey: "accountability",
        relationshipId: `p${n}`,
        sourceType: "development_evidence",
      })),
      hasEarlierPeriodActivity: true,
      threshold: ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD,
    }).themes;

    expect(themes[0]?.direction).toBe("increasing_prevalence");
    expect(themes.map(t => t.direction)).not.toContain("strengthening");
    expect(themes.map(t => t.direction)).not.toContain("requiring_attention");
    expect(themes.map(t => t.direction)).not.toContain("stable");
  });

  it("insufficient_evidence persists for suppressed and no-comparison reportable themes", () => {
    const suppressed = aggregateThemes({
      current: [1, 2, 3, 4].map(n => ({
        themeKey: "collaboration",
        relationshipId: `h${n}`,
        sourceType: "development_evidence",
      })),
      previous: [],
      hasEarlierPeriodActivity: true,
      threshold: ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD,
    }).themes;
    expect(suppressed[0]?.suppressed).toBe(true);
    expect(suppressed[0]?.direction).toBe("insufficient_evidence");

    const noComparison = aggregateThemes({
      current: [1, 2, 3, 4, 5].map(n => ({
        themeKey: "delegation",
        relationshipId: `h${n}`,
        sourceType: "development_evidence",
      })),
      previous: [],
      hasEarlierPeriodActivity: false,
      threshold: ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD,
    }).themes;
    expect(noComparison[0]?.suppressed).toBe(false);
    expect(noComparison[0]?.direction).toBe("insufficient_evidence");
  });

  it("buyer snapshot load path selects ready only — failed generations are ignored", () => {
    const repository = read("lib/organisation-intelligence/repository.ts");
    expect(repository).toMatch(
      /loadOrganisationIntelligenceSnapshot[\s\S]*?\.eq\("status", "ready"\)/
    );
    // History may list failed for audit, but current load is ready-only.
    expect(repository).toMatch(
      /\.in\("status", \["ready", "failed"\]\)/
    );
  });

  it("snapshot view does not surface suppressed themes or legacy progress labels", () => {
    const view = buildOrganisationIntelligenceSnapshotView({
      id: "snap-ready",
      organisationId: "org-uat",
      organisationName: "UAT-G34-ORG-DI",
      period: resolveOrganisationIntelligencePeriod({
        preset: "last_90_days",
        now: new Date("2026-08-16T12:00:00.000Z"),
      }),
      generatedAt: "2026-08-16T12:00:00.000Z",
      generatedBy: "lead",
      status: "ready",
      aggregates: baseAggregates({
        authorisedEvidenceCapabilities: [
          ...[1, 2, 3, 4, 5].map(n => ({
            capabilityKey: "delegation",
            contributorKey: `d${n}`,
            sourceType: "development_evidence",
          })),
          ...[1, 2, 3, 4].map(n => ({
            capabilityKey: "collaboration",
            contributorKey: `c${n}`,
            sourceType: "development_evidence",
          })),
        ],
        previousAuthorisedEvidenceCapabilities: [1, 2, 3, 4, 5].map(n => ({
          capabilityKey: "delegation",
          contributorKey: `d${n}`,
          sourceType: "development_evidence",
        })),
      }),
    });

    expect(view.themes.some(t => t.themeKey === "delegation")).toBe(true);
    expect(view.themes.some(t => t.themeKey === "collaboration")).toBe(false);
    expect(view.themes.every(t => !t.suppressed)).toBe(true);
    for (const theme of view.themes) {
      expect([
        "increasing_prevalence",
        "decreasing_prevalence",
        "unchanged_prevalence",
        "insufficient_evidence",
      ]).toContain(theme.direction);
      expect(theme.direction).not.toBe("strengthening");
      expect(theme.direction).not.toBe("requiring_attention");
    }
    expect(view.privacyThreshold).toBe(5);
    expect(JSON.stringify(view)).not.toContain("contributorKey");
  });

  it("API current snapshot load uses ready-only loader (failed cannot be buyer current)", () => {
    const route = read("app/api/organisations/intelligence/route.ts");
    expect(route).toContain("loadOrganisationIntelligenceSnapshot");
    expect(route).toContain("listOrganisationIntelligenceSnapshots");
  });
});
