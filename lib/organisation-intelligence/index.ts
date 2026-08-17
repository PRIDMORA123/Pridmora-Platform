export {
  ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD,
  DEFAULT_PERIOD_PRESET,
  MOMENTUM_METHODOLOGY,
  PRIVACY_NOTE,
  PREVALENCE_DIRECTION_NOTE,
  COVERAGE_CAVEAT_NOTE,
  INSUFFICIENT_EVIDENCE_COPY,
  ACTIVITY_WITHOUT_AUTHORISED_THEMES_COPY,
  BELOW_THEME_THRESHOLD_COPY,
  NO_COMPARISON_COPY,
  SIX_FOUNDATIONS,
  GENERATION_STAGE_LABELS,
  PERIOD_PRESETS,
} from "@/lib/organisation-intelligence/constants";

export type {
  ConfidenceLevel,
  PeriodPreset,
  TrendDirection,
  FoundationKey,
  GenerationStage,
} from "@/lib/organisation-intelligence/constants";

export type {
  OrganisationIntelligencePeriod,
  OrganisationIntelligenceSnapshotView,
  OrganisationIntelligenceSourceAggregates,
  MetricView,
  ThemeView,
  CapabilityTrendView,
  RecommendationView,
  AttentionAreaView,
  CoachingImpactView,
  EvidenceTrace,
} from "@/lib/organisation-intelligence/types";

export {
  resolveOrganisationIntelligencePeriod,
  parsePeriodPreset,
} from "@/lib/organisation-intelligence/periods";

export {
  meetsPrivacyThreshold,
  isRestrictedSensitiveTheme,
  privacyThresholdMessage,
} from "@/lib/organisation-intelligence/suppression";

export {
  calculateConfidenceLevel,
  confidenceBasis,
  confidenceDisplayLabel,
} from "@/lib/organisation-intelligence/confidence";

export {
  calculateDevelopmentMomentum,
  MOMENTUM_WEIGHTS,
  rateFromCounts,
  compareNumericDirection,
} from "@/lib/organisation-intelligence/momentum";

export {
  normaliseThemeKey,
  aggregateThemes,
} from "@/lib/organisation-intelligence/themes";

export {
  mapCapabilityTrends,
  directionLabel,
  directionScreenReaderLabel,
} from "@/lib/organisation-intelligence/capabilities";

export { buildOrganisationMetrics } from "@/lib/organisation-intelligence/metrics";

export {
  buildRecommendations,
  buildAttentionAreas,
  buildCoachingImpact,
  buildEvidenceTraces,
  buildDeterministicExecutiveBrief,
  buildPremiumExecutiveBriefSections,
  hasEnoughEvidenceForOrganisationView,
  classifyOrganisationEvidenceSufficiency,
} from "@/lib/organisation-intelligence/compose";

export { buildOrganisationIntelligenceSnapshotView } from "@/lib/organisation-intelligence/build-snapshot";

export {
  validateOrganisationIntelligenceBrief,
  collectAllowedNumbers,
} from "@/lib/organisation-intelligence/validate-output";

export {
  fetchOrganisationIntelligenceSources,
  listOrganisationIntelligenceSnapshots,
  loadOrganisationIntelligenceSnapshot,
  mapSourceAggregates,
} from "@/lib/organisation-intelligence/repository";

export {
  excludeSelfDevelopmentFromAggregates,
  listSelfDevelopmentClientIdsForOrganisation,
  sanitizeOrganisationIntelligenceAggregates,
  aggregatesContainSelfDevelopmentRelationship,
} from "@/lib/organisation-intelligence/exclude-self-development";

export { generateOrganisationIntelligence } from "@/lib/organisation-intelligence/generate";

export { buildOrganisationIntelligenceExportHtml } from "@/lib/organisation-intelligence/export";

export {
  mapAuthorisedCapabilitiesToThemeCandidates,
  filterToKnownCatalogueThemeCandidates,
  evidencePostureFromSourceTypes,
} from "@/lib/organisation-intelligence/living-theme-signals";

export { prevalenceDirectionFromCounts } from "@/lib/organisation-intelligence/themes";
