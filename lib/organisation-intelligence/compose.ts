import type { OrganisationIntelligenceSourceAggregates } from "@/lib/organisation-intelligence/types";
import type {
  AttentionAreaView,
  CapabilityTrendView,
  CoachingImpactView,
  EvidenceTrace,
  MetricView,
  RecommendationView,
  ThemeView,
} from "@/lib/organisation-intelligence/types";
import type { OrganisationIntelligencePeriod } from "@/lib/organisation-intelligence/types";
import { confidenceBasis } from "@/lib/organisation-intelligence/confidence";
import { ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD } from "@/lib/organisation-intelligence/constants";
import { buildPremiumExecutiveBrief } from "@/lib/development-evidence/executive-brief";

export function buildRecommendations(input: {
  themes: ThemeView[];
  capabilities: CapabilityTrendView[];
  metrics: MetricView[];
}): RecommendationView[] {
  const recommendations: RecommendationView[] = [];

  const risingThemes = input.themes
    .filter(
      theme =>
        !theme.suppressed && theme.direction === "increasing_prevalence"
    )
    .slice(0, 2);

  for (const theme of risingThemes) {
    recommendations.push({
      priority: recommendations.length + 1,
      title: `${theme.themeLabel} is appearing more widely`,
      rationale: `Authorised signals associated with ${theme.themeLabel.toLowerCase()} appear across more relationships than in the previous comparable period (${theme.relationshipCount} relationships). This is prevalence, not proof of behavioural change.`,
      recommendation:
        "Consider whether targeted development support or continued monitoring is appropriate. Gather further authorised evidence before changing organisational practice.",
      confidenceLevel: theme.confidenceLevel,
      evidenceCount: theme.evidenceCount,
      relationshipCount: theme.relationshipCount,
      status: "proposed",
    });
  }

  const recurringTheme = input.themes.find(
    theme => !theme.suppressed && theme.metadata.recurring === true
  );
  if (recurringTheme && recommendations.length < 3) {
    recommendations.push({
      priority: recommendations.length + 1,
      title: `Continue monitoring ${recurringTheme.themeLabel.toLowerCase()}`,
      rationale: `${recurringTheme.themeLabel} recurs across enough relationships in successive periods to watch carefully.`,
      recommendation:
        "Continue monitoring and gather additional authorised evidence before changing organisational practice.",
      confidenceLevel: recurringTheme.confidenceLevel,
      evidenceCount: recurringTheme.evidenceCount,
      relationshipCount: recurringTheme.relationshipCount,
      status: "proposed",
    });
  }

  const momentum = input.metrics.find(
    metric => metric.metricKey === "development_momentum"
  );
  if (
    momentum &&
    !momentum.suppressed &&
    (momentum.direction === "down" || momentum.direction === "stable") &&
    recommendations.length < 3
  ) {
    recommendations.push({
      priority: recommendations.length + 1,
      title: "Sustain development activity",
      rationale:
        "Development Activity Momentum suggests conversations, actions and recorded development activity need continued attention across the selected period. This is an activity signal, not capability progress.",
      recommendation:
        "Continue monitoring development activity and encourage completion of actions, reflections and development updates.",
      confidenceLevel: momentum.confidenceLevel,
      evidenceCount: momentum.evidenceCount,
      relationshipCount: momentum.relationshipCount,
      status: "proposed",
    });
  }

  if (recommendations.length === 0) {
    const topTheme = input.themes.find(theme => !theme.suppressed);
    if (topTheme) {
      recommendations.push({
        priority: 1,
        title: `Continue monitoring ${topTheme.themeLabel.toLowerCase()}`,
        rationale: `A recurring authorised theme is observable around ${topTheme.themeLabel.toLowerCase()} with enough anonymised evidence to watch carefully.`,
        recommendation:
          "Continue monitoring and gather additional authorised evidence before changing organisational practice.",
        confidenceLevel: topTheme.confidenceLevel,
        evidenceCount: topTheme.evidenceCount,
        relationshipCount: topTheme.relationshipCount,
        status: "proposed",
      });
    }
  }

  return recommendations.slice(0, 3);
}

export function buildAttentionAreas(input: {
  themes: ThemeView[];
  capabilities: CapabilityTrendView[];
}): AttentionAreaView[] {
  const fromThemes = input.themes
    .filter(
      theme =>
        !theme.suppressed &&
        (theme.direction === "increasing_prevalence" ||
          theme.metadata.recurring === true)
    )
    .map(theme => ({
      key: theme.themeKey,
      label: theme.themeLabel,
      kind: "theme" as const,
      direction: theme.direction ?? "unchanged_prevalence",
      confidenceLevel: theme.confidenceLevel,
      reason:
        theme.direction === "increasing_prevalence"
          ? `${theme.themeLabel} is appearing across more relationships than previously (${theme.relationshipCount}). This is prevalence, not behavioural diagnosis.`
          : `${theme.themeLabel} recurs across ${theme.relationshipCount} relationships with enough evidence to monitor.`,
      recommendedReview:
        "Review aggregated theme evidence and decide whether targeted support or continued monitoring is appropriate. Do not treat this as an individual assessment.",
    }));

  const fromCapabilities = input.capabilities
    .filter(
      capability =>
        !capability.suppressed &&
        capability.direction === "increasing_prevalence"
    )
    .map(capability => ({
      key: capability.key,
      label: capability.label,
      kind: "capability" as const,
      direction: capability.direction,
      confidenceLevel: capability.confidenceLevel,
      reason: `Related authorised themes mapped to ${capability.label.toLowerCase()} show increasing prevalence across contributing relationships.`,
      recommendedReview:
        "Review foundation trends with authorised leaders and avoid individual assessment from this view.",
    }));

  return [...fromThemes, ...fromCapabilities].slice(0, 5);
}

export function buildCoachingImpact(input: {
  metrics: MetricView[];
  themes: ThemeView[];
}): CoachingImpactView[] {
  const impact: CoachingImpactView[] = [];

  const actionRate = input.metrics.find(
    metric => metric.metricKey === "action_completion_rate"
  );
  if (actionRate && !actionRate.suppressed && actionRate.metricValue != null) {
    impact.push({
      key: "action_completion_change",
      label: "Action completion",
      statement: `Action completion of ${actionRate.displayValue} was recorded during the period${
        actionRate.comparisonAvailable && actionRate.previousValue != null
          ? `, compared with ${actionRate.previousValue}% previously`
          : ""
      }.`,
      direction: actionRate.direction,
      confidenceLevel: actionRate.confidenceLevel,
      evidenceCount: actionRate.evidenceCount,
    });
  }

  const reflectionRate = input.metrics.find(
    metric => metric.metricKey === "reflection_completion_rate"
  );
  if (
    reflectionRate &&
    !reflectionRate.suppressed &&
    reflectionRate.metricValue != null
  ) {
    impact.push({
      key: "reflection_completion_change",
      label: "Reflection completion",
      statement: `Reflection completion of ${reflectionRate.displayValue} was observed alongside coaching activity in the selected period.`,
      direction: reflectionRate.direction,
      confidenceLevel: reflectionRate.confidenceLevel,
      evidenceCount: reflectionRate.evidenceCount,
    });
  }

  const updates = input.metrics.find(
    metric => metric.metricKey === "development_updates_completed"
  );
  if (updates && !updates.suppressed) {
    impact.push({
      key: "development_update_frequency",
      label: "Development updates",
      statement: `${updates.metricValue ?? 0} development updates were completed during the period.`,
      direction: updates.direction,
      confidenceLevel: updates.confidenceLevel,
      evidenceCount: updates.evidenceCount,
    });
  }

  const evidence = input.metrics.find(
    metric => metric.metricKey === "evidence_items"
  );
  if (evidence && !evidence.suppressed) {
    impact.push({
      key: "evidence_progression",
      label: "Authorised evidence volume",
      statement: `${evidence.metricValue ?? 0} authorised development evidence items were recorded during the period. This is evidence volume, not proof of behavioural progress.`,
      direction: evidence.direction,
      confidenceLevel: evidence.confidenceLevel,
      evidenceCount: evidence.evidenceCount,
    });
  }

  const rising = input.themes.filter(
    theme =>
      !theme.suppressed && theme.direction === "increasing_prevalence"
  );
  if (rising.length > 0) {
    impact.push({
      key: "theme_prevalence_increasing",
      label: "Theme prevalence",
      statement: `Authorised signals associated with ${rising[0].themeLabel.toLowerCase()} appear across more relationships than in the previous comparable period.`,
      direction: "increasing_prevalence",
      confidenceLevel: rising[0].confidenceLevel,
      evidenceCount: rising[0].evidenceCount,
    });
  }

  return impact;
}

export function buildEvidenceTraces(input: {
  period: OrganisationIntelligencePeriod;
  metrics: MetricView[];
  themes: ThemeView[];
  capabilities: CapabilityTrendView[];
  threshold?: number;
}): EvidenceTrace[] {
  const threshold =
    input.threshold ?? ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD;
  const traces: EvidenceTrace[] = [];

  for (const metric of input.metrics) {
    traces.push({
      insightKey: metric.metricKey,
      insightLabel: metric.metricLabel,
      evidenceCount: metric.evidenceCount,
      relationshipCount: metric.relationshipCount,
      sourceTypes: sourceTypesForMetric(metric.metricKey),
      dateRange: {
        start: input.period.periodStart,
        end: input.period.periodEnd,
      },
      capabilities: [],
      confidenceLevel: metric.confidenceLevel,
      confidenceBasis: confidenceBasis({
        evidenceCount: metric.evidenceCount,
        relationshipCount: metric.relationshipCount,
        sourceTypeCount: sourceTypesForMetric(metric.metricKey).length,
        threshold,
      }),
      suppressionApplied: metric.suppressed,
      suppressionReason: metric.suppressed
        ? `Fewer than ${threshold} relationships contributed evidence.`
        : null,
    });
  }

  for (const theme of input.themes.filter(row => !row.suppressed)) {
    traces.push({
      insightKey: `theme:${theme.themeKey}`,
      insightLabel: theme.themeLabel,
      evidenceCount: theme.evidenceCount,
      relationshipCount: theme.relationshipCount,
      sourceTypes: theme.evidenceTypes,
      dateRange: {
        start: input.period.periodStart,
        end: input.period.periodEnd,
      },
      capabilities: theme.relatedCapabilities,
      confidenceLevel: theme.confidenceLevel,
      confidenceBasis: confidenceBasis({
        evidenceCount: theme.evidenceCount,
        relationshipCount: theme.relationshipCount,
        sourceTypeCount: theme.evidenceTypes.length,
        threshold,
      }),
      suppressionApplied: false,
      suppressionReason: null,
    });
  }

  for (const capability of input.capabilities) {
    traces.push({
      insightKey: `capability:${capability.key}`,
      insightLabel: capability.label,
      evidenceCount: capability.evidenceCount,
      relationshipCount: capability.relationshipCount,
      sourceTypes: ["approved_intelligence", "progress_signal"],
      dateRange: {
        start: input.period.periodStart,
        end: input.period.periodEnd,
      },
      capabilities: [capability.key],
      confidenceLevel: capability.confidenceLevel,
      confidenceBasis: confidenceBasis({
        evidenceCount: capability.evidenceCount,
        relationshipCount: capability.relationshipCount,
        sourceTypeCount: 2,
        threshold,
      }),
      suppressionApplied: capability.suppressed,
      suppressionReason: capability.suppressed
        ? `Fewer than ${threshold} relationships contributed evidence.`
        : null,
    });
  }

  return traces;
}

function sourceTypesForMetric(metricKey: string): string[] {
  switch (metricKey) {
    case "active_relationships":
      return ["relationships"];
    case "active_practitioners":
      return ["memberships", "assignments"];
    case "development_conversations":
      return ["sessions"];
    case "evidence_items":
      return ["authorised_development_evidence"];
    case "action_completion_rate":
      return ["actions"];
    case "reflection_completion_rate":
      return ["sessions", "reflections"];
    case "development_updates_completed":
      return ["development_updates"];
    case "development_momentum":
      return [
        "sessions",
        "actions",
        "reflections",
        "development_updates",
        "authorised_development_evidence",
      ];
    default:
      return ["aggregated_evidence"];
  }
}

export function buildDeterministicExecutiveBrief(input: {
  organisationName: string;
  periodLabel: string;
  metrics: MetricView[];
  themes: ThemeView[];
  capabilities: CapabilityTrendView[];
  recommendations: RecommendationView[];
  restrictedEvidenceExcluded: boolean;
  confidenceLevel?: "low" | "moderate" | "high";
  sourceRelationshipCount?: number;
  sourceConversationCount?: number;
  sourceEvidenceCount?: number;
}): string {
  const improving = input.capabilities
    .filter(
      capability =>
        !capability.suppressed &&
        capability.direction === "increasing_prevalence"
    )
    .map(capability => capability.label);
  const attention = input.capabilities
    .filter(
      capability =>
        !capability.suppressed &&
        capability.direction === "decreasing_prevalence"
    )
    .map(capability => capability.label);

  const attentionThemeLabels = input.themes
    .filter(
      theme =>
        !theme.suppressed &&
        (theme.direction === "increasing_prevalence" ||
          theme.metadata.recurring === true)
    )
    .map(theme => theme.themeLabel);

  const strongEvidenceAreas = input.capabilities
    .filter(
      capability =>
        !capability.suppressed &&
        (capability.confidenceLevel === "high" ||
          capability.confidenceLevel === "moderate") &&
        (capability.direction === "increasing_prevalence" ||
          capability.direction === "unchanged_prevalence")
    )
    .map(capability => capability.label);

  const limitedEvidenceAreas = input.capabilities
    .filter(
      capability =>
        capability.suppressed ||
        capability.direction === "insufficient_evidence" ||
        capability.confidenceLevel === "low"
    )
    .map(capability => capability.label)
    .slice(0, 4);

  const conversations = input.metrics.find(
    metric => metric.metricKey === "conversations_completed"
  );
  const evidenceMetric = input.metrics.find(
    metric => metric.metricKey === "evidence_items"
  );

  const premium = buildPremiumExecutiveBrief({
    organisationName: input.organisationName,
    periodLabel: input.periodLabel,
    confidenceLevel: input.confidenceLevel ?? "low",
    sourceRelationshipCount: input.sourceRelationshipCount ?? 0,
    sourceConversationCount:
      input.sourceConversationCount ??
      Number(conversations?.metricValue ?? 0),
    sourceEvidenceCount:
      input.sourceEvidenceCount ?? Number(evidenceMetric?.metricValue ?? 0),
    strengthening: improving,
    attention: Array.from(
      new Set([...attention, ...attentionThemeLabels])
    ).slice(0, 4),
    strongEvidenceAreas: strongEvidenceAreas.slice(0, 4),
    limitedEvidenceAreas,
    recommendations: input.recommendations.map(item => ({
      title: item.title,
      recommendation: item.recommendation,
      confidenceLevel: item.confidenceLevel,
    })),
    restrictedEvidenceExcluded: input.restrictedEvidenceExcluded,
  });

  return premium.plainText;
}

export function buildPremiumExecutiveBriefSections(input: {
  organisationName: string;
  periodLabel: string;
  metrics: MetricView[];
  themes: ThemeView[];
  capabilities: CapabilityTrendView[];
  recommendations: RecommendationView[];
  restrictedEvidenceExcluded: boolean;
  confidenceLevel?: "low" | "moderate" | "high";
  sourceRelationshipCount?: number;
  sourceConversationCount?: number;
  sourceEvidenceCount?: number;
}) {
  const improving = input.capabilities
    .filter(
      capability =>
        !capability.suppressed &&
        capability.direction === "increasing_prevalence"
    )
    .map(capability => capability.label);
  const attention = Array.from(
    new Set([
      ...input.capabilities
        .filter(
          capability =>
            !capability.suppressed &&
            capability.direction === "decreasing_prevalence"
        )
        .map(capability => capability.label),
      ...input.themes
        .filter(
          theme =>
            !theme.suppressed &&
            (theme.direction === "increasing_prevalence" ||
              theme.metadata.recurring === true)
        )
        .map(theme => theme.themeLabel),
    ])
  ).slice(0, 4);

  return buildPremiumExecutiveBrief({
    organisationName: input.organisationName,
    periodLabel: input.periodLabel,
    confidenceLevel: input.confidenceLevel ?? "low",
    sourceRelationshipCount: input.sourceRelationshipCount ?? 0,
    sourceConversationCount: input.sourceConversationCount ?? 0,
    sourceEvidenceCount: input.sourceEvidenceCount ?? 0,
    strengthening: improving,
    attention,
    strongEvidenceAreas: input.capabilities
      .filter(
        capability =>
          !capability.suppressed && capability.confidenceLevel !== "low"
      )
      .map(capability => capability.label)
      .slice(0, 4),
    limitedEvidenceAreas: input.capabilities
      .filter(
        capability =>
          capability.suppressed || capability.confidenceLevel === "low"
      )
      .map(capability => capability.label)
      .slice(0, 4),
    recommendations: input.recommendations.map(item => ({
      title: item.title,
      recommendation: item.recommendation,
      confidenceLevel: item.confidenceLevel,
    })),
    restrictedEvidenceExcluded: input.restrictedEvidenceExcluded,
  });
}

export function hasEnoughEvidenceForOrganisationView(
  aggregates: OrganisationIntelligenceSourceAggregates,
  threshold: number = ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD
): boolean {
  return (
    aggregates.contributingRelationships >= threshold &&
    aggregates.conversations > 0
  );
}

export type OrganisationEvidenceSufficiency =
  | "no_activity"
  | "activity_without_authorised_themes"
  | "below_theme_threshold"
  | "reportable";

/**
 * Honest sufficiency classification for People Development.
 * Does not expose suppressed subgroup counts.
 */
export function classifyOrganisationEvidenceSufficiency(
  aggregates: OrganisationIntelligenceSourceAggregates,
  themeResult: { themes: ThemeView[] },
  threshold: number = ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD
): OrganisationEvidenceSufficiency {
  const hasActivity =
    aggregates.conversations > 0 ||
    aggregates.developmentUpdatesCompleted > 0 ||
    aggregates.actionsTotal > 0 ||
    aggregates.evidenceItems > 0;

  if (!hasActivity && aggregates.contributingRelationships === 0) {
    return "no_activity";
  }

  const knownCandidates =
    aggregates.themeCandidates.length +
    aggregates.itemThemes.length +
    (aggregates.authorisedEvidenceCapabilities?.length ?? 0) +
    (aggregates.previousAuthorisedEvidenceCapabilities?.length ?? 0);

  const visibleThemes = themeResult.themes.filter(theme => !theme.suppressed);
  if (visibleThemes.length > 0 && hasEnoughEvidenceForOrganisationView(aggregates, threshold)) {
    return "reportable";
  }

  if (
    hasActivity &&
    knownCandidates === 0 &&
    themeResult.themes.length === 0
  ) {
    return "activity_without_authorised_themes";
  }

  if (
    themeResult.themes.some(theme => theme.suppressed) ||
    (hasActivity && visibleThemes.length === 0)
  ) {
    return "below_theme_threshold";
  }

  if (!hasEnoughEvidenceForOrganisationView(aggregates, threshold)) {
    return "below_theme_threshold";
  }

  return "activity_without_authorised_themes";
}
