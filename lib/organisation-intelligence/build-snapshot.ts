import { mapCapabilityTrends } from "@/lib/organisation-intelligence/capabilities";
import {
  buildAttentionAreas,
  buildCoachingImpact,
  buildDeterministicExecutiveBrief,
  buildEvidenceTraces,
  buildRecommendations,
  hasEnoughEvidenceForOrganisationView,
} from "@/lib/organisation-intelligence/compose";
import { calculateConfidenceLevel } from "@/lib/organisation-intelligence/confidence";
import {
  ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD,
  type ConfidenceLevel,
} from "@/lib/organisation-intelligence/constants";
import { buildOrganisationMetrics } from "@/lib/organisation-intelligence/metrics";
import { aggregateThemes } from "@/lib/organisation-intelligence/themes";
import type {
  OrganisationIntelligencePeriod,
  OrganisationIntelligenceSnapshotView,
  OrganisationIntelligenceSourceAggregates,
} from "@/lib/organisation-intelligence/types";

export function buildOrganisationIntelligenceSnapshotView(input: {
  id: string;
  organisationId: string;
  organisationName: string;
  period: OrganisationIntelligencePeriod;
  generatedAt: string;
  generatedBy: string | null;
  aggregates: OrganisationIntelligenceSourceAggregates;
  executiveBrief?: string | null;
  status?: OrganisationIntelligenceSnapshotView["status"];
  privacyThreshold?: number;
}): OrganisationIntelligenceSnapshotView {
  const threshold =
    input.privacyThreshold ?? ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD;
  const emptyState = !hasEnoughEvidenceForOrganisationView(
    input.aggregates,
    threshold
  );

  const metrics = buildOrganisationMetrics(input.aggregates, threshold);
  const themeResult = aggregateThemes({
    current: [
      ...input.aggregates.themeCandidates,
      ...input.aggregates.itemThemes,
    ],
    previous: input.aggregates.previousThemeCandidates,
    hasEarlierPeriodActivity: input.aggregates.hasEarlierPeriodActivity,
    threshold,
  });
  const visibleThemes = themeResult.themes.filter(theme => !theme.suppressed);
  const capabilities = mapCapabilityTrends({
    themes: themeResult.themes,
    progressSignals: input.aggregates.progressSignals,
    hasEarlierPeriodActivity: input.aggregates.hasEarlierPeriodActivity,
    threshold,
  });
  const recommendations = emptyState
    ? []
    : buildRecommendations({
        themes: themeResult.themes,
        capabilities,
        metrics,
      });
  const attentionAreas = emptyState
    ? []
    : buildAttentionAreas({
        themes: themeResult.themes,
        capabilities,
      });
  const coachingImpact = emptyState
    ? []
    : buildCoachingImpact({
        metrics,
        themes: themeResult.themes,
      });

  const confidenceLevel: ConfidenceLevel = emptyState
    ? "low"
    : calculateConfidenceLevel({
        evidenceCount: Math.max(
          input.aggregates.evidenceItems,
          input.aggregates.conversations,
          1
        ),
        relationshipCount: input.aggregates.contributingRelationships,
        sourceTypeCount: 3,
        multiPeriod: input.aggregates.hasEarlierPeriodActivity,
        consistentDirection: capabilities.some(
          capability =>
            !capability.suppressed &&
            (capability.direction === "strengthening" ||
              capability.direction === "stable")
        ),
        threshold,
      });

  const executiveBrief =
    input.executiveBrief ??
    (emptyState
      ? null
      : buildDeterministicExecutiveBrief({
          organisationName: input.organisationName,
          periodLabel: input.period.label,
          metrics,
          themes: themeResult.themes,
          capabilities,
          recommendations,
          restrictedEvidenceExcluded: themeResult.restrictedEvidenceExcluded,
        }));

  return {
    id: input.id,
    organisationId: input.organisationId,
    organisationName: input.organisationName,
    period: input.period,
    generatedAt: input.generatedAt,
    generatedBy: input.generatedBy,
    sourceRelationshipCount: input.aggregates.contributingRelationships,
    sourceConversationCount: input.aggregates.conversations,
    sourceEvidenceCount: input.aggregates.evidenceItems,
    confidenceLevel,
    executiveBrief,
    status: input.status ?? "ready",
    restrictedEvidenceExcluded: themeResult.restrictedEvidenceExcluded,
    privacyThreshold: threshold,
    metrics,
    themes: emptyState ? [] : visibleThemes,
    capabilities: emptyState
      ? capabilities.map(capability => ({
          ...capability,
          suppressed: true,
          direction: "insufficient_evidence",
          changeLabel: "Insufficient evidence",
        }))
      : capabilities,
    recommendations,
    attentionAreas,
    coachingImpact,
    evidenceTraces: emptyState
      ? []
      : buildEvidenceTraces({
          period: input.period,
          metrics,
          themes: themeResult.themes,
          capabilities,
          threshold,
        }),
    emptyState,
    insufficientEvidenceMessage: emptyState
      ? "Organisation Intelligence becomes available when enough anonymised coaching evidence has been recorded to report safely."
      : null,
  };
}
