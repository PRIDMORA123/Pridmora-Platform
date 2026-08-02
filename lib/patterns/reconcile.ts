import {
  countDistinctEvidence,
  evidenceFingerprint,
} from "@/lib/patterns/evidence";
import {
  classifyPatternStrength,
  derivePatternStatus,
  isDisplayablePattern,
} from "@/lib/patterns/classify";
import type {
  CoachingPattern,
  PatternCandidate,
  PatternEvidenceReference,
  PatternGenerationResult,
} from "@/lib/patterns/types";
import { INSUFFICIENT_PATTERN_MESSAGE } from "@/lib/patterns/types";

function newPatternId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pattern-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normaliseTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().toLowerCase();
}

function significantTokens(title: string): string[] {
  return normaliseTitle(title)
    .split(/[^a-z0-9]+/)
    .filter(token => token.length >= 4);
}

function titlesSimilar(a: string, b: string): boolean {
  const left = normaliseTitle(a);
  const right = normaliseTitle(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;

  const leftTokens = significantTokens(a);
  const rightTokens = significantTokens(b);
  if (leftTokens.length === 0 || rightTokens.length === 0) return false;

  const shared = leftTokens.filter(token => rightTokens.includes(token));
  const overlap =
    shared.length / Math.min(leftTokens.length, rightTokens.length);
  return overlap >= 0.5;
}

function evidenceDates(evidence: PatternEvidenceReference[]): {
  first: string | null;
  last: string | null;
} {
  const dates = evidence
    .map(item => item.sourceDate?.trim())
    .filter((value): value is string => Boolean(value))
    .sort();
  return {
    first: dates[0] ?? null,
    last: dates[dates.length - 1] ?? null,
  };
}

function hasNewEvidence(
  existing: PatternEvidenceReference[],
  next: PatternEvidenceReference[]
): boolean {
  const prior = new Set(
    existing.map(
      item => `${item.sourceType}:${item.sourceId}:${item.sessionId ?? ""}`
    )
  );
  return next.some(
    item =>
      !prior.has(
        `${item.sourceType}:${item.sourceId}:${item.sessionId ?? ""}`
      )
  );
}

/**
 * Merge AI/rule candidates with existing coach decisions.
 * - Rejected patterns are not recreated without new evidence.
 * - Coach-accepted wording is preserved; material changes become pending suggestions.
 * - Observations are retained internally but not forced as insights.
 */
export function reconcilePatterns(input: {
  relationshipId: string;
  existing: CoachingPattern[];
  candidates: PatternCandidate[];
}): PatternGenerationResult {
  const { relationshipId, existing, candidates } = input;
  const retained: CoachingPattern[] = [];
  const usedExistingIds = new Set<string>();

  for (const candidate of candidates) {
    const strength = classifyPatternStrength(candidate.evidence);
    if (!isDisplayablePattern(strength) && candidate.evidence.length <= 1) {
      // Single observation — do not promote to longitudinal pattern list
      continue;
    }

    const match = existing.find(
      pattern =>
        pattern.relationshipId === relationshipId &&
        titlesSimilar(pattern.title, candidate.title)
    );

    if (match) {
      usedExistingIds.add(match.id);
      const fingerprint = evidenceFingerprint(candidate.evidence);
      const evidenceIsNew = hasNewEvidence(match.evidence, candidate.evidence);

      if (match.suppressed || match.coachAccepted === false) {
        if (!evidenceIsNew) {
          retained.push(match);
          continue;
        }
        // New evidence after rejection — reopen as unreviewed draft
        retained.push({
          ...match,
          title: candidate.title.trim(),
          description: candidate.description.trim(),
          strength,
          status: derivePatternStatus({
            previousStatus: match.status,
            previousEvidenceCount: match.evidenceCount,
            nextEvidenceCount: countDistinctEvidence(candidate.evidence),
            sessionsSinceLastMention: 0,
            laterEvidenceSupports: true,
          }),
          evidenceCount: countDistinctEvidence(candidate.evidence),
          evidence: candidate.evidence,
          coachReviewed: false,
          coachAccepted: null,
          suppressed: false,
          evidenceFingerprint: fingerprint,
          pendingSuggestion: null,
          ...evidenceDates(candidate.evidence),
          firstObservedAt:
            match.firstObservedAt ?? evidenceDates(candidate.evidence).first,
          lastObservedAt: evidenceDates(candidate.evidence).last,
        });
        continue;
      }

      if (match.coachAccepted === true && match.coachReviewed) {
        const wordingChanged =
          normaliseTitle(match.title) !== normaliseTitle(candidate.title) ||
          match.description.trim() !== candidate.description.trim();
        const status = derivePatternStatus({
          previousStatus: match.status,
          previousEvidenceCount: match.evidenceCount,
          nextEvidenceCount: countDistinctEvidence(candidate.evidence),
          sessionsSinceLastMention: 0,
          laterEvidenceSupports:
            countDistinctEvidence(candidate.evidence) >
            match.evidenceCount,
          laterEvidenceContradicts:
            countDistinctEvidence(candidate.evidence) <
            match.evidenceCount,
        });

        if (evidenceIsNew && (wordingChanged || status !== match.status)) {
          retained.push({
            ...match,
            status,
            evidenceCount: countDistinctEvidence(candidate.evidence),
            evidence: candidate.evidence,
            evidenceFingerprint: fingerprint,
            lastObservedAt: evidenceDates(candidate.evidence).last,
            pendingSuggestion: {
              title: candidate.title.trim(),
              description: candidate.description.trim(),
              strength,
              status,
              evidence: candidate.evidence,
              changeSummary: wordingChanged
                ? "New evidence suggests updated wording. Review before replacing the accepted version."
                : "New evidence affects this accepted pattern. Review before updating.",
            },
          });
        } else if (evidenceIsNew) {
          retained.push({
            ...match,
            status,
            strength,
            evidenceCount: countDistinctEvidence(candidate.evidence),
            evidence: candidate.evidence,
            evidenceFingerprint: fingerprint,
            lastObservedAt: evidenceDates(candidate.evidence).last,
            pendingSuggestion: null,
          });
        } else {
          retained.push(match);
        }
        continue;
      }

      // Unreviewed or draft — update in place
      retained.push({
        ...match,
        title: candidate.title.trim(),
        description: candidate.description.trim(),
        strength,
        status:
          candidate.statusHint ??
          derivePatternStatus({
            previousStatus: match.status,
            previousEvidenceCount: match.evidenceCount,
            nextEvidenceCount: countDistinctEvidence(candidate.evidence),
            sessionsSinceLastMention: 0,
            laterEvidenceSupports:
              countDistinctEvidence(candidate.evidence) >
              match.evidenceCount,
          }),
        evidenceCount: countDistinctEvidence(candidate.evidence),
        evidence: candidate.evidence,
        coachReviewed: false,
        evidenceFingerprint: fingerprint,
        pendingSuggestion: null,
        firstObservedAt:
          match.firstObservedAt ?? evidenceDates(candidate.evidence).first,
        lastObservedAt: evidenceDates(candidate.evidence).last,
      });
      continue;
    }

    if (!isDisplayablePattern(strength)) continue;

    const dates = evidenceDates(candidate.evidence);
    retained.push({
      id: newPatternId(),
      relationshipId,
      title: candidate.title.trim(),
      description: candidate.description.trim(),
      strength,
      status: candidate.statusHint ?? "active",
      evidenceCount: countDistinctEvidence(candidate.evidence),
      firstObservedAt: dates.first,
      lastObservedAt: dates.last,
      evidence: candidate.evidence,
      coachReviewed: false,
      coachAccepted: null,
      coachComment: null,
      suppressed: false,
      evidenceFingerprint: evidenceFingerprint(candidate.evidence),
      pendingSuggestion: null,
    });
  }

  // Keep existing accepted/suppressed patterns not matched in this run
  for (const pattern of existing) {
    if (usedExistingIds.has(pattern.id)) continue;
    if (pattern.relationshipId !== relationshipId) continue;
    if (
      pattern.coachAccepted === true ||
      pattern.suppressed ||
      pattern.coachAccepted === false
    ) {
      retained.push(pattern);
    }
  }

  const displayable = retained.filter(pattern =>
    isDisplayablePattern(pattern.strength)
  );

  const fingerprint = evidenceFingerprint(
    displayable.flatMap(pattern => pattern.evidence)
  );

  if (displayable.length === 0) {
    return {
      patterns: retained.filter(
        pattern =>
          pattern.coachAccepted === true ||
          pattern.suppressed ||
          pattern.coachAccepted === false
      ),
      message: INSUFFICIENT_PATTERN_MESSAGE,
      evidenceFingerprint: fingerprint,
    };
  }

  return {
    patterns: retained,
    message: null,
    evidenceFingerprint: fingerprint,
  };
}

export function applyCoachPatternReview(
  pattern: CoachingPattern,
  decision: {
    action: "accept" | "reject" | "edit" | "no_longer_relevant";
    title?: string;
    description?: string;
    status?: CoachingPattern["status"];
    coachComment?: string | null;
  }
): CoachingPattern {
  if (decision.action === "reject") {
    return {
      ...pattern,
      coachReviewed: true,
      coachAccepted: false,
      suppressed: true,
      coachComment: decision.coachComment ?? pattern.coachComment ?? null,
      pendingSuggestion: null,
    };
  }

  if (decision.action === "no_longer_relevant") {
    return {
      ...pattern,
      status: "resolved",
      coachReviewed: true,
      coachAccepted: true,
      coachComment: decision.coachComment ?? pattern.coachComment ?? null,
      pendingSuggestion: null,
    };
  }

  if (decision.action === "edit") {
    const suggestion = pattern.pendingSuggestion;
    return {
      ...pattern,
      title: decision.title?.trim() || pattern.title,
      description: decision.description?.trim() || pattern.description,
      status: decision.status ?? pattern.status,
      strength: suggestion?.strength ?? pattern.strength,
      evidence: suggestion?.evidence ?? pattern.evidence,
      evidenceCount: countDistinctEvidence(
        suggestion?.evidence ?? pattern.evidence
      ),
      coachReviewed: true,
      coachAccepted: true,
      coachComment: decision.coachComment ?? pattern.coachComment ?? null,
      suppressed: false,
      pendingSuggestion: null,
    };
  }

  // accept — apply pending suggestion if present
  if (pattern.pendingSuggestion) {
    const suggestion = pattern.pendingSuggestion;
    return {
      ...pattern,
      title: suggestion.title,
      description: suggestion.description,
      strength: suggestion.strength,
      status: suggestion.status,
      evidence: suggestion.evidence,
      evidenceCount: countDistinctEvidence(suggestion.evidence),
      coachReviewed: true,
      coachAccepted: true,
      coachComment: decision.coachComment ?? pattern.coachComment ?? null,
      suppressed: false,
      pendingSuggestion: null,
      lastObservedAt: evidenceDates(suggestion.evidence).last,
    };
  }

  return {
    ...pattern,
    coachReviewed: true,
    coachAccepted: true,
    coachComment: decision.coachComment ?? pattern.coachComment ?? null,
    suppressed: false,
    pendingSuggestion: null,
  };
}

/**
 * On AI generation failure, preserve existing accepted patterns unchanged.
 */
export function preserveAcceptedOnFailure(
  existing: CoachingPattern[]
): CoachingPattern[] {
  return existing.filter(
    pattern =>
      pattern.coachAccepted === true ||
      pattern.suppressed === true ||
      pattern.coachAccepted === false
  );
}
