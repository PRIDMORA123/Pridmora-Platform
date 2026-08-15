import type { CoachingPattern } from "@/lib/patterns/types";
import { isDisplayablePattern } from "@/lib/patterns/classify";
import {
  isReviewedPatternForPrepare,
  patternEvidenceIsBeforeSession,
} from "@/lib/preparation/preparation-intelligence-adapter";

export const PREPARE_PATTERN_LIMIT = 2;
export const DEVELOPMENT_PATTERN_LIMIT = 3;

function relevanceScore(
  pattern: CoachingPattern,
  focusTerms: string[]
): number {
  let score = 0;
  const haystack = `${pattern.title} ${pattern.description}`.toLowerCase();

  for (const term of focusTerms) {
    const t = term.toLowerCase().trim();
    if (t.length >= 3 && haystack.includes(t)) score += 8;
  }

  if (pattern.coachAccepted === true) score += 10;
  if (pattern.coachReviewed && pattern.coachAccepted !== false) score += 4;
  if (pattern.strength === "established") score += 6;
  if (pattern.strength === "emerging") score += 3;
  if (pattern.status === "strengthening") score += 5;
  if (pattern.status === "active") score += 3;
  if (pattern.status === "reducing") score += 2;
  if (pattern.status === "unclear") score -= 2;
  if (pattern.status === "resolved") score -= 8;

  score += Math.min(pattern.evidenceCount, 6);

  if (pattern.lastObservedAt) {
    const ageMs = Date.now() - new Date(pattern.lastObservedAt).getTime();
    if (!Number.isNaN(ageMs)) {
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays < 30) score += 4;
      else if (ageDays < 90) score += 2;
    }
  }

  return score;
}

function eligibleForDevelopmentSurfacing(pattern: CoachingPattern): boolean {
  if (!isDisplayablePattern(pattern.strength)) return false;
  if (pattern.suppressed) return false;
  if (pattern.coachAccepted === false) return false;
  if (pattern.status === "resolved") return false;
  return true;
}

/**
 * Prioritise patterns for Prepare — max two, reviewed only, temporally bounded.
 */
export function selectPatternsForPrepare(
  patterns: CoachingPattern[],
  options?: {
    focusText?: string | null;
    limit?: number;
    /** Session number of the preparation session (exclusive upper bound). */
    beforeSessionNumber?: number;
    sessionNumbers?: Map<string, number>;
  }
): CoachingPattern[] {
  const limit = options?.limit ?? PREPARE_PATTERN_LIMIT;
  const focusTerms = (options?.focusText ?? "")
    .split(/[\s,;/|]+/)
    .map(part => part.trim())
    .filter(part => part.length >= 3);
  const beforeSessionNumber = options?.beforeSessionNumber;
  const sessionNumbers = options?.sessionNumbers;

  return patterns
    .filter(isReviewedPatternForPrepare)
    .filter(pattern => {
      if (
        typeof beforeSessionNumber === "number" &&
        sessionNumbers &&
        beforeSessionNumber > 0
      ) {
        return patternEvidenceIsBeforeSession(
          pattern,
          sessionNumbers,
          beforeSessionNumber
        );
      }
      // Without temporal context, still require reviewed acceptance and
      // refuse patterns that have no session-linked evidence.
      return distinctSessionIdsSafe(pattern).length > 0;
    })
    .map(pattern => ({
      pattern,
      score: relevanceScore(pattern, focusTerms),
    }))
    .filter(item => {
      if (focusTerms.length === 0) return true;
      return (
        item.score >= 10 ||
        focusTerms.some(term =>
          `${item.pattern.title} ${item.pattern.description}`
            .toLowerCase()
            .includes(term.toLowerCase())
        )
      );
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.pattern);
}

function distinctSessionIdsSafe(pattern: CoachingPattern): string[] {
  const ids = new Set<string>();
  for (const item of pattern.evidence ?? []) {
    const id = item.sessionId?.trim();
    if (id) ids.add(id);
  }
  return [...ids];
}

/**
 * Development primary view — max three high-value patterns by default.
 * Unchanged eligibility relative to prior Development behaviour (not Prepare).
 */
export function selectPatternsForDevelopment(
  patterns: CoachingPattern[],
  options?: { limit?: number }
): CoachingPattern[] {
  const limit = options?.limit ?? DEVELOPMENT_PATTERN_LIMIT;
  return patterns
    .filter(eligibleForDevelopmentSurfacing)
    .map(pattern => ({
      pattern,
      score: relevanceScore(pattern, []),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.pattern);
}
