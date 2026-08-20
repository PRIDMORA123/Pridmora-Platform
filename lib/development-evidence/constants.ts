/**
 * Development Evidence constants.
 * User-facing product language — never expose "Evidence Engine".
 */

export const EVIDENCE_CONFIDENCE_LEVELS = ["low", "moderate", "strong"] as const;
export type EvidenceConfidenceLevel = (typeof EVIDENCE_CONFIDENCE_LEVELS)[number];

export const EVIDENCE_COVERAGE_LEVELS = [
  "limited",
  "developing",
  "broad",
] as const;
export type EvidenceCoverageLevel = (typeof EVIDENCE_COVERAGE_LEVELS)[number];

export const EVIDENCE_FRESHNESS_CLASSES = [
  "current",
  "ageing",
  "historic",
] as const;
export type EvidenceFreshnessClass = (typeof EVIDENCE_FRESHNESS_CLASSES)[number];

export const DEVELOPMENT_EVIDENCE_TYPES = [
  "development_conversation",
  "summary_insights",
  "reflection",
  "development_update",
  "action",
  "manager_observation",
  "feedback_360",
  "disc",
  "insights_discovery",
  "clifton_strengths",
  "hogan",
  "lumina",
  "mbti",
  "emotional_intelligence",
  "leadership_assessment",
  "pdp",
  "appraisal_review",
  "learning_record",
  "qualification",
  "competency_assessment",
  "organisation_framework",
  "personal_reflection",
  "stakeholder_feedback",
  "other_document",
] as const;
export type DevelopmentEvidenceType = (typeof DEVELOPMENT_EVIDENCE_TYPES)[number];

export const EVIDENCE_SOURCE_TYPES = [
  "internal_reference",
  "uploaded_document",
  "manual_entry",
  "sample_seed",
] as const;
export type EvidenceSourceType = (typeof EVIDENCE_SOURCE_TYPES)[number];

export const EVIDENCE_PROCESSING_STATUSES = [
  "pending_upload",
  "uploaded",
  "extracting",
  "extracted",
  "analysing",
  "ready",
  "failed",
] as const;
export type EvidenceProcessingStatus =
  (typeof EVIDENCE_PROCESSING_STATUSES)[number];

export const EVIDENCE_REVIEW_STATUSES = [
  "pending_review",
  "in_review",
  "approved",
  "edited",
  "rejected",
  "excluded",
] as const;
export type EvidenceReviewStatus = (typeof EVIDENCE_REVIEW_STATUSES)[number];

export const OBSERVATION_REVIEW_STATUSES = [
  "proposed",
  "approved",
  "edited",
  "rejected",
  "excluded",
] as const;
export type ObservationReviewStatus =
  (typeof OBSERVATION_REVIEW_STATUSES)[number];

export const SOURCE_CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type SourceConfidenceLevel = (typeof SOURCE_CONFIDENCE_LEVELS)[number];

/** Coverage categories represented in the evidence base. */
export const EVIDENCE_COVERAGE_CATEGORIES = [
  "conversations",
  "reflections",
  "feedback",
  "assessment",
  "observed_behaviour",
  "development_actions",
] as const;
export type EvidenceCoverageCategory =
  (typeof EVIDENCE_COVERAGE_CATEGORIES)[number];

export const EVIDENCE_TYPE_LABELS: Record<DevelopmentEvidenceType, string> = {
  development_conversation: "Development conversation",
  summary_insights: "Summary & Insights",
  reflection: "Reflection",
  development_update: "Development update",
  action: "Development action",
  manager_observation: "Manager observation",
  feedback_360: "360 feedback",
  disc: "DISC",
  insights_discovery: "Insights Discovery",
  clifton_strengths: "CliftonStrengths",
  hogan: "Hogan",
  lumina: "Lumina",
  mbti: "MBTI",
  emotional_intelligence: "Emotional intelligence assessment",
  leadership_assessment: "Leadership assessment",
  pdp: "Personal development plan",
  appraisal_review: "Appraisal / development review",
  learning_record: "Learning record",
  qualification: "Qualification",
  competency_assessment: "Competency assessment",
  organisation_framework: "Organisation leadership framework",
  personal_reflection: "Personal reflection",
  stakeholder_feedback: "Stakeholder feedback",
  other_document: "Other development document",
};

export const UPLOADABLE_EVIDENCE_TYPES: readonly DevelopmentEvidenceType[] = [
  "feedback_360",
  "disc",
  "insights_discovery",
  "clifton_strengths",
  "hogan",
  "lumina",
  "mbti",
  "emotional_intelligence",
  "leadership_assessment",
  "pdp",
  "appraisal_review",
  "learning_record",
  "qualification",
  "competency_assessment",
  "organisation_framework",
  "personal_reflection",
  "stakeholder_feedback",
  "other_document",
];

export const PSYCHOMETRIC_EVIDENCE_TYPES: readonly DevelopmentEvidenceType[] = [
  "disc",
  "insights_discovery",
  "clifton_strengths",
  "hogan",
  "lumina",
  "mbti",
  "emotional_intelligence",
];

/** Freshness windows in days by evidence type. */
export const FRESHNESS_WINDOWS_DAYS: Record<
  DevelopmentEvidenceType,
  { current: number; ageing: number }
> = {
  development_conversation: { current: 90, ageing: 180 },
  summary_insights: { current: 90, ageing: 180 },
  reflection: { current: 60, ageing: 150 },
  development_update: { current: 90, ageing: 180 },
  action: { current: 60, ageing: 150 },
  manager_observation: { current: 90, ageing: 180 },
  feedback_360: { current: 180, ageing: 365 },
  disc: { current: 365, ageing: 730 },
  insights_discovery: { current: 365, ageing: 730 },
  clifton_strengths: { current: 365, ageing: 730 },
  hogan: { current: 365, ageing: 730 },
  lumina: { current: 365, ageing: 730 },
  mbti: { current: 365, ageing: 730 },
  emotional_intelligence: { current: 365, ageing: 730 },
  leadership_assessment: { current: 270, ageing: 540 },
  pdp: { current: 180, ageing: 365 },
  appraisal_review: { current: 180, ageing: 365 },
  learning_record: { current: 180, ageing: 365 },
  qualification: { current: 730, ageing: 1460 },
  competency_assessment: { current: 270, ageing: 540 },
  organisation_framework: { current: 730, ageing: 1460 },
  personal_reflection: { current: 60, ageing: 150 },
  stakeholder_feedback: { current: 120, ageing: 270 },
  other_document: { current: 180, ageing: 365 },
};

export const EVIDENCE_TYPE_TO_COVERAGE: Record<
  DevelopmentEvidenceType,
  EvidenceCoverageCategory
> = {
  development_conversation: "conversations",
  summary_insights: "conversations",
  reflection: "reflections",
  personal_reflection: "reflections",
  development_update: "observed_behaviour",
  action: "development_actions",
  manager_observation: "observed_behaviour",
  feedback_360: "feedback",
  stakeholder_feedback: "feedback",
  disc: "assessment",
  insights_discovery: "assessment",
  clifton_strengths: "assessment",
  hogan: "assessment",
  lumina: "assessment",
  mbti: "assessment",
  emotional_intelligence: "assessment",
  leadership_assessment: "assessment",
  competency_assessment: "assessment",
  pdp: "development_actions",
  appraisal_review: "feedback",
  learning_record: "development_actions",
  qualification: "development_actions",
  organisation_framework: "assessment",
  other_document: "feedback",
};

export const COVERAGE_CATEGORY_LABELS: Record<EvidenceCoverageCategory, string> =
  {
    conversations: "Development conversations",
    reflections: "Reflections",
    feedback: "Feedback",
    assessment: "Assessment",
    observed_behaviour: "Observed behaviour",
    development_actions: "Development actions",
  };

export const SUPPORTED_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
] as const;

export const SUPPORTED_UPLOAD_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".txt",
  ".md",
] as const;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const EXTRACTION_VERSION = "v1";

/**
 * Analyse-layer timing / completion budget.
 *
 * Coherence with the analyse API route (`maxDuration = 60`):
 * - two attempts × per-attempt timeout = 50s of remote AI wall time
 * - ~10s reserved for auth, begin/save, and audit overhead
 * - client abort sits above the two-attempt AI ceiling and at/under the route budget
 *
 * Output is intentionally constrained (≤3 concise observations for normal evidence)
 * so one completion should finish well under the attempt timeout.
 */
export const EVIDENCE_ANALYSIS_ATTEMPT_TIMEOUT_MS = 25_000;
/**
 * Completion budget for constrained evidence JSON (up to 3 concise observations).
 * Sized for ~3 × (title + short description + behavioural support + capability +
 * optional short implication) with JSON overhead — not an essay budget.
 */
export const EVIDENCE_ANALYSIS_MAX_COMPLETION_TOKENS = 900;
/** Browser abort for `/analyse` — must cover 2 × attempt timeout without beating the 60s route. */
export const EVIDENCE_ANALYSIS_CLIENT_TIMEOUT_MS = 55_000;
export const EVIDENCE_ANALYSIS_ROUTE_MAX_DURATION_SECONDS = 60;

/** Hard cap for normal (non-psychometric) Development Evidence AI observations. */
export const EVIDENCE_ANALYSIS_MAX_OBSERVATIONS = 3;
/**
 * Psychometric assessments may surface a few preference signals; still bounded
 * so generation cannot run unbounded.
 */
export const EVIDENCE_ANALYSIS_MAX_OBSERVATIONS_PSYCHOMETRIC = 5;

export const EVIDENCE_AUDIT_ACTIONS = [
  "evidence_uploaded",
  "evidence_processed",
  "evidence_reviewed",
  "evidence_included",
  "evidence_excluded",
  "evidence_viewed",
  "intelligence_evidence_opened",
  "evidence_deleted",
  "framework_created",
  "framework_updated",
] as const;
export type EvidenceAuditAction = (typeof EVIDENCE_AUDIT_ACTIONS)[number];

export const CONFIDENCE_DISPLAY_LABELS: Record<EvidenceConfidenceLevel, string> =
  {
    low: "Low",
    moderate: "Moderate",
    strong: "Strong",
  };

export const COVERAGE_DISPLAY_LABELS: Record<EvidenceCoverageLevel, string> = {
  limited: "Limited",
  developing: "Developing",
  broad: "Broad",
};

export const FRESHNESS_DISPLAY_LABELS: Record<EvidenceFreshnessClass, string> = {
  current: "Current",
  ageing: "Ageing",
  historic: "Historic",
};
