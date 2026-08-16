import { mapCapabilityTrends } from "@/lib/organisation-intelligence/capabilities";
import {
  ACTIVITY_WITHOUT_AUTHORISED_THEMES_COPY,
  BELOW_THEME_THRESHOLD_COPY,
  ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD,
  type ConfidenceLevel,
} from "@/lib/organisation-intelligence/constants";
import {
  buildAttentionAreas,
  buildCoachingImpact,
  buildDeterministicExecutiveBrief,
  buildEvidenceTraces,
  buildRecommendations,
  classifyOrganisationEvidenceSufficiency,
  hasEnoughEvidenceForOrganisationView,
} from "@/lib/organisation-intelligence/compose";
import { calculateConfidenceLevel } from "@/lib/organisation-intelligence/confidence";
import {
  filterToKnownCatalogueThemeCandidates,
  mapAuthorisedCapabilitiesToThemeCandidates,
} from "@/lib/organisation-intelligence/living-theme-signals";
import { buildOrganisationMetrics } from "@/lib/organisation-intelligence/metrics";
import { aggregateThemes } from "@/lib/organisation-intelligence/themes";
import type {
  OrganisationIntelligencePeriod,
  OrganisationIntelligenceSnapshotView,
  OrganisationIntelligenceSourceAggregates,
} from "@/lib/organisation-intelligence/types";

function resolveLivingThemeCandidates(
  aggregates: OrganisationIntelligenceSourceAggregates
): {
  current: ReturnType<typeof mapAuthorisedCapabilitiesToThemeCandidates>;
  previous: ReturnType<typeof mapAuthorisedCapabilitiesToThemeCandidates>;
} {
  const livingCurrent = mapAuthorisedCapabilitiesToThemeCandidates(
    aggregates.authorisedEvidenceCapabilities ?? []
  );
  const livingPrevious = mapAuthorisedCapabilitiesToThemeCandidates(
    aggregates.previousAuthorisedEvidenceCapabilities ?? []
  );

  // Legacy intelligence_items + client_items themes: known catalogue keys only.
  const legacyCurrent = filterToKnownCatalogueThemeCandidates([
    ...aggregates.themeCandidates,
    ...aggregates.itemThemes,
  ]);
  const legacyPrevious = filterToKnownCatalogueThemeCandidates(
    aggregates.previousThemeCandidates
  );

  return {
    current: [...livingCurrent, ...legacyCurrent],
    previous: [...livingPrevious, ...legacyPrevious],
  };
}

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
  const activityReady = hasEnoughEvidenceForOrganisationView(
    input.aggregates,
    threshold
  );

  const livingThemes = resolveLivingThemeCandidates(input.aggregates);
  const metrics = buildOrganisationMetrics(input.aggregates, threshold);
  const themeResult = aggregateThemes({
    current: livingThemes.current,
    previous: livingThemes.previous,
    hasEarlierPeriodActivity: input.aggregates.hasEarlierPeriodActivity,
    threshold,
  });
  const sufficiency = classifyOrganisationEvidenceSufficiency(
    input.aggregates,
    themeResult,
    threshold
  );
  const visibleThemes = themeResult.themes.filter(theme => !theme.suppressed);
  const emptyState = !activityReady;

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
            (capability.direction === "increasing_prevalence" ||
              capability.direction === "unchanged_prevalence" ||
              capability.direction === "decreasing_prevalence")
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

  let insufficientEvidenceMessage: string | null = null;
  if (emptyState) {
    insufficientEvidenceMessage =
      "People Development Intelligence becomes available when enough anonymised authorised development evidence has been recorded to report safely.";
  } else if (sufficiency === "activity_without_authorised_themes") {
    insufficientEvidenceMessage = ACTIVITY_WITHOUT_AUTHORISED_THEMES_COPY;
  } else if (
    sufficiency === "below_theme_threshold" &&
    visibleThemes.length === 0
  ) {
    insufficientEvidenceMessage = BELOW_THEME_THRESHOLD_COPY;
  }

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
    insufficientEvidenceMessage,
  };
}
