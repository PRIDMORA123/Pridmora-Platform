import type {
  ConfidenceLevel,
  FoundationKey,
  GenerationStage,
  PeriodPreset,
  SnapshotStatus,
  TrendDirection,
} from "@/lib/organisation-intelligence/constants";

export type OrganisationIntelligencePeriod = {
  preset: PeriodPreset;
  periodStart: string;
  periodEnd: string;
  previousPeriodStart: string;
  previousPeriodEnd: string;
  label: string;
  comparisonLabel: string;
};

export type ThemeCandidate = {
  themeKey: string;
  category?: string | null;
  /**
   * Distinct-contributor token for aggregation.
   * After Stage 3.1A RPC hardening this is an opaque hash, not a client UUID.
   * Legacy payloads may still send relationshipId / client UUID.
   */
  relationshipId: string;
  sourceType: string;
  occurredAt?: string | null;
};

export type ProgressSignalCandidate = {
  signalName: string;
  direction: string | null;
  relationshipId: string;
  coachValidated: boolean;
};

export type OrganisationIntelligenceSourceAggregates = {
  organisationId: string;
  periodStart: string;
  periodEnd: string;
  previousPeriodStart: string;
  previousPeriodEnd: string;
  /**
   * True when the RPC already excluded self-development at the DB boundary.
   * App-layer sanitize must not double-subtract counts when this is set.
   */
  selfDevelopmentExcluded?: boolean;
  activeRelationships: number;
  activePractitioners: number;
  conversations: number;
  previousConversations: number;
  completedConversations: number;
  previousCompletedConversations: number;
  actionsTotal: number;
  actionsCompleted: number;
  previousActionsTotal: number;
  previousActionsCompleted: number;
  reflectionsCompleted: number;
  previousReflectionsCompleted: number;
  developmentUpdatesCompleted: number;
  previousDevelopmentUpdatesCompleted: number;
  evidenceItems: number;
  previousEvidenceItems: number;
  contributingRelationships: number;
  themeCandidates: ThemeCandidate[];
  previousThemeCandidates: ThemeCandidate[];
  progressSignals: ProgressSignalCandidate[];
  itemThemes: ThemeCandidate[];
  hasEarlierPeriodActivity: boolean;
};

export type MetricView = {
  metricKey: string;
  metricLabel: string;
  metricValue: number | null;
  previousValue: number | null;
  direction: TrendDirection | null;
  confidenceLevel: ConfidenceLevel;
  evidenceCount: number;
  relationshipCount: number;
  suppressed: boolean;
  displayValue: string;
  comparisonAvailable: boolean;
  methodology?: string;
  metadata: Record<string, unknown>;
};

export type ThemeView = {
  themeKey: string;
  themeLabel: string;
  evidenceCount: number;
  relationshipCount: number;
  direction: TrendDirection | null;
  confidenceLevel: ConfidenceLevel;
  summary: string | null;
  suppressed: boolean;
  relatedCapabilities: FoundationKey[];
  evidenceTypes: string[];
  metadata: Record<string, unknown>;
};

export type CapabilityTrendView = {
  key: FoundationKey;
  label: string;
  direction: TrendDirection;
  changeLabel: string;
  evidenceCount: number;
  relationshipCount: number;
  confidenceLevel: ConfidenceLevel;
  suppressed: boolean;
};

export type RecommendationView = {
  priority: number;
  title: string;
  rationale: string;
  recommendation: string;
  confidenceLevel: ConfidenceLevel;
  evidenceCount: number;
  relationshipCount: number;
  status: string;
};

export type AttentionAreaView = {
  key: string;
  label: string;
  kind: "theme" | "capability";
  direction: TrendDirection;
  confidenceLevel: ConfidenceLevel;
  reason: string;
  recommendedReview: string;
};

export type CoachingImpactView = {
  key: string;
  label: string;
  statement: string;
  direction: TrendDirection | null;
  confidenceLevel: ConfidenceLevel;
  evidenceCount: number;
};

export type EvidenceTrace = {
  insightKey: string;
  insightLabel: string;
  evidenceCount: number;
  relationshipCount: number;
  sourceTypes: string[];
  dateRange: { start: string; end: string };
  capabilities: string[];
  confidenceLevel: ConfidenceLevel;
  confidenceBasis: string;
  suppressionApplied: boolean;
  suppressionReason: string | null;
};

export type OrganisationIntelligenceSnapshotView = {
  id: string;
  organisationId: string;
  organisationName: string;
  period: OrganisationIntelligencePeriod;
  generatedAt: string;
  generatedBy: string | null;
  sourceRelationshipCount: number;
  sourceConversationCount: number;
  sourceEvidenceCount: number;
  confidenceLevel: ConfidenceLevel;
  executiveBrief: string | null;
  status: SnapshotStatus;
  restrictedEvidenceExcluded: boolean;
  privacyThreshold: number;
  metrics: MetricView[];
  themes: ThemeView[];
  capabilities: CapabilityTrendView[];
  recommendations: RecommendationView[];
  attentionAreas: AttentionAreaView[];
  coachingImpact: CoachingImpactView[];
  evidenceTraces: EvidenceTrace[];
  emptyState: boolean;
  insufficientEvidenceMessage: string | null;
};

export type GenerationProgress = {
  stage: GenerationStage;
  label: string;
  snapshotId: string | null;
};

export type ExecutiveBriefParagraphs = {
  improving: string;
  attention: string;
  stableOrUncertain: string;
  nextFocus: string;
};
