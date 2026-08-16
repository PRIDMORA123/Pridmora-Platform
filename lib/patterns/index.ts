export type {
  AuthorisedPatternEvidencePoint,
  CoachingPattern,
  CoachingPatternStatus,
  PatternCandidate,
  PatternEvidenceReference,
  PatternEvidenceSourceType,
  PatternGenerationResult,
  PatternStrength,
  SessionPatternInsight,
  SessionPatternInsightKind,
} from "@/lib/patterns/types";

export {
  INSUFFICIENT_PATTERN_MESSAGE,
  PATTERN_STATUS_LABELS,
  PATTERN_STRENGTH_LABELS,
} from "@/lib/patterns/types";

export {
  classifyPatternStrength,
  canMarkResolved,
  derivePatternStatus,
  isDisplayablePattern,
  unresolvedAbsenceMessage,
} from "@/lib/patterns/classify";

export {
  authorisedEvidenceExcerpt,
  countDistinctEvidence,
  deduplicateEvidence,
  distinctSessionIds,
  evidenceCanonicalKey,
  evidenceFingerprint,
  filterAuthorisedEvidence,
  normaliseAuthorisedEvidence,
  PATTERN_EVIDENCE_EXCERPT_MAX,
  toEvidenceReference,
  withoutSupportingContextEvidence,
} from "@/lib/patterns/evidence";

export {
  collectPatternEvidenceFromRelationship,
  evidencePointsToReferences,
} from "@/lib/patterns/collect";

export { detectPatternCandidates } from "@/lib/patterns/detect";

export {
  applyCoachPatternReview,
  preserveAcceptedOnFailure,
  reconcilePatterns,
} from "@/lib/patterns/reconcile";

export {
  DEVELOPMENT_PATTERN_LIMIT,
  PREPARE_PATTERN_LIMIT,
  selectPatternsForDevelopment,
  selectPatternsForPrepare,
} from "@/lib/patterns/prioritise";

export {
  buildSessionPatternInsight,
  coachReviewStateLabel,
  formatSupportedBySessions,
  patternStatusLabel,
  patternStrengthLabel,
  provenanceHref,
} from "@/lib/patterns/display";

export {
  generateRelationshipPatterns,
  relationshipEvidenceFingerprint,
  shouldRegeneratePatterns,
} from "@/lib/patterns/generate";

export {
  parseCoachingPatterns,
  parsePatternCandidates,
  parsePatternCandidatesFromModel,
  coachingPatternsToJson,
} from "@/lib/patterns/schema";
