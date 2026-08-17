import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildDeterministicExecutiveBrief,
  buildOrganisationIntelligenceSnapshotView,
  ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD,
  resolveOrganisationIntelligencePeriod,
  validateOrganisationIntelligenceBrief,
} from "@/lib/organisation-intelligence";
import { buildOrganisationIntelligencePromptInput } from "@/lib/ai/organisation-intelligence-prompt";
import type { OrganisationIntelligenceSourceAggregates } from "@/lib/organisation-intelligence";

const root = join(__dirname, "..");

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
    selfDevelopmentExcluded: true,
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
      ...[1, 2, 3, 4, 5].map(n => ({
        capabilityKey: "psychological_safety",
        contributorKey: `p${n}`,
        sourceType: "development_evidence",
      })),
      ...[1, 2, 3, 4, 5].map(n => ({
        capabilityKey: "accountability",
        contributorKey: `a${n}`,
        sourceType: "development_evidence",
      })),
    ],
    previousAuthorisedEvidenceCapabilities: [1, 2, 3, 4, 5].map(n => ({
      capabilityKey: "accountability",
      contributorKey: `a${n}`,
      sourceType: "development_evidence",
    })),
    hasEarlierPeriodActivity: true,
    ...overrides,
  };
}

describe("Gate 3.4 — buyer narrative safety", () => {
  it("A/H: suppressed themes cannot appear in executive narrative", () => {
    const view = buildOrganisationIntelligenceSnapshotView({
      id: "snap",
      organisationId: "org-uat",
      organisationName: "UAT-G34-ORG-DI",
      period: resolveOrganisationIntelligencePeriod({
        preset: "last_90_days",
        now: new Date("2026-08-16T12:00:00.000Z"),
      }),
      generatedAt: "2026-08-16T12:00:00.000Z",
      generatedBy: "lead",
      aggregates: baseAggregates(),
    });

    expect(view.themes.some(t => t.themeKey === "collaboration")).toBe(false);
    expect(view.executiveBrief ?? "").not.toMatch(/Collaboration and Alignment/i);
    expect(view.executiveBrief ?? "").not.toMatch(/\bCollaboration\b/);
  });

  it("B: foundation mappings cannot introduce theme-like foundation labels into prose", () => {
    const view = buildOrganisationIntelligenceSnapshotView({
      id: "snap",
      organisationId: "org-uat",
      organisationName: "UAT-G34-ORG-DI",
      period: resolveOrganisationIntelligencePeriod({
        preset: "last_90_days",
        now: new Date("2026-08-16T12:00:00.000Z"),
      }),
      generatedAt: "2026-08-16T12:00:00.000Z",
      generatedBy: "lead",
      aggregates: baseAggregates({
        authorisedEvidenceCapabilities: [1, 2, 3, 4, 5].map(n => ({
          capabilityKey: "delegation",
          contributorKey: `d${n}`,
          sourceType: "development_evidence",
        })),
        previousAuthorisedEvidenceCapabilities: [],
        hasEarlierPeriodActivity: false,
      }),
    });

    const brief = view.executiveBrief ?? "";
    expect(brief).toMatch(/Delegation/i);
    expect(brief).not.toMatch(/Collaboration and Alignment/i);
    expect(brief).not.toMatch(/Accountability and Ownership/i);
  });

  it("C/D: narrative source counts equal snapshot source counts; development_conversations fallback", () => {
    const view = buildOrganisationIntelligenceSnapshotView({
      id: "snap",
      organisationId: "org-uat",
      organisationName: "UAT-G34-ORG-DI",
      period: resolveOrganisationIntelligencePeriod({
        preset: "last_90_days",
        now: new Date("2026-08-16T12:00:00.000Z"),
      }),
      generatedAt: "2026-08-16T12:00:00.000Z",
      generatedBy: "lead",
      aggregates: baseAggregates(),
    });

    expect(view.sourceRelationshipCount).toBe(6);
    expect(view.sourceConversationCount).toBe(6);
    expect(view.sourceEvidenceCount).toBe(20);
    expect(view.executiveBrief ?? "").toContain(
      "6 contributing relationships, 6 conversations, 20 reviewed evidence items"
    );

    const briefFromFallback = buildDeterministicExecutiveBrief({
      organisationName: "UAT",
      periodLabel: "Last 90 days",
      metrics: view.metrics,
      themes: view.themes,
      recommendations: [],
      restrictedEvidenceExcluded: false,
      confidenceLevel: "low",
      // omit sourceConversationCount to force metric fallback
      sourceRelationshipCount: 6,
      sourceEvidenceCount: 20,
    });
    expect(briefFromFallback).toContain(
      "6 contributing relationships, 6 conversations, 20 reviewed evidence items"
    );
    expect(read("lib/organisation-intelligence/compose.ts")).toContain(
      'metricKey === "development_conversations"'
    );
    expect(read("lib/organisation-intelligence/compose.ts")).not.toContain(
      "conversations_completed"
    );
  });

  it("E/F/G: prevalence and posture language stays evidence-faithful", () => {
    const view = buildOrganisationIntelligenceSnapshotView({
      id: "snap",
      organisationId: "org-uat",
      organisationName: "UAT-G34-ORG-DI",
      period: resolveOrganisationIntelligencePeriod({
        preset: "last_90_days",
        now: new Date("2026-08-16T12:00:00.000Z"),
      }),
      generatedAt: "2026-08-16T12:00:00.000Z",
      generatedBy: "lead",
      aggregates: baseAggregates(),
    });

    const brief = view.executiveBrief ?? "";
    expect(brief).not.toMatch(/behaviours are strengthening/i);
    expect(brief).not.toMatch(/\bimproving\b/i);
    expect(brief).not.toMatch(/recurring difficulty/i);
    expect(brief).not.toMatch(/comparatively strong/i);
    expect(brief).not.toMatch(/requiring attention/i);
    expect(brief).toMatch(/emerging organisational development theme|Evidence posture remains limited \(emerging\)/i);
    expect(brief).toMatch(/not proof of behavioural improvement or deterioration/i);
    expect(brief).toMatch(/theme to monitor|Themes to monitor/i);
  });

  it("I/K: AI prompt builder receives Lead-safe payload only", () => {
    const prompt = buildOrganisationIntelligencePromptInput({
      organisationName: "UAT",
      periodLabel: "Last 90 days",
      comparisonLabel: "Compared with earlier",
      comparisonAvailable: true,
      confidenceLevel: "low",
      sourceRelationshipCount: 6,
      sourceConversationCount: 6,
      sourceEvidenceCount: 20,
      restrictedEvidenceExcluded: false,
      privacyThreshold: ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD,
      metrics: [],
      themes: [
        {
          key: "delegation",
          label: "Delegation",
          direction: "increasing_prevalence",
          confidence: "low",
          evidenceCount: 5,
          relationshipCount: 5,
          summary: "safe",
          evidencePosture: "emerging",
        },
      ],
      capabilities: [],
      recommendations: [],
      visibleThemeLabels: ["Delegation"],
    });

    expect(prompt).toContain("Visible themes only");
    expect(prompt).toContain("Delegation");
    expect(prompt).toContain("Foundation / capability category roll-ups are excluded");
    expect(prompt).not.toContain("contributorKey");
    expect(prompt).not.toContain("md5");
    expect(prompt).not.toMatch(/session notes/i);
  });

  it("J: AI validation rejects forbidden progress/difficulty and non-visible foundation labels", () => {
    const badProgress = validateOrganisationIntelligenceBrief(
      "Evidence suggests behaviours are strengthening across the organisation.\n\nSecond.\n\nThird.\n\nFourth.",
      [6, 20],
      { visibleThemeLabels: ["Delegation"] }
    );
    expect(badProgress.ok).toBe(false);
    if (!badProgress.ok) {
      expect(badProgress.reasons).toContain(
        "forbidden_progress_or_difficulty_language"
      );
    }

    const badDifficulty = validateOrganisationIntelligenceBrief(
      "Delegation continues to show recurring difficulty in the available evidence.\n\nSecond.\n\nThird.\n\nFourth.",
      [6],
      { visibleThemeLabels: ["Delegation"] }
    );
    expect(badDifficulty.ok).toBe(false);

    const foundationLeak = validateOrganisationIntelligenceBrief(
      "Collaboration and Alignment appears across more relationships.\n\nSecond.\n\nThird.\n\nFourth.",
      [5],
      { visibleThemeLabels: ["Delegation"] }
    );
    expect(foundationLeak.ok).toBe(false);
    if (!foundationLeak.ok) {
      expect(foundationLeak.reasons).toContain(
        "foundation_or_non_visible_theme_label"
      );
    }

    const ok = validateOrganisationIntelligenceBrief(
      "Delegation appears across more reportable development relationships than previously.\n\nSecond paragraph.\n\nThird paragraph.\n\nFourth paragraph.",
      [5],
      { visibleThemeLabels: ["Delegation"] }
    );
    expect(ok.ok).toBe(true);
  });

  it("L: structured aggregation/threshold behaviour unchanged", () => {
    const view = buildOrganisationIntelligenceSnapshotView({
      id: "snap",
      organisationId: "org-uat",
      organisationName: "UAT-G34-ORG-DI",
      period: resolveOrganisationIntelligencePeriod({
        preset: "last_90_days",
        now: new Date("2026-08-16T12:00:00.000Z"),
      }),
      generatedAt: "2026-08-16T12:00:00.000Z",
      generatedBy: "lead",
      aggregates: baseAggregates(),
    });

    expect(view.privacyThreshold).toBe(5);
    expect(view.themes.some(t => t.themeKey === "delegation")).toBe(true);
    expect(view.themes.some(t => t.themeKey === "collaboration")).toBe(false);
    expect(
      view.themes.find(t => t.themeKey === "delegation")?.relationshipCount
    ).toBe(5);
  });
});
