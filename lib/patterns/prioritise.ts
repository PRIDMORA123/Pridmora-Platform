import type { CoachingPattern } from "@/lib/patterns/types";
import { isDisplayablePattern } from "@/lib/patterns/classify";

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

  // Deprioritise stable low-value patterns when stronger recent evidence exists
  if (
    pattern.status === "active" &&
    pattern.strength === "emerging" &&
    pattern.evidenceCount <= 2 &&
    !pattern.coachAccepted
  ) {
    score -= 1;
  }

  return score;
}

function eligibleForSurfacing(pattern: CoachingPattern): boolean {
  if (!isDisplayablePattern(pattern.strength)) return false;
  if (pattern.suppressed) return false;
  if (pattern.coachAccepted === false) return false;
  if (pattern.status === "resolved") return false;
  return true;
}

/**
 * Prioritise patterns for Prepare — max two, relevant to session focus.
 */
export function selectPatternsForPrepare(
  patterns: CoachingPattern[],
  options?: {
    focusText?: string | null;
    limit?: number;
  }
): CoachingPattern[] {
  const limit = options?.limit ?? PREPARE_PATTERN_LIMIT;
  const focusTerms = (options?.focusText ?? "")
    .split(/[\s,;/|]+/)
    .map(part => part.trim())
    .filter(part => part.length >= 3);

  return patterns
    .filter(eligibleForSurfacing)
    .map(pattern => ({
      pattern,
      score: relevanceScore(pattern, focusTerms),
    }))
    .filter(item => {
      if (focusTerms.length === 0) return true;
      // Prefer focus-relevant; still allow high-value accepted patterns
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

/**
 * Development primary view — max three high-value patterns by default.
 */
export function selectPatternsForDevelopment(
  patterns: CoachingPattern[],
  options?: { limit?: number }
): CoachingPattern[] {
  const limit = options?.limit ?? DEVELOPMENT_PATTERN_LIMIT;
  return patterns
    .filter(eligibleForSurfacing)
    .map(pattern => ({
      pattern,
      score: relevanceScore(pattern, []),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.pattern);
}
