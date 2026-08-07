import {
  MOMENTUM_METHODOLOGY,
  NO_COMPARISON_COPY,
  ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD,
  type ConfidenceLevel,
} from "@/lib/organisation-intelligence/constants";
import { calculateConfidenceLevel } from "@/lib/organisation-intelligence/confidence";
import {
  calculateDevelopmentMomentum,
  compareNumericDirection,
  rateFromCounts,
} from "@/lib/organisation-intelligence/momentum";
import type {
  MetricView,
  OrganisationIntelligenceSourceAggregates,
} from "@/lib/organisation-intelligence/types";

function countMetric(input: {
  key: string;
  label: string;
  value: number;
  previous: number | null;
  comparisonAvailable: boolean;
  evidenceCount: number;
  relationshipCount: number;
  confidenceLevel: ConfidenceLevel;
}): MetricView {
  const direction = compareNumericDirection(
    input.value,
    input.previous,
    input.comparisonAvailable
  );
  return {
    metricKey: input.key,
    metricLabel: input.label,
    metricValue: input.value,
    previousValue: input.comparisonAvailable ? input.previous : null,
    direction,
    confidenceLevel: input.confidenceLevel,
    evidenceCount: input.evidenceCount,
    relationshipCount: input.relationshipCount,
    suppressed: false,
    displayValue: String(input.value),
    comparisonAvailable: input.comparisonAvailable,
    metadata: {},
  };
}

export function buildOrganisationMetrics(
  aggregates: OrganisationIntelligenceSourceAggregates,
  threshold: number = ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD
): MetricView[] {
  const comparisonAvailable = aggregates.hasEarlierPeriodActivity;
  const relationshipCount = aggregates.contributingRelationships;
  const baseConfidence = calculateConfidenceLevel({
    evidenceCount: Math.max(
      aggregates.conversations,
      aggregates.evidenceItems,
      1
    ),
    relationshipCount: Math.max(relationshipCount, 1),
    sourceTypeCount: 2,
    multiPeriod: comparisonAvailable,
    threshold,
  });

  const actionRate = rateFromCounts(
    aggregates.actionsCompleted,
    aggregates.actionsTotal
  );
  const previousActionRate = rateFromCounts(
    aggregates.previousActionsCompleted,
    aggregates.previousActionsTotal
  );
  const reflectionRate =
    aggregates.conversations > 0
      ? rateFromCounts(
          aggregates.reflectionsCompleted,
          aggregates.conversations
        )
      : null;
  const previousReflectionRate =
    aggregates.previousConversations > 0
      ? rateFromCounts(
          aggregates.previousReflectionsCompleted,
          aggregates.previousConversations
        )
      : null;

  const momentum = calculateDevelopmentMomentum({
    completedConversations: aggregates.completedConversations,
    completedActions: aggregates.actionsCompleted,
    completedReflections: aggregates.reflectionsCompleted,
    developmentUpdates: aggregates.developmentUpdatesCompleted,
    evidenceItems: aggregates.evidenceItems,
    previousCompletedConversations: aggregates.previousCompletedConversations,
    previousCompletedActions: aggregates.previousActionsCompleted,
    previousCompletedReflections: aggregates.previousReflectionsCompleted,
    previousDevelopmentUpdates: aggregates.previousDevelopmentUpdatesCompleted,
    previousEvidenceItems: aggregates.previousEvidenceItems,
    hasEarlierPeriodActivity: comparisonAvailable,
  });

  const metrics: MetricView[] = [
    countMetric({
      key: "active_relationships",
      label: "Active relationships",
      value: aggregates.activeRelationships,
      previous: null,
      comparisonAvailable: false,
      evidenceCount: aggregates.activeRelationships,
      relationshipCount: aggregates.activeRelationships,
      confidenceLevel: "high",
    }),
    countMetric({
      key: "active_practitioners",
      label: "Active practitioners",
      value: aggregates.activePractitioners,
      previous: null,
      comparisonAvailable: false,
      evidenceCount: aggregates.activePractitioners,
      relationshipCount: aggregates.activeRelationships,
      confidenceLevel: "high",
    }),
    countMetric({
      key: "development_conversations",
      label: "Development conversations",
      value: aggregates.conversations,
      previous: aggregates.previousConversations,
      comparisonAvailable,
      evidenceCount: aggregates.conversations,
      relationshipCount,
      confidenceLevel: baseConfidence,
    }),
    countMetric({
      key: "evidence_items",
      label: "Evidence items",
      value: aggregates.evidenceItems,
      previous: aggregates.previousEvidenceItems,
      comparisonAvailable,
      evidenceCount: aggregates.evidenceItems,
      relationshipCount,
      confidenceLevel: baseConfidence,
    }),
    {
      metricKey: "action_completion_rate",
      metricLabel: "Action completion rate",
      metricValue: actionRate,
      previousValue: comparisonAvailable ? previousActionRate : null,
      direction: compareNumericDirection(
        actionRate,
        previousActionRate,
        comparisonAvailable
      ),
      confidenceLevel: calculateConfidenceLevel({
        evidenceCount: aggregates.actionsTotal,
        relationshipCount,
        sourceTypeCount: 1,
        multiPeriod: comparisonAvailable,
        threshold,
      }),
      evidenceCount: aggregates.actionsTotal,
      relationshipCount,
      suppressed: aggregates.actionsTotal < threshold,
      displayValue:
        aggregates.actionsTotal < threshold
          ? "Not enough evidence to report safely."
          : actionRate == null
            ? "Not enough evidence to report safely."
            : `${actionRate}%`,
      comparisonAvailable,
      metadata: {
        completed: aggregates.actionsCompleted,
        total: aggregates.actionsTotal,
      },
    },
    {
      metricKey: "reflection_completion_rate",
      metricLabel: "Reflection completion rate",
      metricValue: reflectionRate,
      previousValue: comparisonAvailable ? previousReflectionRate : null,
      direction: compareNumericDirection(
        reflectionRate,
        previousReflectionRate,
        comparisonAvailable
      ),
      confidenceLevel: calculateConfidenceLevel({
        evidenceCount: aggregates.conversations,
        relationshipCount,
        sourceTypeCount: 1,
        multiPeriod: comparisonAvailable,
        threshold,
      }),
      evidenceCount: aggregates.reflectionsCompleted,
      relationshipCount,
      suppressed: aggregates.conversations < threshold,
      displayValue:
        aggregates.conversations < threshold || reflectionRate == null
          ? "Not enough evidence to report safely."
          : `${reflectionRate}%`,
      comparisonAvailable,
      metadata: {
        completed: aggregates.reflectionsCompleted,
        conversations: aggregates.conversations,
      },
    },
    countMetric({
      key: "development_updates_completed",
      label: "Development updates completed",
      value: aggregates.developmentUpdatesCompleted,
      previous: aggregates.previousDevelopmentUpdatesCompleted,
      comparisonAvailable,
      evidenceCount: aggregates.developmentUpdatesCompleted,
      relationshipCount,
      confidenceLevel: baseConfidence,
    }),
    {
      metricKey: "development_momentum",
      metricLabel: "Development Momentum",
      metricValue: momentum.value,
      previousValue: momentum.previousValue,
      direction: momentum.direction,
      confidenceLevel: baseConfidence,
      evidenceCount:
        aggregates.completedConversations +
        aggregates.actionsCompleted +
        aggregates.reflectionsCompleted +
        aggregates.developmentUpdatesCompleted +
        aggregates.evidenceItems,
      relationshipCount,
      suppressed: relationshipCount < threshold,
      displayValue:
        relationshipCount < threshold
          ? "Not enough evidence to report safely."
          : String(momentum.value),
      comparisonAvailable: momentum.comparisonAvailable,
      methodology: MOMENTUM_METHODOLOGY,
      metadata: {
        components: momentum.components,
        supportingCopy:
          "A directional measure of sustained coaching activity, action and recorded development.",
        noComparisonCopy: momentum.comparisonAvailable
          ? null
          : NO_COMPARISON_COPY,
      },
    },
  ];

  return metrics;
}
