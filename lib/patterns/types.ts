/**
 * Longitudinal, evidence-grounded coaching pattern recognition.
 * Pridmora Intelligence identifies evidence-based patterns; the coach interprets meaning.
 */

export type PatternStrength = "observation" | "emerging" | "established";

export type CoachingPatternStatus =
  | "active"
  | "strengthening"
  | "reducing"
  | "resolved"
  | "unclear";

export type PatternEvidenceSourceType =
  | "session_notes"
  | "approved_summary"
  | "commitment"
  | "development_observation"
  | "supporting_context"
  | "coaching_moment";

export type PatternEvidenceReference = {
  sourceType: PatternEvidenceSourceType;
  sourceId: string;
  sessionId?: string | null;
  sourceDate?: string | null;
  /** Prefer omitting when source references are sufficient. */
  excerpt?: string | null;
};

export type CoachingPattern = {
  id: string;
  relationshipId: string;
  title: string;
  description: string;
  strength: PatternStrength;
  status: CoachingPatternStatus;
  evidenceCount: number;
  firstObservedAt?: string | null;
  lastObservedAt?: string | null;
  evidence: PatternEvidenceReference[];
  coachReviewed: boolean;
  coachAccepted?: boolean | null;
  coachComment?: string | null;
  /**
   * When true, do not recreate from unchanged evidence after rejection.
   * Cleared only when meaningfully new evidence appears.
   */
  suppressed?: boolean;
  /** Fingerprint of evidence sourceIds used when last generated/reviewed. */
  evidenceFingerprint?: string | null;
  /** Pending AI suggestion that would update an accepted pattern — awaiting coach review. */
  pendingSuggestion?: {
    title: string;
    description: string;
    strength: PatternStrength;
    status: CoachingPatternStatus;
    evidence: PatternEvidenceReference[];
    changeSummary: string;
  } | null;
};

export type AuthorisedPatternEvidencePoint = {
  sourceType: PatternEvidenceSourceType;
  sourceId: string;
  relationshipId: string;
  sessionId?: string | null;
  sourceDate?: string | null;
  /** Normalised content used for thematic matching / dedup. */
  content: string;
  /** Optional short excerpt for provenance display. */
  excerpt?: string | null;
  /** True when this is private coach material — must be excluded. */
  isPrivate?: boolean;
  /** True when summary/AI draft is not yet coach-approved. */
  isApproved?: boolean;
  /** Supporting context opt-in for AI. */
  aiEnabled?: boolean;
  /** Dedup key — regenerated copies of the same source share this. */
  canonicalKey: string;
};

export type PatternCandidate = {
  title: string;
  description: string;
  evidence: PatternEvidenceReference[];
  /** Optional status hint from generator; still validated. */
  statusHint?: CoachingPatternStatus;
};

export type PatternGenerationResult = {
  patterns: CoachingPattern[];
  message: string | null;
  evidenceFingerprint: string;
};

export type SessionPatternInsightKind =
  | "reinforces"
  | "weakens"
  | "emerging"
  | "insufficient";

export type SessionPatternInsight = {
  kind: SessionPatternInsightKind;
  text: string;
  patternId?: string | null;
};

export const INSUFFICIENT_PATTERN_MESSAGE =
  "No reliable longitudinal pattern is currently supported.";

export const PATTERN_STRENGTH_LABELS: Record<PatternStrength, string> = {
  observation: "Observation",
  emerging: "Emerging theme",
  established: "Established pattern",
};

export const PATTERN_STATUS_LABELS: Record<CoachingPatternStatus, string> = {
  active: "Active",
  strengthening: "Strengthening",
  reducing: "Reducing",
  resolved: "Resolved",
  unclear: "Unclear",
};
