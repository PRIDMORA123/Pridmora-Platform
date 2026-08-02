import {
  collectPatternEvidenceFromRelationship,
} from "@/lib/patterns/collect";
import { detectPatternCandidates } from "@/lib/patterns/detect";
import { evidenceFingerprint } from "@/lib/patterns/evidence";
import {
  preserveAcceptedOnFailure,
  reconcilePatterns,
} from "@/lib/patterns/reconcile";
import type {
  AuthorisedPatternEvidencePoint,
  CoachingPattern,
  PatternCandidate,
  PatternGenerationResult,
} from "@/lib/patterns/types";
import { INSUFFICIENT_PATTERN_MESSAGE } from "@/lib/patterns/types";
import type { CoachingMoment } from "@/lib/coaching-moments/coaching-moment";
import type { SupportingContextItem } from "@/lib/relationship-meta";
import type { Session } from "@/lib/types";

export type PatternGenerationInput = {
  relationshipId: string;
  sessions: Session[];
  supportingContext?: SupportingContextItem[] | null;
  coachingMoments?: CoachingMoment[] | null;
  existingPatterns: CoachingPattern[];
  /** Optional AI/rule candidates. When omitted, deterministic detection is used. */
  candidates?: PatternCandidate[];
  /** When generation fails, preserve accepted patterns. */
  generationFailed?: boolean;
};

/**
 * Idempotent pattern analysis for one relationship.
 * Does not call the network — pass AI candidates when available.
 */
export function generateRelationshipPatterns(
  input: PatternGenerationInput
): PatternGenerationResult {
  if (input.generationFailed) {
    const preserved = preserveAcceptedOnFailure(input.existingPatterns);
    return {
      patterns: preserved,
      message:
        preserved.length > 0
          ? null
          : INSUFFICIENT_PATTERN_MESSAGE,
      evidenceFingerprint: evidenceFingerprint(
        preserved.flatMap(pattern => pattern.evidence)
      ),
    };
  }

  const points = collectPatternEvidenceFromRelationship({
    relationshipId: input.relationshipId,
    sessions: input.sessions,
    supportingContext: input.supportingContext,
    coachingMoments: input.coachingMoments,
  });

  const candidates =
    input.candidates ?? detectPatternCandidates(points);

  // Bind candidate evidence to authorised catalogue only
  const authorisedCandidates = constrainCandidatesToEvidence(
    candidates,
    points
  );

  return reconcilePatterns({
    relationshipId: input.relationshipId,
    existing: input.existingPatterns.filter(
      pattern => pattern.relationshipId === input.relationshipId
    ),
    candidates: authorisedCandidates,
  });
}

function constrainCandidatesToEvidence(
  candidates: PatternCandidate[],
  points: AuthorisedPatternEvidencePoint[]
): PatternCandidate[] {
  const allowed = new Set(points.map(point => point.sourceId));
  const byId = new Map(points.map(point => [point.sourceId, point]));

  return candidates
    .map(candidate => {
      const evidence = candidate.evidence
        .filter(ref => allowed.has(ref.sourceId))
        .map(ref => {
          const point = byId.get(ref.sourceId);
          if (!point) return ref;
          return {
            sourceType: point.sourceType,
            sourceId: point.sourceId,
            sessionId: point.sessionId ?? null,
            sourceDate: point.sourceDate ?? null,
            excerpt: null as string | null,
          };
        });
      return { ...candidate, evidence };
    })
    .filter(candidate => candidate.evidence.length > 0);
}

/**
 * Skip regeneration when evidence has not changed and patterns already exist,
 * unless the coach forces a refresh.
 */
export function shouldRegeneratePatterns(input: {
  force?: boolean;
  currentFingerprint: string;
  storedFingerprint?: string | null;
  hasPatterns: boolean;
}): boolean {
  if (input.force) return true;
  if (!input.hasPatterns && input.currentFingerprint) return true;
  if (!input.storedFingerprint) return true;
  return input.currentFingerprint !== input.storedFingerprint;
}

export function relationshipEvidenceFingerprint(input: {
  relationshipId: string;
  sessions: Session[];
  supportingContext?: SupportingContextItem[] | null;
  coachingMoments?: CoachingMoment[] | null;
}): string {
  const points = collectPatternEvidenceFromRelationship(input);
  return evidenceFingerprint(
    points.map(point => ({
      sourceType: point.sourceType,
      sourceId: point.sourceId,
      sessionId: point.sessionId,
    }))
  );
}
