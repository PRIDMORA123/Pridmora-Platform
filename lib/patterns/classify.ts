import {
  countDistinctEvidence,
  distinctSessionIds,
} from "@/lib/patterns/evidence";
import type {
  CoachingPatternStatus,
  PatternEvidenceReference,
  PatternStrength,
} from "@/lib/patterns/types";

/**
 * Assign evidence level from meaningfully related, deduplicated evidence.
 * Do not use raw mention count alone — callers must pass distinct related points.
 *
 * Observation: 1 evidence point — must not be labelled a pattern.
 * Emerging theme: ≥2 distinct approved evidence points.
 * Established pattern: ≥3 distinct points spanning ≥2 sessions
 *   OR repeated session evidence plus authorised supporting context.
 */
export function classifyPatternStrength(
  evidence: PatternEvidenceReference[]
): PatternStrength {
  const count = countDistinctEvidence(evidence);
  if (count <= 1) return "observation";
  if (count === 2) return "emerging";

  const sessions = distinctSessionIds(evidence);
  const hasSupportingContext = evidence.some(
    item => item.sourceType === "supporting_context"
  );
  const hasSessionEvidence = evidence.some(
    item =>
      item.sourceType === "session_notes" ||
      item.sourceType === "approved_summary" ||
      item.sourceType === "commitment" ||
      item.sourceType === "development_observation"
  );
  // Coaching moments contribute to observation/emerging counts but never
  // count as formal sessions for established-pattern spanning rules.

  if (sessions.length >= 2) return "established";
  if (hasSessionEvidence && hasSupportingContext && count >= 3) {
    return "established";
  }

  // Three+ points in a single session without supporting context remain emerging
  // until they span sessions — still stronger than one observation.
  return "emerging";
}

/**
 * Observations must not be labelled patterns for longitudinal surfaces.
 */
export function isDisplayablePattern(strength: PatternStrength): boolean {
  return strength === "emerging" || strength === "established";
}

/**
 * Later evidence can strengthen or weaken a pattern.
 * Absence in one session does not prove resolution.
 */
export function derivePatternStatus(input: {
  previousStatus?: CoachingPatternStatus | null;
  previousEvidenceCount: number;
  nextEvidenceCount: number;
  sessionsSinceLastMention: number;
  laterEvidenceContradicts?: boolean;
  laterEvidenceSupports?: boolean;
}): CoachingPatternStatus {
  const {
    previousStatus,
    previousEvidenceCount,
    nextEvidenceCount,
    sessionsSinceLastMention,
    laterEvidenceContradicts = false,
    laterEvidenceSupports = false,
  } = input;

  if (laterEvidenceContradicts && nextEvidenceCount < previousEvidenceCount) {
    if (sessionsSinceLastMention >= 2 && nextEvidenceCount === 0) {
      // Still not enough to call resolved from absence alone
      return "reducing";
    }
    return "reducing";
  }

  if (
    laterEvidenceContradicts &&
    sessionsSinceLastMention >= 2 &&
    previousEvidenceCount > 0 &&
    // Explicit superseding contradiction with replacement evidence
    nextEvidenceCount > 0
  ) {
    return "reducing";
  }

  if (laterEvidenceSupports && nextEvidenceCount > previousEvidenceCount) {
    return "strengthening";
  }

  if (sessionsSinceLastMention >= 2 && !laterEvidenceSupports) {
    // Theme has not appeared recently — unclear, not resolved
    return "unclear";
  }

  if (previousStatus === "resolved") return "resolved";
  if (previousStatus === "strengthening" && laterEvidenceSupports) {
    return "strengthening";
  }

  return previousStatus && previousStatus !== "unclear"
    ? previousStatus
    : "active";
}

/**
 * Mark resolved only when later evidence meaningfully contradicts or supersedes.
 * Missing mention alone is never enough.
 */
export function canMarkResolved(input: {
  sessionsSinceLastMention: number;
  laterEvidenceSupersedes: boolean;
}): boolean {
  return input.laterEvidenceSupersedes === true;
}

export function unresolvedAbsenceMessage(sessionsWithoutMention: number): string {
  const count = Math.max(1, sessionsWithoutMention);
  return `This theme has not appeared in the last ${count} approved session${
    count === 1 ? "" : "s"
  }, but there is not yet enough evidence to regard it as resolved.`;
}
